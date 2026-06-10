#!/usr/bin/env node
// Verifies that a packaged build is auto-update capable:
//   1. app-update.yml is embedded in each .app and points at the right GitHub repo
//   2. latest-mac.yml exists, matches package.json version, and every file it
//      lists exists on disk with the right size and sha512
//   3. at least one zip target is listed (macOS auto-update requires zip)
//
// Usage: node scripts/verify-update-artifacts.mjs [--require-both-archs]

import { createHash } from 'crypto'
import { existsSync, readFileSync, readdirSync, statSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const releaseDir = join(root, 'release')
const requireBothArchs = process.argv.includes('--require-both-archs')

const errors = []
const ok = (msg) => console.log(`✓ ${msg}`)
const fail = (msg) => { errors.push(msg); console.error(`✗ ${msg}`) }

const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const publish = pkg.build?.publish
if (!publish || publish.provider !== 'github' || !publish.owner || !publish.repo) {
  fail('package.json build.publish must be { provider: "github", owner, repo }')
}

// ─── 1. app-update.yml inside each packaged .app ───
const appDirs = existsSync(releaseDir)
  ? readdirSync(releaseDir).filter((d) => /^mac(-arm64|-x64)?$/.test(d))
  : []
if (appDirs.length === 0) fail(`no packaged app found under ${releaseDir} (expected mac/ or mac-arm64/)`)

for (const dir of appDirs) {
  const appUpdatePath = join(releaseDir, dir, `${pkg.build.productName}.app`, 'Contents', 'Resources', 'app-update.yml')
  if (!existsSync(appUpdatePath)) {
    fail(`${dir}: app-update.yml missing from packaged app — auto-update will not work`)
    continue
  }
  const content = readFileSync(appUpdatePath, 'utf8')
  const field = (key) => content.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'))?.[1]?.trim()
  if (field('provider') !== 'github') fail(`${dir}: app-update.yml provider is not github`)
  if (field('owner') !== publish.owner) fail(`${dir}: app-update.yml owner "${field('owner')}" != "${publish.owner}"`)
  if (field('repo') !== publish.repo) fail(`${dir}: app-update.yml repo "${field('repo')}" != "${publish.repo}"`)
  if (errors.length === 0) ok(`${dir}: app-update.yml present and points at ${publish.owner}/${publish.repo}`)
}

// ─── 2. latest-mac.yml ───
const feedPath = join(releaseDir, 'latest-mac.yml')
if (!existsSync(feedPath)) {
  fail('latest-mac.yml missing from release output — electron-updater would have no feed')
} else {
  const feed = readFileSync(feedPath, 'utf8')
  const version = feed.match(/^version:\s*(.+)$/m)?.[1]?.trim()
  if (version !== pkg.version) fail(`latest-mac.yml version "${version}" != package.json version "${pkg.version}"`)
  else ok(`latest-mac.yml version matches package.json (${version})`)

  // Parse the files: list (url / sha512 / size triplets)
  const files = []
  const fileBlocks = feed.match(/ {2}- url:[\s\S]*?(?=\n {2}- url:|\npath:)/g) || []
  for (const block of fileBlocks) {
    files.push({
      url: block.match(/url:\s*(.+)/)?.[1]?.trim(),
      sha512: block.match(/sha512:\s*(.+)/)?.[1]?.trim(),
      size: Number(block.match(/size:\s*(\d+)/)?.[1]),
    })
  }
  if (files.length === 0) fail('latest-mac.yml lists no files')

  for (const f of files) {
    const filePath = join(releaseDir, f.url)
    if (!existsSync(filePath)) { fail(`latest-mac.yml lists ${f.url} but it does not exist in release/`); continue }
    const stat = statSync(filePath)
    if (stat.size !== f.size) { fail(`${f.url}: size mismatch (yml: ${f.size}, disk: ${stat.size})`); continue }
    const hash = createHash('sha512').update(readFileSync(filePath)).digest('base64')
    if (hash !== f.sha512) { fail(`${f.url}: sha512 mismatch — feed would fail checksum validation`); continue }
    ok(`${f.url}: exists, size and sha512 match`)
  }

  // ─── 3. zip targets (required for macOS auto-update) ───
  const zips = files.filter((f) => f.url?.endsWith('.zip'))
  if (zips.length === 0) fail('latest-mac.yml lists no .zip — macOS auto-update requires a zip target')

  if (requireBothArchs) {
    const hasArm = zips.some((f) => f.url.includes('arm64'))
    const hasX64 = zips.some((f) => !f.url.includes('arm64'))
    if (!hasArm) fail('latest-mac.yml has no arm64 zip — Apple Silicon users could not update')
    if (!hasX64) fail('latest-mac.yml has no x64 zip — Intel users could not update')
    if (hasArm && hasX64) ok('latest-mac.yml lists zips for both arm64 and x64')
  }
}

if (errors.length > 0) {
  console.error(`\n${errors.length} update-feature problem(s) found`)
  process.exit(1)
}
console.log('\nUpdate artifacts verified — auto-update pipeline is intact')
