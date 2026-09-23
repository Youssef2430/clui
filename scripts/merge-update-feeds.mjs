import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync, statSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version
const directory = join(root, 'release')
const files = ['arm64', 'x64'].flatMap(arch => ['zip', 'dmg'].map(ext => {
  const url = `GLUI-${version}-${arch}.${ext}`
  const path = join(directory, url)
  return { url, sha512: createHash('sha512').update(readFileSync(path)).digest('base64'), size: statSync(path).size }
}))
writeFileSync(join(directory, 'latest-mac.yml'), `version: ${version}\nfiles:\n${files.map(f => `  - url: ${f.url}\n    sha512: ${f.sha512}\n    size: ${f.size}\n`).join('')}path: ${files[0].url}\nsha512: ${files[0].sha512}\nreleaseDate: '${new Date().toISOString()}'\n`)
console.log('Combined arm64 and x64 update artifacts.')
