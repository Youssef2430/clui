import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { createInterface } from 'node:readline'
import { randomBytes } from 'node:crypto'
import { getCliEnv } from '../cli-env'

/** A private, owned child. Never connect to a user's existing agent process. */
export function startChild(binary: string, args: string[], cwd: string, extra?: NodeJS.ProcessEnv) {
  return spawn(binary, args, { cwd, env: getCliEnv(extra), stdio: 'pipe', detached: process.platform !== 'win32' })
}
export function stopChild(child: ChildProcessWithoutNullStreams): void {
  const kill = (signal: NodeJS.Signals) => {
    try { if (child.pid && process.platform !== 'win32') process.kill(-child.pid, signal); else child.kill(signal) } catch {}
  }
  kill('SIGTERM')
  const timer = setTimeout(() => kill('SIGKILL'), 1500)
  timer.unref()
  child.once('close', () => clearTimeout(timer))
}

export class CodexClient extends EventEmitter {
  child: ChildProcessWithoutNullStreams
  stderr: string[] = []
  private nextId = 0
  private closed = false
  private pending = new Map<number, { resolve: (value: any) => void; reject: (error: Error) => void; timer: NodeJS.Timeout }>()
  constructor(cwd: string, binary = 'codex') {
    super()
    this.child = startChild(binary, ['app-server'], cwd)
    this.child.stderr.on('data', b => { this.stderr.push(String(b)); this.stderr = this.stderr.slice(-30) })
    this.child.stdin.on('error', error => this.fail(error))
    const lines = createInterface({ input: this.child.stdout })
    lines.on('line', line => {
      let message: any
      try { message = JSON.parse(line) } catch { return }
      if (message.method) this.emit('message', message)
      else if (this.pending.has(message.id)) {
        const p = this.pending.get(message.id)!
        clearTimeout(p.timer); this.pending.delete(message.id)
        if (message.error) p.reject(new Error(message.error.message || JSON.stringify(message.error)))
        else p.resolve(message.result)
      }
    })
    this.child.once('error', error => this.fail(error))
    this.child.once('close', code => { lines.close(); this.fail(new Error(`Codex app-server exited (${code})`)); this.emit('closed', code) })
  }
  private fail(error: Error) {
    this.closed = true
    for (const p of this.pending.values()) { clearTimeout(p.timer); p.reject(error) }
    this.pending.clear()
  }
  send(value: unknown) {
    if (this.closed || !this.child.stdin.writable) throw new Error('Codex connection is closed')
    this.child.stdin.write(JSON.stringify(value) + '\n')
  }
  request(method: string, params: unknown = {}, timeout = 30000): Promise<any> {
    const id = ++this.nextId
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`Codex ${method} timed out`)) }, timeout)
      this.pending.set(id, { resolve, reject, timer })
      try { this.send({ id, method, params }) } catch (e) { clearTimeout(timer); this.pending.delete(id); reject(e) }
    })
  }
  async initialize() {
    await this.request('initialize', { clientInfo: { name: 'glui', title: 'GLUI', version: '0.2.0' }, capabilities: { experimentalApi: true } })
    this.send({ method: 'initialized', params: {} })
  }
  close() { this.fail(new Error('Codex connection closed')); stopChild(this.child) }
}

export class OpenCodeClient {
  child: ChildProcessWithoutNullStreams
  stderr: string[] = []
  private url = ''
  private password = randomBytes(32).toString('hex')
  private abort = new AbortController()
  private closed = false
  private ready: Promise<void>
  constructor(cwd: string, permissionMode: 'ask' | 'auto' = 'ask', binary = 'opencode') {
    this.child = startChild(binary, ['serve', '--hostname', '127.0.0.1', '--port', '0'], cwd, {
      OPENCODE_SERVER_PASSWORD: this.password, OPENCODE_SERVER_USERNAME: 'glui',
      OPENCODE_CONFIG_CONTENT: JSON.stringify({ permission: permissionMode === 'auto' ? 'allow' : { '*': 'ask', read: 'allow', glob: 'allow', grep: 'allow', list: 'allow', todoread: 'allow', todowrite: 'allow' } }),
    })
    this.ready = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('OpenCode server startup timed out')), 30000)
      let output = ''
      this.child.stdout.on('data', b => {
        output = (output + String(b)).slice(-8192)
        const match = output.match(/https?:\/\/127\.0\.0\.1:\d+/)
        if (match) { this.url = match[0]; clearTimeout(timer); resolve() }
      })
      this.child.stderr.on('data', b => { this.stderr.push(String(b)); this.stderr = this.stderr.slice(-30) })
      this.child.once('error', e => { clearTimeout(timer); reject(e) })
      this.child.once('close', code => { clearTimeout(timer); this.closed = true; this.abort.abort(); reject(new Error(`OpenCode exited (${code})`)) })
    })
    // Startup may fail before the caller makes its first request.
    void this.ready.catch(() => {})
  }
  async request(path: string, body?: unknown, timeout = 30000): Promise<any> {
    await this.ready
    if (this.closed) throw new Error('OpenCode connection is closed')
    const response = await fetch(this.url + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { Authorization: 'Basic ' + Buffer.from('glui:' + this.password).toString('base64'), 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.any([this.abort.signal, AbortSignal.timeout(timeout)]),
    })
    if (!response.ok) throw new Error(`OpenCode ${path}: ${response.status} ${(await response.text()).slice(0,1000)}`)
    const text = await response.text()
    return text ? JSON.parse(text) : undefined
  }
  async events(onEvent: (event: any) => void): Promise<() => Promise<void>> {
    await this.ready
    const response = await fetch(this.url + '/event', {
      headers: { Authorization: 'Basic ' + Buffer.from('glui:' + this.password).toString('base64') }, signal: this.abort.signal,
    })
    if (!response.ok || !response.body) throw new Error('Cannot subscribe to OpenCode events')
    const reader = response.body.getReader()
    // The subscription is established before the prompt is submitted.
    return async () => {
      let buffer = ''
      const decoder = new TextDecoder()
      while (!this.closed) {
        const { done, value } = await reader.read()
        if (done) { if (!this.closed) throw new Error('OpenCode event stream disconnected'); return }
        buffer = (buffer + decoder.decode(value, { stream: true })).replace(/\r\n/g, '\n')
        let boundary: number
        while ((boundary = buffer.indexOf('\n\n')) >= 0) {
          const frame = buffer.slice(0, boundary); buffer = buffer.slice(boundary + 2)
          const data = frame.split('\n').filter(l => l.startsWith('data:')).map(l => l.slice(5).trimStart()).join('\n')
          if (data) { let event: any; try { event = JSON.parse(data) } catch { continue }; onEvent(event) }
        }
        if (buffer.length > 8 * 1024 * 1024) throw new Error('OpenCode event frame exceeds size limit')
      }
    }
  }
  close() { this.closed = true; this.abort.abort(); stopChild(this.child) }
}
