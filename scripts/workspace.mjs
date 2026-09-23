import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const workspace = join(root, 'orchestrator')
const action = process.argv[2] ?? 'start'
const extra = process.argv.slice(3)
const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version
const env = { ...process.env }
// The host coding app may itself be T3 Code. Its private launch configuration
// must never leak into the independent GLUI instance.
for (const key of Object.keys(env)) if (key.startsWith('T3CODE_')) delete env[key]
delete env.ELECTRON_RUN_AS_NODE
env.GLUI_HOME = resolve(env.GLUI_HOME?.trim() || join(homedir(), action === 'dev' ? '.glui-dev' : '.glui'))
env.T3CODE_HOME = env.GLUI_HOME
env.T3CODE_COMMIT_HASH = '5ccb2a5268f68a018b172f1eb672cdb74499a5dd'
env.T3CODE_WEB_SOURCEMAP = '0'
env.npm_config_verify_deps_before_run = 'false'
env.GITHUB_REPOSITORY = 'Youssef2430/clui'
env.GLUI_PILL_ROOT = root

// Prefer an installed Node 24 LTS when the host agent runs a different Node.
const lts = ['/opt/homebrew/opt/node@24/bin/node', '/usr/local/opt/node@24/bin/node'].find(existsSync)
const node = process.versions.node.split('.')[0] !== '24' && lts ? lts : process.execPath
env.PATH = `${dirname(node)}${process.platform === 'win32' ? ';' : ':'}${env.PATH ?? ''}`
const rustTools = join(root, '.build-tools')
if (existsSync(join(rustTools, 'cargo', 'bin', 'cargo'))) {
  env.CARGO_HOME = join(rustTools, 'cargo')
  env.RUSTUP_HOME = join(rustTools, 'rustup')
  env.PATH = `${join(env.CARGO_HOME, 'bin')}:${env.PATH}`
}

const run = (command, args, cwd = workspace) => new Promise((resolveRun, reject) => {
  const child = spawn(command, args, { cwd, env, stdio: 'inherit' })
  const forward = signal => child.kill(signal)
  const onInterrupt = () => forward('SIGINT')
  const onTerminate = () => forward('SIGTERM')
  process.on('SIGINT', onInterrupt)
  process.on('SIGTERM', onTerminate)
  const cleanup = () => {
    process.off('SIGINT', onInterrupt)
    process.off('SIGTERM', onTerminate)
  }
  child.on('error', error => { cleanup(); reject(error) })
  child.on('exit', (code, signal) => {
    cleanup()
    if (code === 0) resolveRun()
    else reject(new Error(`${command} exited ${signal ?? code}`))
  })
})
const pnpm = (...args) => run(process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm', ['--config.verify-deps-before-run=false', ...args])

try {
  switch (action) {
    case 'install':
      await pnpm('install', '--frozen-lockfile', '--filter', '@t3tools/desktop...', '--filter', 't3...', '--filter', '@t3tools/scripts...', '--filter', '@t3tools/monorepo')
      await pnpm('--filter', '@t3tools/desktop', 'run', 'ensure:electron')
      break
    case 'dev': await pnpm('run', 'dev:desktop', ...extra); break
    case 'build': await pnpm('run', 'build:desktop', ...extra); break
    case 'start': await pnpm('--filter', '@t3tools/desktop', 'start', ...extra); break
    case 'serve': await run(node, ['apps/server/dist/bin.mjs', 'serve', ...extra]); break
    case 'cli': await run(node, ['apps/server/dist/bin.mjs', ...extra]); break
    case 'typecheck':
      for (const pkg of ['@t3tools/contracts', '@t3tools/shared', '@t3tools/client-runtime', 't3', '@t3tools/web', '@t3tools/desktop'])
        await pnpm('--filter', pkg, 'run', 'typecheck')
      break
    case 'test':
      await pnpm('--filter', 't3', 'exec', 'vp', 'test', 'run', 'src/orchestration-v2', 'src/scheduledTasks', 'src/scheduling', 'src/mcp/OrchestratorMcpToolkit.integration.test.ts', 'src/mcp/OrchestratorMcpService.test.ts', 'src/mcp/OrchestratorMcpService.activity.test.ts', 'src/mcp/toolkits/orchestrator', ...extra)
      break
    case 'package':
      await run(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build:overlay'], root)
      await pnpm('run', 'build:desktop')
      await pnpm('exec', 'node', 'scripts/build-desktop-artifact.ts', '--platform', 'mac', '--target', 'dir', '--arch', process.arch, '--build-version', version, '--output-dir', join(root, 'release'), '--skip-build', ...extra)
      if (process.platform === 'darwin') {
        const artifact = join(root, 'release', process.arch === 'arm64' ? 'mac-arm64' : 'mac', 'GLUI.app')
        await run('codesign', ['--force', '--deep', '--sign', '-', '--entitlements', join(root, 'resources/entitlements.mac.plist'), artifact], root)
        await run('codesign', ['--verify', '--deep', '--strict', artifact], root)
      }
      break
    case 'dmg':
    case 'release':
      await run(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build:overlay'], root)
      await pnpm('run', 'build:desktop')
      for (const arch of action === 'release' ? ['arm64', 'x64'] : [process.arch]) {
        await pnpm('exec', 'node', 'scripts/build-desktop-artifact.ts', '--platform', 'mac', '--target', 'dmg', '--arch', arch, '--build-version', version, '--output-dir', join(root, 'release'), '--skip-build', ...(action === 'release' ? ['--signed'] : []), ...extra)
      }
      if (action === 'release') await run(node, ['scripts/merge-update-feeds.mjs'], root)
      break
    default: throw new Error(`Unknown workspace action: ${action}`)
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
}
