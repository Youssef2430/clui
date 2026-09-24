#!/usr/bin/env node
// Verifies the active Apple Silicon feed and frozen legacy Clui feed on GitHub.
// Usage: node scripts/verify-update-feed.mjs [--tag v0.2.0]

import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const { owner, repo, channel } = pkg.build.publish
const legacy = JSON.parse(readFileSync(join(root, 'scripts/legacy-mac-update.json'), 'utf8'))

const tagArgIdx = process.argv.indexOf('--tag')
const tag = tagArgIdx !== -1 ? process.argv[tagArgIdx + 1] : null

const errors = []
const ok = (msg) => console.log(`✓ ${msg}`)
const fail = (msg) => { errors.push(msg); console.error(`✗ ${msg}`) }

const headers = { 'User-Agent': `${repo}-update-feed-check`, Accept: 'application/vnd.github+json' }
if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`

async function api(path) {
  const res = await fetch(`https://api.github.com${path}`, { headers })
  if (!res.ok) throw new Error(`GitHub API ${path} -> ${res.status} ${await res.text()}`)
  return res.json()
}

const release = await api(tag
  ? `/repos/${owner}/${repo}/releases/tags/${tag}`
  : `/repos/${owner}/${repo}/releases/latest`)

console.log(`Checking update feed for ${owner}/${repo} release ${release.tag_name}\n`)

const assetNames = new Map(release.assets.map((a) => [a.name, a]))
for (const [feedName, expected] of [[`${channel}-mac.yml`, release.tag_name.replace(/^v/, '')], ['latest-mac.yml', legacy.version]]) {
  const feedAsset = assetNames.get(feedName)
  if (!feedAsset) {
    fail(`release has no ${feedName} asset — electron-updater cannot see this release`)
  } else {
    const res = await fetch(feedAsset.browser_download_url, { headers: { 'User-Agent': headers['User-Agent'] } })
    if (!res.ok) {
      fail(`could not download ${feedName} (${res.status})`)
    } else {
      const feed = await res.text()
      const version = feed.match(/^version:\s*(.+)$/m)?.[1]?.trim()
      if (version !== expected) fail(`${feedName} version "${version}" != expected "${expected}"`)
      else ok(`${feedName} version is ${version}`)

      const fileBlocks = feed.match(/ {2}- url:[\s\S]*?(?=\n {2}- url:|\npath:)/g) || []
      const files = fileBlocks.map((block) => ({
        url: block.match(/url:\s*(.+)/)?.[1]?.trim(),
        sha512: block.match(/sha512:\s*(.+)/)?.[1]?.trim(),
        size: Number(block.match(/size:\s*(\d+)/)?.[1]),
      }))
      if (files.length === 0) fail(`${feedName} lists no files`)

      for (const f of files) {
        const asset = assetNames.get(f.url)
        if (!asset) { fail(`feed references "${f.url}" but it is not a release asset — updates would 404`); continue }
        if (asset.size !== f.size) { fail(`${f.url}: feed size ${f.size} != asset size ${asset.size}`); continue }
        if (!f.sha512) { fail(`${f.url}: feed entry has no sha512`); continue }
        ok(`${f.url}: asset exists, size matches`)
      }

      const zips = files.filter((f) => f.url?.endsWith('.zip'))
      if (feedName === 'latest-mac.yml') {
        if (JSON.stringify(files) !== JSON.stringify(legacy.files)) fail('legacy feed differs from pinned v0.1.17 archives')
        else ok('legacy Clui clients stay on v0.1.17; original update archives remain available')
      } else if (!zips.some(f => f.url.includes('arm64')) || files.some(f => !f.url.includes('-arm64.'))) {
        fail('active feed must contain only Apple Silicon artifacts, including an update ZIP')
      } else ok('Apple Silicon update ZIP is available')
    }
  }
}

if (errors.length > 0) {
  console.error(`\n${errors.length} problem(s) with the published update feed`)
  process.exit(1)
}
console.log('\nPublished update feed is valid — shipped apps can update to this release')
