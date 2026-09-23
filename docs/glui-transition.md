# GLUI transition verification

The default application is the original floating pill, backed by the bundled Orchestrator V2 runtime. The optional workspace exposes advanced workflows over the same durable conversations. The [feature map](orchestrator-v2-audit.md) records the pinned reference and coverage.

## Appearance and interaction

Liquid Glass is the default black-and-white theme, with Burgundy and Tidal as the two alternatives. The new theme preference starts with Liquid Glass once; previous palette keys remain intact for rollback, and subsequent selections persist. Existing appearance, sound, and width preferences are preserved. Fresh profiles follow system appearance and retain the compact pill. The composer has a slim inset shelf for folder, model, reasoning, access, and branch. Menus support search, keyboard navigation, Escape, and outside-click dismissal. Streamed projections are coalesced and unchanged messages retain identity to avoid re-rendering old markdown.

The skills directory uses stable searchable rows, clear per-item errors, and provider link status. A real isolated install of `vercel-labs/skills/skills/find-skills` verified a complete canonical copy and working relative links in all three primary agent folders. The search, install, provider badges, and removal flow were exercised in an isolated profile. Collection labels distinguish skills that share a name within one repository.

## Runtime and package

The V2 runtime is pinned in `orchestrator/UPSTREAM.json`; it starts with the pill, with its window initially hidden. One process owns each profile, preventing duplicate schedule execution on a second launch. Canonical conversations persist separately from native CLI histories. Closing a view does not delete a conversation. Branch creation waits for the new thread to appear in the canonical history stream before returning. Scheduling requires the app to remain running.

The Mac package includes the pill, workspace, server, native dependencies, and assets. Local builds use ad-hoc signing. Release builds use Developer ID signing and notarization for both architectures, then combine their ZIP/DMG entries into one update feed. Relative framework links must remain relative when copying the staged app; `fs.copy` without `verbatimSymlinks` produces broken references into the temporary build folder.

CLI launch uses the login shell’s PATH, avoids npm-injected binaries shadowing the user’s CLI, and resolves Claude to an executable path before handing it to the SDK. This fixes fresh-profile launches that could pass detection but fail to start a turn.

Live checks also covered Codex → Claude → OpenCode handoff with inherited context, OpenCode Auto access, native continuation IDs, a persisted image attachment, and the workspace scheduling editor.

The integration smoke also checks that a second launch reuses the running app, a new branch immediately appears in history, and canonical conversations survive a full app restart.

## Repeating checks

```sh
npm run typecheck
npm test
npm run test:workspace
npm run build
npm run smoke:electron
npm run dist:local
```

Set `GLUI_PACKAGED_APP` to `release/mac-arm64/GLUI.app/Contents/MacOS/GLUI` to smoke-test the packaged API. Live provider checks are opt-in and use an isolated profile and scratch Git repository. An authenticated account and a permitted model are still required; account entitlement and expired credentials are reported rather than bypassed.

Building and testing do not publish a release or modify the user's provider authentication.
