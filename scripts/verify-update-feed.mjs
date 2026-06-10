#!/usr/bin/env node
// Verifies the *published* GitHub update feed that shipped apps actually poll:
//   1. the release has a latest-mac.yml asset
//   2. its version matches the release tag
//   3. every file it references exists as a release asset with the right size
//   4. zips for both arm64 and x64 are listed (what electron-updater downloads)
//
// Usage: node scripts/verify-update-feed.mjs [--tag v0.1.16]
// Defaults to the latest published release. Uses GITHUB_TOKEN if set.

import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const { owner, repo } = pkg.build.publish

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
const feedAsset = assetNames.get('latest-mac.yml')
if (!feedAsset) {
  fail('release has no latest-mac.yml asset — electron-updater cannot see this release')
} else {
  const res = await fetch(feedAsset.browser_download_url, { headers: { 'User-Agent': headers['User-Agent'] } })
  if (!res.ok) {
    fail(`could not download latest-mac.yml (${res.status})`)
  } else {
    const feed = await res.text()
    const version = feed.match(/^version:\s*(.+)$/m)?.[1]?.trim()
    const expected = release.tag_name.replace(/^v/, '')
    if (version !== expected) fail(`latest-mac.yml version "${version}" != release tag "${release.tag_name}"`)
    else ok(`feed version matches tag (${version})`)

    const fileBlocks = feed.match(/ {2}- url:[\s\S]*?(?=\n {2}- url:|\npath:)/g) || []
    const files = fileBlocks.map((block) => ({
      url: block.match(/url:\s*(.+)/)?.[1]?.trim(),
      sha512: block.match(/sha512:\s*(.+)/)?.[1]?.trim(),
      size: Number(block.match(/size:\s*(\d+)/)?.[1]),
    }))
    if (files.length === 0) fail('latest-mac.yml lists no files')

    for (const f of files) {
      const asset = assetNames.get(f.url)
      if (!asset) { fail(`feed references "${f.url}" but it is not a release asset — updates would 404`); continue }
      if (asset.size !== f.size) { fail(`${f.url}: feed size ${f.size} != asset size ${asset.size}`); continue }
      if (!f.sha512) { fail(`${f.url}: feed entry has no sha512`); continue }
      ok(`${f.url}: asset exists, size matches`)
    }

    const zips = files.filter((f) => f.url?.endsWith('.zip'))
    if (!zips.some((f) => f.url.includes('arm64'))) fail('feed has no arm64 zip — Apple Silicon users cannot update')
    if (!zips.some((f) => !f.url.includes('arm64'))) fail('feed has no x64 zip — Intel users cannot update')
    if (zips.length >= 2) ok('feed lists zips for both architectures')
  }
}

if (errors.length > 0) {
  console.error(`\n${errors.length} problem(s) with the published update feed`)
  process.exit(1)
}
console.log('\nPublished update feed is valid — shipped apps can update to this release')
