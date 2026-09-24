import { app } from 'electron'
import { spawn, type ChildProcess } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { homedir } from 'node:os'
import { getCliEnv } from '../cli-env'
import type { PillAction, PillReply } from '../../../orchestrator/packages/shared/src/gluiPill'

/** Owns one V2 runtime. Its renderer shares the upstream typed RPC/atom client. */
export class WorkspaceHost extends EventEmitter {
  readonly home = process.env.GLUI_HOME || (process.env.GLUI_USER_DATA_DIR ? join(process.env.GLUI_USER_DATA_DIR, 'workspace') : join(homedir(), '.glui'))
  private child?: ChildProcess
  private ready = false
  private pending = new Map<string, { resolve(value: unknown): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout> }>()
  private closing = false
  start() {
    if (this.child || this.closing) return
    const root = resolve(__dirname, '../..')
    const workspace = join(root, 'orchestrator')
    const executable = app.isPackaged ? process.execPath : join(workspace, 'apps/desktop/node_modules/electron/dist', process.platform === 'darwin' ? 'Electron.app/Contents/MacOS/Electron' : process.platform === 'win32' ? 'electron.exe' : 'electron')
    const entry = join(workspace, 'apps/desktop/dist-electron/main.cjs')
    if (!existsSync(executable) || (!app.isPackaged && !existsSync(entry))) throw new Error('Build the GLUI workspace first: npm run build:workspace')
    const env = getCliEnv()
    for (const key of Object.keys(env)) if (key.startsWith('T3CODE_')) delete env[key]
    delete env.ELECTRON_RUN_AS_NODE
    delete env.ELECTRON_RENDERER_URL
    env.GLUI_WORKSPACE_HOST = '1'
    env.GLUI_HOME = this.home
    env.T3CODE_DISABLE_AUTO_UPDATE = '1'
    const args = app.isPackaged ? [] : [entry]
    // Ephemeral smoke profiles must not read the signed app's real Keychain.
    // Forward only an explicitly requested Chromium test switch, never in normal use.
    if (env.GLUI_TEST === '1' && env.GLUI_USER_DATA_DIR && app.commandLine.hasSwitch('use-mock-keychain')) args.push('--use-mock-keychain')
    const child = spawn(executable, args, { cwd: app.isPackaged ? homedir() : root, env, stdio: ['ignore', 'ignore', 'pipe', 'ipc'] })
    this.child = child
    let stderr = ''
    child.stderr?.on('data', chunk => { stderr = (stderr + String(chunk)).slice(-4000) })
    child.on('message', (reply: PillReply) => {
      if (reply.kind === 'thread') this.emit('thread', reply.thread)
      if (reply.kind === 'ready') { this.ready = true; this.emit('ready') }
      if (reply.kind === 'response') {
        const request = this.pending.get(reply.id)
        if (!request) return
        clearTimeout(request.timer); this.pending.delete(reply.id)
        if (reply.error) request.reject(new Error(reply.error)); else request.resolve(reply.value)
      }
    })
    const failed = (error: Error) => {
      if (this.child !== child) return
      this.child = undefined
      this.ready = false
      for (const request of this.pending.values()) { clearTimeout(request.timer); request.reject(error) }
      this.pending.clear()
      if (!this.closing) this.emit('failure', error)
    }
    child.once('error', failed)
    child.once('exit', (code, signal) => failed(new Error(`Workspace stopped (${signal ?? code}). ${stderr}`)))
  }
  request<T = unknown>(action: PillAction): Promise<T> {
    try { this.start() } catch (error) { return Promise.reject(error) }
    if (!this.child?.connected) return Promise.reject(new Error('GLUI workspace is not available'))
    const id = randomUUID()
    return new Promise<T>((resolve, reject) => {
      // The first request also waits for Electron, database migrations, and
      // provider discovery. Cold Intel/Rosetta launches can exceed 90 seconds.
      const timeout = this.ready ? 90_000 : 240_000
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error('The workspace did not acknowledge the request. Check its status before retrying.')) }, timeout)
      this.pending.set(id, { resolve: value => resolve(value as T), reject, timer })
      this.child!.send({ kind: 'request', id, action }, error => {
        if (!error) return
        clearTimeout(timer); this.pending.delete(id); reject(error)
      })
    })
  }
  shutdown() {
    this.closing = true
    const child = this.child
    if (child?.connected) child.send({ kind: 'shutdown' })
    // Disconnect also triggers the owned runtime's graceful backend shutdown.
    if (child?.connected) child.disconnect()
    for (const request of this.pending.values()) { clearTimeout(request.timer); request.reject(new Error('GLUI is shutting down')) }
    this.pending.clear()
  }
}
