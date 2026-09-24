#!/usr/bin/env node
// Verifies that a packaged build is auto-update capable:
//   1. app-update.yml is embedded in each .app and points at the right GitHub repo
//   2. active and legacy feeds have the expected versions and every file they
//      lists exists on disk with the right size and sha512
//   3. at least one zip target is listed (macOS auto-update requires zip)
//
// Usage: node scripts/verify-update-artifacts.mjs

import { createHash } from 'crypto'
import { existsSync, readFileSync, readdirSync, statSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { execFileSync } from 'node:child_process'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const releaseDir = join(root, 'release')
const legacy = JSON.parse(readFileSync(join(root, 'scripts/legacy-mac-update.json'), 'utf8'))

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
  ? readdirSync(releaseDir).filter((d) => d === 'mac-arm64')
  : []
if (appDirs.length === 0) fail(`no packaged app found under ${releaseDir} (expected mac/ or mac-arm64/)`)

for (const dir of appDirs) {
  const appPath = join(releaseDir, dir, `${pkg.build.productName}.app`)
  const appUpdatePath = join(appPath, 'Contents', 'Resources', 'app-update.yml')
  if (!existsSync(appUpdatePath)) {
    fail(`${dir}: app-update.yml missing from packaged app — auto-update will not work`)
    continue
  }
  const content = readFileSync(appUpdatePath, 'utf8')
  const field = (key) => content.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'))?.[1]?.trim()
  if (field('channel') !== publish.channel) fail(`${dir}: updater must use the Apple Silicon channel ${publish.channel}`)
  if (field('provider') !== 'github') fail(`${dir}: app-update.yml provider is not github`)
  if (field('owner') !== publish.owner) fail(`${dir}: app-update.yml owner "${field('owner')}" != "${publish.owner}"`)
  if (field('repo') !== publish.repo) fail(`${dir}: app-update.yml repo "${field('repo')}" != "${publish.repo}"`)
  if (errors.length === 0) ok(`${dir}: app-update.yml present and points at ${publish.owner}/${publish.repo}`)
  if (process.platform === 'darwin') {
    try {
      const entitlements = execFileSync('codesign', ['-d', '--entitlements', ':-', appPath], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
      if (!/<key>com\.apple\.security\.device\.audio-input<\/key>\s*<true\s*\/>/.test(entitlements)) {
        fail(`${dir}: signed app is missing the microphone entitlement — voice input would stop working after updating`)
      } else ok(`${dir}: signed app preserves the microphone entitlement`)
    } catch {
      fail(`${dir}: could not inspect the signed app's entitlements`)
    }
  }
}

// The legacy feed must remain frozen; GLUI uses its dedicated ARM channel.
for (const [feedName, expectedVersion] of [[`${publish.channel}-mac.yml`, pkg.version], ['latest-mac.yml', legacy.version]]) {
  const feedPath = join(releaseDir, feedName)
  if (!existsSync(feedPath)) {
    fail(`${feedName} missing from release output — electron-updater would have no feed`)
  } else {
    const feed = readFileSync(feedPath, 'utf8')
    const version = feed.match(/^version:\s*(.+)$/m)?.[1]?.trim()
    if (version !== expectedVersion) fail(`${feedName} version "${version}" != expected "${expectedVersion}"`)
    else ok(`${feedName} version is ${version}`)

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
    if (files.length === 0) fail(`${feedName} lists no files`)

    for (const f of files) {
      const filePath = join(releaseDir, f.url)
      if (!existsSync(filePath)) { fail(`${feedName} lists ${f.url} but it does not exist in release/`); continue }
      const stat = statSync(filePath)
      if (stat.size !== f.size) { fail(`${f.url}: size mismatch (yml: ${f.size}, disk: ${stat.size})`); continue }
      const hash = createHash('sha512').update(readFileSync(filePath)).digest('base64')
      if (hash !== f.sha512) { fail(`${f.url}: sha512 mismatch — feed would fail checksum validation`); continue }
      ok(`${f.url}: exists, size and sha512 match`)
    }

    // ─── 3. zip targets (required for macOS auto-update) ───
    const zips = files.filter((f) => f.url?.endsWith('.zip'))
    if (zips.length === 0) fail(`${feedName} lists no .zip — macOS auto-update requires a zip target`)

    if (feedName === 'latest-mac.yml') {
      if (JSON.stringify(files) !== JSON.stringify(legacy.files)) fail('legacy feed differs from the pinned v0.1.17 archives')
    } else if (!zips.some(f => f.url.includes('arm64')) || files.some(f => !f.url.includes('-arm64.'))) {
      fail('active feed must contain only Apple Silicon artifacts, including an update ZIP')
    }
  }
}

if (errors.length > 0) {
  console.error(`\n${errors.length} update-feature problem(s) found`)
  process.exit(1)
}
console.log('\nUpdate artifacts verified — auto-update pipeline is intact')
