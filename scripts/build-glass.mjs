import { spawnSync } from 'node:child_process'
import { mkdirSync, statSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

if (process.platform === 'darwin') {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
  const source = resolve(root, 'native/glass.mm')
  const output = resolve(root, 'resources/native/glui-glass.node')
  const built = (() => { try { return statSync(output).mtimeMs > statSync(source).mtimeMs } catch { return false } })()
  if (!built) {
    mkdirSync(dirname(output), { recursive: true })
    const build = spawnSync('xcrun', ['clang++', '-std=c++17', '-fobjc-arc', '-shared',
      '-undefined', 'dynamic_lookup', '-mmacosx-version-min=11.0', '-arch', 'arm64', '-arch', 'x86_64',
      '-I', resolve(root, 'node_modules/node-api-headers/include'), '-framework', 'AppKit',
      '-framework', 'QuartzCore', '-framework', 'CoreGraphics', source, '-o', output], { stdio: 'inherit' })
    if (build.error || build.status !== 0) {
      console.error('Native glass build failed. Install Xcode command-line tools with xcode-select --install.')
      process.exit(1)
    }
    console.log('Built GLUI native glass (Apple Silicon + Intel).')
  }
}
