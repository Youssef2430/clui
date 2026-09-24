import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync, statSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const legacy = JSON.parse(readFileSync(join(root, 'scripts/legacy-mac-update.json'), 'utf8'))
const directory = join(root, 'release')
const hash = data => createHash('sha512').update(data).digest('base64')
const manifest = (version, files, date) => `version: ${version}\nfiles:\n${files.map(f => `  - url: ${f.url}\n    sha512: ${f.sha512}\n    size: ${f.size}\n`).join('')}path: ${files[0].url}\nsha512: ${files[0].sha512}\nreleaseDate: '${date}'\n`

const files = ['zip', 'dmg'].map(ext => {
  const url = `GLUI-${pkg.version}-arm64.${ext}`
  const path = join(directory, url)
  return { url, sha512: hash(readFileSync(path)), size: statSync(path).size }
})
writeFileSync(join(directory, `${pkg.build.publish.channel}-mac.yml`), manifest(pkg.version, files, new Date().toISOString()))

// GitHub's updater resolves filenames against the latest release tag. Retain
// unchanged legacy archives there so pre-0.1.17 clients can still update.
const { owner, repo } = pkg.build.publish
for (const file of legacy.files) {
  const path = join(directory, file.url)
  let data = existsSync(path) ? readFileSync(path) : null
  if (!data || data.length !== file.size || hash(data) !== file.sha512) {
    console.log(`Retaining original legacy archive ${file.url}...`)
    const response = await fetch(`https://github.com/${owner}/${repo}/releases/download/v${legacy.version}/${file.url}`, { signal: AbortSignal.timeout(300000) })
    if (!response.ok) throw new Error(`Legacy archive download failed: ${response.status}`)
    data = Buffer.from(await response.arrayBuffer())
    if (data.length !== file.size || hash(data) !== file.sha512) throw new Error(`Legacy archive checksum mismatch: ${file.url}`)
    writeFileSync(path, data)
  }
}
writeFileSync(join(directory, 'latest-mac.yml'), manifest(legacy.version, legacy.files, legacy.releaseDate))
console.log(`Apple Silicon feed: ${pkg.version}; legacy Clui feed: ${legacy.version}.`)
