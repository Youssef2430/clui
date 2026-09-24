import { homedir } from 'node:os'
import { realpathSync, statSync } from 'node:fs'
import { EventEmitter } from 'node:events'
import { randomUUID } from 'node:crypto'
import { AgentRunManager } from './run-manager'
import { PermissionServer, maskSensitiveFields, type HookToolRequest, type PermissionOption } from '../hooks/permission-server'
import { loadClaudeSettingsEnv } from '../claude/settings'
import { requireProvider, type ProviderId } from '../../shared/providers'
import type { RunOptions, NormalizedEvent, TabRegistryEntry, TabStatus, HealthReport, EnrichedError } from '../../shared/types'

interface Request {
  id: string; tabId: string; options: RunOptions
  promise: Promise<void>; resolve: () => void; reject: (error: Error) => void
  token?: string; cancelled: boolean; started: boolean; sawError: boolean
}
/** The main process owns lifecycle. Adapters own protocols. Request IDs belong to one tab. */
export class ControlPlane extends EventEmitter {
  private tabs = new Map<string, TabRegistryEntry>()
  private requests = new Map<string, Request>()
  private completed = new Map<string, string>()
  private queue: Request[] = []
  private manager: AgentRunManager
  private permissions: PermissionServer
  private permissionOwners = new Map<string, string>()
  private permissionMode: 'ask' | 'auto' = 'ask'
  private ready: Promise<void>
  private closing = false
  constructor(_legacyPty = false, manager = new AgentRunManager(), permissions = new PermissionServer()) {
    super()
    this.manager = manager; this.permissions = permissions
    this.ready = this.permissions.start().then(() => {}).catch(() => {})
    this.permissions.on('permission-request', (id: string, tool: HookToolRequest, tabId: string, options: PermissionOption[]) => {
      if (!this.tabs.get(tabId)?.activeRequestId) { this.permissions.respondToPermission(id, 'deny', 'Session closed'); return }
      if (this.permissionMode === 'auto') { this.permissions.respondToPermission(id, 'allow', 'Auto mode'); return }
      this.permissionOwners.set(id, tabId)
      this.emit('event', tabId, { type: 'permission_request', questionId: id, toolName: tool.tool_name, toolInput: tool.tool_input ? maskSensitiveFields(tool.tool_input) : undefined, options } satisfies NormalizedEvent)
    })
    this.manager.on('normalized', (id: string, event: NormalizedEvent) => {
      const request = this.requests.get(id)
      const tab = request && this.tabs.get(request.tabId)
      if (!request || !tab || request.cancelled || tab.activeRequestId !== id) return
      tab.lastActivityAt = Date.now()
      if (event.type === 'session_init') { tab.providerSessionId = event.sessionId; this.status(tab.tabId, 'running') }
      if (event.type === 'error') request.sawError = true
      this.emit('event', tab.tabId, event)
    })
    this.manager.on('exit', (id: string, code: number | null, signal: string | null, session: string | null) => {
      const request = this.requests.get(id)
      if (!request) return
      const tab = this.tabs.get(request.tabId)
      if (tab && session) tab.providerSessionId = session
      if (!request.cancelled && !signal && code !== 0 && !request.sawError) this.emit('error', request.tabId, this.manager.getEnrichedError(id, code))
      this.settle(request, request.cancelled || signal ? 'idle' : code === 0 && !request.sawError ? 'completed' : 'failed')
    })
    this.manager.on('error', (id: string, error: Error) => {
      const request = this.requests.get(id)
      if (!request) return
      this.emit('error', request.tabId, { ...this.manager.getEnrichedError(id, null), message: error.message })
      this.settle(request, 'dead')
    })
  }
  createTab(provider: ProviderId = 'claude'): string {
    if (this.closing) throw new Error('GLUI is shutting down')
    const tabId = randomUUID()
    this.tabs.set(tabId, { tabId, provider: requireProvider(provider), providerSessionId: null, status: 'idle', activeRequestId: null, runPid: null, createdAt: Date.now(), lastActivityAt: Date.now(), promptCount: 0 })
    return tabId
  }
  initSession(_tabId: string) { /* Metadata discovery never sends a billable warmup prompt. */ }
  setProvider(tabId: string, provider: ProviderId) {
    const tab = this.requireTab(tabId)
    if (tab.activeRequestId || this.queue.some(r => r.tabId === tabId)) throw new Error('Stop this run before changing agents')
    if (tab.provider !== requireProvider(provider)) { tab.provider = provider; tab.providerSessionId = null; this.status(tabId, 'idle') }
  }
  resetTabSession(tabId: string) {
    const tab = this.tabs.get(tabId)
    if (!tab || tab.activeRequestId) return
    tab.providerSessionId = null
  }
  setPermissionMode(mode: 'ask' | 'auto') { this.permissionMode = mode }
  submitPrompt(tabId: string, id: string, options: RunOptions): Promise<void> {
    const tab = this.requireTab(tabId)
    if (!id || !options.prompt?.trim()) return Promise.reject(new Error('A request ID and prompt are required'))
    if (tab.provider !== requireProvider(options.provider)) return Promise.reject(new Error('Session belongs to a different agent'))
    const owner = this.completed.get(id)
    const existing = this.requests.get(id)
    if (owner || existing) {
      if ((owner || existing?.tabId) !== tabId) return Promise.reject(new Error('Request ID belongs to another tab'))
      return existing?.promise || Promise.resolve()
    }
    if (this.queue.length >= 32) return Promise.reject(new Error('Prompt queue is full'))
    let resolve!: () => void; let reject!: (error: Error) => void
    const promise = new Promise<void>((res, rej) => { resolve = res; reject = rej })
    const request: Request = { id, tabId, options: { ...options }, promise, resolve, reject, cancelled: false, started: false, sawError: false }
    this.requests.set(id, request)
    if (tab.activeRequestId) this.queue.push(request)
    else this.dispatch(request)
    return promise
  }
  private dispatch(request: Request) {
    const tab = this.requireTab(request.tabId)
    // Reserve synchronously, before hook startup or other awaits.
    tab.activeRequestId = request.id; tab.lastActivityAt = Date.now(); tab.promptCount++
    this.status(tab.tabId, tab.providerSessionId ? 'running' : 'connecting')
    void this.start(request).catch(error => {
      if (!this.requests.has(request.id)) return
      this.emit('error', request.tabId, { message: String(error.message || error), stderrTail: [], exitCode: null, elapsedMs: 0, toolCallCount: 0 } satisfies EnrichedError)
      this.settle(request, 'failed')
    })
  }
  private async start(request: Request) {
    if (request.options.provider === 'claude' || !request.options.provider) await this.ready
    const tab = this.tabs.get(request.tabId)
    if (!tab || request.cancelled || !this.requests.has(request.id)) return
    const projectPath = realpathSync(!request.options.projectPath || request.options.projectPath === '~' ? homedir() : request.options.projectPath)
    if (!statSync(projectPath).isDirectory()) throw new Error('The working directory is not a folder')
    const options: RunOptions = { ...request.options, projectPath, provider: tab.provider, permissionMode: this.permissionMode, sessionId: tab.providerSessionId || request.options.sessionId }
    if (tab.provider === 'claude') {
      if (!this.permissions.getPort() && this.permissionMode === 'ask') throw new Error('Permission service could not start. Restart GLUI to retry.')
      if (this.permissions.getPort()) {
        request.token = this.permissions.registerRun(tab.tabId, request.id, options.sessionId || null)
        options.hookSettingsPath = this.permissions.generateSettingsFile(request.token, loadClaudeSettingsEnv(options.projectPath))
      }
    }
    request.started = true
    tab.runPid = this.manager.startRun(request.id, options).pid
  }
  private settle(request: Request, state: TabStatus) {
    if (!this.requests.has(request.id)) return
    this.requests.delete(request.id)
    this.completed.set(request.id, request.tabId)
    if (this.completed.size > 512) this.completed.delete(this.completed.keys().next().value!)
    if (request.token) this.permissions.unregisterRun(request.token)
    for (const [id, owner] of this.permissionOwners) if (owner === request.tabId) this.permissionOwners.delete(id)
    const tab = this.tabs.get(request.tabId)
    if (tab?.activeRequestId === request.id) {
      tab.activeRequestId = null; tab.runPid = null; this.status(request.tabId, state)
    }
    request.resolve()
    const index = this.queue.findIndex(r => r.tabId === request.tabId)
    if (index >= 0 && this.tabs.has(request.tabId) && !this.closing) this.dispatch(this.queue.splice(index, 1)[0])
  }
  cancel(id: string): boolean {
    const request = this.requests.get(id)
    if (!request) return false
    request.cancelled = true
    const index = this.queue.indexOf(request)
    if (index >= 0) { this.queue.splice(index, 1); this.requests.delete(id); request.resolve(); return true }
    if (!request.started) { this.settle(request, 'idle'); return true }
    if (!this.manager.cancel(id)) this.settle(request, 'idle')
    return true
  }
  cancelTab(tabId: string): boolean {
    const tab = this.tabs.get(tabId)
    // Stop also clears queued prompts, so cancellation cannot launch another run.
    for (const request of [...this.queue]) if (request.tabId === tabId) this.cancel(request.id)
    return tab?.activeRequestId ? this.cancel(tab.activeRequestId) : false
  }
  closeTab(tabId: string) { this.cancelTab(tabId); this.tabs.delete(tabId) }
  retry(tabId: string, id: string, options: RunOptions) { return this.submitPrompt(tabId, id, options) }
  respondToPermission(tabId: string, id: string, option: string): boolean | Promise<boolean> {
    const tab = this.tabs.get(tabId)
    if (!tab?.activeRequestId) return false
    if (id.startsWith('hook-')) {
      if (this.permissionOwners.get(id) !== tabId) return false
      const result = this.permissions.respondToPermission(id, option)
      if (result) this.permissionOwners.delete(id)
      return result
    }
    if (tab.provider !== 'claude') return this.manager.respond(tab.activeRequestId, id, option)
    return this.manager.writeToStdin(tab.activeRequestId, { type: 'permission_response', question_id: id, option_id: option })
  }
  respondToInput(tabId: string, id: string, answers: unknown) {
    const tab = this.tabs.get(tabId)
    return tab?.activeRequestId ? this.manager.respond(tab.activeRequestId, id, answers) : Promise.resolve(false)
  }
  getHealth(): HealthReport {
    return { tabs: [...this.tabs.values()].map(t => ({ tabId: t.tabId, status: t.status, activeRequestId: t.activeRequestId, providerSessionId: t.providerSessionId, alive: !!t.activeRequestId && (this.manager.isRunning(t.activeRequestId) || !this.requests.get(t.activeRequestId)?.started) })), queueDepth: this.queue.length }
  }
  getTabStatus(id: string) { return this.tabs.get(id) }
  getClaudeInfo() { return this.manager.getClaudeInfo() }
  getEnrichedError(id: string, code: number | null) { return this.manager.getEnrichedError(id, code) }
  startBtwRun(id: string, options: RunOptions, onChunk: (text: string) => void, onDone: () => void, onError: (message: string) => void) {
    // Side questions use the same ownership, permissions and shutdown semantics.
    const tabId = this.createTab(options.provider)
    let failed = false
    const onEvent = (target: string, event: NormalizedEvent) => {
      if (target !== tabId) return
      if (event.type === 'text_chunk') onChunk(event.text)
      if (event.type === 'error') { failed = true; onError(event.message) }
      if (event.type === 'permission_request' || event.type === 'user_input') { failed = true; onError('This side question needs interaction. Ask it in a conversation tab.'); this.cancelTab(tabId) }
    }
    const onFailure = (target: string, error: EnrichedError) => { if (target === tabId) { failed = true; onError(error.message) } }
    this.on('event', onEvent); this.on('error', onFailure)
    void this.submitPrompt(tabId, id, options).then(() => { if (!failed) onDone() }).catch(error => onError(String(error))).finally(() => {
      this.off('event', onEvent); this.off('error', onFailure); this.closeTab(tabId)
    })
  }
  shutdown() { this.closing = true; for (const id of [...this.tabs.keys()]) this.closeTab(id); this.permissions.stop() }
  private requireTab(id: string) { const tab = this.tabs.get(id); if (!tab) throw new Error('Conversation tab no longer exists'); return tab }
  private status(id: string, state: TabStatus) {
    const tab = this.tabs.get(id)
    if (!tab || tab.status === state) return
    const old = tab.status; tab.status = state; this.emit('tab-status-change', id, state, old)
  }
}
