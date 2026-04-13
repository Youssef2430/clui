#!/bin/bash
set -euo pipefail

# ─── Colors ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

info()  { echo -e "${CYAN}▸${NC} $1"; }
ok()    { echo -e "${GREEN}✓${NC} $1"; }
warn()  { echo -e "${YELLOW}⚠${NC} $1"; }
fail()  { echo -e "${RED}✗${NC} $1"; exit 1; }
header(){ echo -e "\n${BOLD}── $1 ──${NC}"; }

# ─── Preflight: required env vars ────────────────────────────────────────────
header "Preflight checks"

missing=()
[ -z "${APPLE_ID:-}" ]                    && missing+=("APPLE_ID")
[ -z "${APPLE_APP_SPECIFIC_PASSWORD:-}" ] && missing+=("APPLE_APP_SPECIFIC_PASSWORD")
[ -z "${APPLE_TEAM_ID:-}" ]               && missing+=("APPLE_TEAM_ID")
[ -z "${GH_TOKEN:-}" ]                    && missing+=("GH_TOKEN")

if [ ${#missing[@]} -gt 0 ]; then
  fail "Missing environment variables: ${missing[*]}"
fi

ok "All required env vars set"

# ─── Read version from package.json ──────────────────────────────────────────
cd "$(dirname "$0")/.."
PROJECT_ROOT="$(pwd)"

VERSION=$(node -p "require('./package.json').version")
info "Version: v${VERSION}"

# ─── Check for clean working tree ────────────────────────────────────────────
if [ -n "$(git status --porcelain)" ]; then
  warn "Working tree has uncommitted changes"
  echo ""
  git status --short
  echo ""
  read -rp "Continue anyway? [y/N] " confirm
  [[ "$confirm" =~ ^[Yy]$ ]] || exit 1
fi

# ─── Clean old artifacts ─────────────────────────────────────────────────────
header "Cleaning release directory"

RELEASE_DIR="$PROJECT_ROOT/release"
if [ -d "$RELEASE_DIR" ]; then
  info "Removing old build artifacts..."
  rm -rf "$RELEASE_DIR"
  ok "Clean slate"
else
  ok "No previous artifacts"
fi

# ─── Build ────────────────────────────────────────────────────────────────────
header "Building Clui v${VERSION}"

info "Running electron-vite build + electron-builder..."
npm run dist:dmg 2>&1 | while IFS= read -r line; do
  # Surface key electron-builder status lines
  if echo "$line" | grep -qE '(signing|notariz|building|packaging|error|Error)'; then
    echo "  $line"
  fi
done

ok "Build finished"

# ─── Verify signing & notarization (with auto-recovery) ─────────────────────
header "Verifying notarization"

RELEASE_DIR="$PROJECT_ROOT/release"
fatal_errors=0

for arch_dir in mac-arm64 mac; do
  app_path="$RELEASE_DIR/$arch_dir/Clui.app"

  if [ ! -d "$app_path" ]; then
    warn "Skipping $arch_dir (not found)"
    continue
  fi

  arch_label=$( [[ "$arch_dir" == "mac-arm64" ]] && echo "arm64" || echo "x64" )
  info "Checking ${arch_label}..."

  # ── Codesign verify ──
  if codesign --verify --deep --strict "$app_path" 2>/dev/null; then
    ok "  ${arch_label} .app — Code signature valid"
  else
    warn "  ${arch_label} .app — Code signature invalid, attempting re-sign..."
    if codesign --force --deep --strict \
        --sign "Developer ID Application: Youssef Chouay (${APPLE_TEAM_ID})" \
        --options runtime \
        --entitlements "$PROJECT_ROOT/resources/entitlements.mac.plist" \
        "$app_path" 2>/dev/null; then
      ok "  ${arch_label} .app — Re-signed successfully"
    else
      echo -e "${RED}✗${NC}  ${arch_label} .app — Re-sign FAILED (is the Developer ID cert in your keychain?)"
      fatal_errors=$((fatal_errors + 1))
      continue
    fi
  fi

  # ── Gatekeeper / notarization check ──
  spctl_out=$(spctl -a -vvv "$app_path" 2>&1) || true
  if echo "$spctl_out" | grep -q "Notarized Developer ID"; then
    ok "  ${arch_label} .app — Notarized Developer ID"
  else
    warn "  ${arch_label} .app — Not notarized, submitting to Apple..."
    notarize_out=$(
      xcrun notarytool submit "$app_path" \
        --apple-id "$APPLE_ID" \
        --password "$APPLE_APP_SPECIFIC_PASSWORD" \
        --team-id "$APPLE_TEAM_ID" \
        --wait 2>&1
    ) || true

    if echo "$notarize_out" | grep -qi "accepted\|success"; then
      ok "  ${arch_label} .app — Notarization accepted by Apple"
    else
      echo -e "${RED}✗${NC}  ${arch_label} .app — Notarization REJECTED by Apple"
      echo "$notarize_out" | sed 's/^/    /'
      fatal_errors=$((fatal_errors + 1))
      continue
    fi
  fi

  # ── Staple check ──
  staple_out=$(stapler validate "$app_path" 2>&1) || true
  if echo "$staple_out" | grep -q "worked"; then
    ok "  ${arch_label} .app — Ticket stapled"
  else
    warn "  ${arch_label} .app — Ticket not stapled, stapling now..."
    if xcrun stapler staple "$app_path" 2>/dev/null; then
      ok "  ${arch_label} .app — Stapled successfully"
    else
      echo -e "${RED}✗${NC}  ${arch_label} .app — Stapling FAILED"
      fatal_errors=$((fatal_errors + 1))
    fi
  fi
done

# ── Staple DMGs for current version (best-effort, not fatal) ──
info "Checking DMGs..."
for dmg in "$RELEASE_DIR"/Clui-"${VERSION}"*.dmg; do
  [ -f "$dmg" ] || continue
  dmg_name=$(basename "$dmg")
  staple_out=$(stapler validate "$dmg" 2>&1) || true
  if echo "$staple_out" | grep -q "worked"; then
    ok "  ${dmg_name} — Ticket stapled"
  else
    warn "  ${dmg_name} — Not stapled, attempting staple..."
    if xcrun stapler staple "$dmg" 2>/dev/null; then
      ok "  ${dmg_name} — Stapled successfully"
    else
      warn "  ${dmg_name} — Could not staple DMG (app inside is still notarized, this is non-fatal)"
    fi
  fi
done

if [ "$fatal_errors" -gt 0 ]; then
  fail "Verification failed with $fatal_errors fatal error(s). Aborting publish."
fi

ok "All checks passed"

# ─── Publish to GitHub ────────────────────────────────────────────────────────
header "Publishing to GitHub"

TAG="v${VERSION}"

# Create the release if it doesn't exist yet
if gh release view "$TAG" --repo "Youssef2430/clui" &>/dev/null; then
  ok "Release ${TAG} already exists, will replace duplicate assets"
else
  info "Creating release ${TAG}..."
  gh release create "$TAG" \
    --repo "Youssef2430/clui" \
    --title "Clui ${TAG}" \
    --generate-notes
  ok "Release ${TAG} created"
fi

# Collect only current version's artifacts
artifacts=()
for f in \
  "$RELEASE_DIR"/Clui-"${VERSION}"*.dmg \
  "$RELEASE_DIR"/Clui-"${VERSION}"*-mac*.zip \
  "$RELEASE_DIR"/Clui-"${VERSION}"*.blockmap \
  "$RELEASE_DIR"/latest-mac.yml; do
  [ -f "$f" ] && artifacts+=("$f")
done

if [ ${#artifacts[@]} -eq 0 ]; then
  fail "No artifacts found in $RELEASE_DIR"
fi

info "Uploading ${#artifacts[@]} artifact(s)..."
gh release upload "$TAG" \
  --repo "Youssef2430/clui" \
  --clobber \
  "${artifacts[@]}"

ok "Published to GitHub"

# ─── Done ─────────────────────────────────────────────────────────────────────
header "Done"
echo -e "${GREEN}${BOLD}Clui v${VERSION} built, notarized, and published successfully!${NC}"
echo ""
echo "  Release: https://github.com/Youssef2430/clui/releases/tag/v${VERSION}"
echo ""
