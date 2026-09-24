import { EventEmitter } from 'node:events'
import { randomUUID } from 'node:crypto'
import { realpathSync, statSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { WorkspaceHost } from './workspace-host'
import { requireProvider, type ProviderId } from '../../shared/providers'
import type { RunOptions, TabRegistryEntry, HealthReport, EnrichedError, SessionMeta } from '../../shared/types'
import type { PillThread } from '../../../orchestrator/packages/shared/src/gluiPill'

export class ControlPlane extends EventEmitter {
  readonly host: WorkspaceHost
  private tabs = new Map<string, TabRegistryEntry & { threadId: string; established: boolean }>()
  private attachmentPaths = new Map<string, string>()
  private snapshots = new Map<string, PillThread>()
  private permissionMode: 'ask' | 'auto' = 'ask'
  private requests = new Map<string, { tabId: string; promise: Promise<void> }>()
  constructor(_legacyPty = false, host = new WorkspaceHost()) {
    super(); this.host = host
    host.on('thread', (snapshot: PillThread) => {
      const attachmentsDir = join(this.host.home || '', 'userdata', 'attachments')
      for (const message of snapshot.messages) for (const attachment of message.attachments ?? []) {
        if (!/^[a-z0-9_-]+$/i.test(attachment.id)) continue
        let path = this.attachmentPaths.get(attachment.id)
        if (!path) { try { const name = readdirSync(attachmentsDir).find(name => name.startsWith(`${attachment.id}.`)); if (name) { path = join(attachmentsDir, name); this.attachmentPaths.set(attachment.id, path) } } catch {} }
        attachment.path = path || ''
      }
      this.snapshots.set(snapshot.threadId, snapshot)
      for (const tab of this.tabs.values()) {
        if (tab.threadId !== snapshot.threadId) continue
        tab.established = true; tab.provider = snapshot.provider
        tab.providerSessionId = `glui:${snapshot.threadId}`
        tab.activeRequestId = snapshot.activeRequestId
        tab.lastActivityAt = Date.now()
        this.status(tab.tabId, snapshot.status)
        this.emit('snapshot', tab.tabId, snapshot)
      }
      this.emit('thread', snapshot)
    })
    host.on('ready', () => {
      for (const tab of this.tabs.values()) if (tab.established) void host.request({ type: 'watch', threadId: tab.threadId }).catch(error => this.failure(tab.tabId, error))
    })
    host.on('failure', (error: Error) => {
      for (const tab of this.tabs.values()) if (tab.activeRequestId) { this.status(tab.tabId, 'dead'); this.failure(tab.tabId, error) }
    })
  }
  getModels(provider: ProviderId) { return this.host.request<import("../../shared/models").AgentModelSettings>({ type: 'catalog', provider }) }
  start() { this.host.start() }
  createTab(provider: ProviderId = 'claude') {
    const tabId = randomUUID()
    this.tabs.set(tabId, { tabId, threadId: tabId, established: false, provider: requireProvider(provider), providerSessionId: null, status: 'idle', activeRequestId: null, runPid: null, createdAt: Date.now(), lastActivityAt: Date.now(), promptCount: 0 })
    return tabId
  }
  initSession(_id: string) {}
  async setProvider(id: string, provider: ProviderId) {
    const tab = this.requireTab(id)
    if (tab.activeRequestId) throw new Error('Stop this run before changing agents')
    if (tab.established) await this.host.request({ type: 'select', threadId: tab.threadId, provider: requireProvider(provider) })
    tab.provider = provider
  }
  resetTabSession(id: string) {
    const tab = this.tabs.get(id)
    if (!tab || tab.activeRequestId) return
    if (tab.established && ![...this.tabs.values()].some(other => other.tabId !== id && other.threadId === tab.threadId)) void this.host.request({ type: 'unwatch', threadId: tab.threadId }).catch(error => this.failure(id, error))
    tab.threadId = randomUUID(); tab.established = false; tab.providerSessionId = null
  }
  setPermissionMode(mode: 'ask' | 'auto') { this.permissionMode = mode }
  async attach(id: string, sessionId: string) {
    const tab = this.requireTab(id)
    if (!sessionId.startsWith('glui:')) throw new Error('Expected a GLUI conversation')
    tab.threadId = sessionId.slice(5); tab.established = true; tab.providerSessionId = sessionId
    await this.host.request({ type: 'watch', threadId: tab.threadId })
    const existing = this.snapshots.get(tab.threadId)
    if (existing) this.emit('snapshot', id, existing)
  }
  async loadEarlierHistory(id: string) {
    const tab = this.requireTab(id)
    if (!tab.established) throw new Error('Open a saved conversation before loading earlier messages')
    await this.host.request({ type: 'load-earlier', threadId: tab.threadId })
  }
  submitPrompt(id: string, requestId: string, options: RunOptions): Promise<void> {
    const tab = this.requireTab(id)
    if (!requestId || !options.prompt.trim()) return Promise.reject(new Error('A request ID and prompt are required'))
    const previous = this.requests.get(requestId)
    if (previous) return previous.tabId === id ? previous.promise : Promise.reject(new Error('Request ID belongs to another tab'))
    const promise = (async () => {
      if (options.sessionId?.startsWith('glui:') && options.sessionId !== tab.providerSessionId) await this.attach(id, options.sessionId)
      const projectPath = realpathSync(options.projectPath === '~' || !options.projectPath ? homedir() : options.projectPath)
      if (!statSync(projectPath).isDirectory()) throw new Error('The working directory is not a folder')
      if (!tab.activeRequestId) { tab.activeRequestId = requestId; this.status(id, 'connecting') }
      tab.promptCount++
      const attachments = (options.attachments ?? []).filter(a => a.type === 'image').map(a => {
        const data = a.dataUrl ?? `data:${a.mimeType ?? 'image/png'};base64,${readFileSync(a.path).toString('base64')}`
        return { id: a.id, name: a.name, type: a.type, mimeType: a.mimeType, dataUrl: data, size: a.size ?? statSync(a.path).size }
      })
      await this.host.request({ type: 'prompt', threadId: tab.threadId, requestId, provider: tab.provider, model: options.model, modelOptions: options.modelOptions, runtimeMode: options.runtimeMode, projectPath, prompt: options.systemPrompt ? `${options.systemPrompt}\n\n${options.prompt}` : options.prompt, permissionMode: this.permissionMode, attachments, ...(options.sessionId && !options.sessionId.startsWith('glui:') ? { nativeSessionId: options.sessionId } : {}) })
      tab.established = true
    })().catch(error => { tab.activeRequestId = null; this.status(id, 'failed'); throw error })
    this.requests.set(requestId, { tabId: id, promise })
    if (this.requests.size > 512) this.requests.delete(this.requests.keys().next().value!)
    return promise
  }
  async cancel(requestId: string) {
    const id = this.requests.get(requestId)?.tabId ?? [...this.tabs.values()].find(t => t.activeRequestId === requestId)?.tabId
    return id ? this.cancelTab(id) : false
  }
  async cancelTab(id: string) {
    const tab = this.tabs.get(id)
    if (!tab?.established) return false
    await this.host.request({ type: 'stop', threadId: tab.threadId }); return true
  }
  closeTab(id: string) {
    const tab = this.tabs.get(id)
    // Closing a view does not destroy or cancel durable work.
    if (tab?.established && ![...this.tabs.values()].some(other => other.tabId !== id && other.threadId === tab.threadId)) void this.host.request({ type: 'unwatch', threadId: tab.threadId }).catch(() => {})
    this.tabs.delete(id)
  }
  retry(id: string, requestId: string, options: RunOptions) { return this.submitPrompt(id, requestId, options) }
  async respondToPermission(id: string, requestId: string, decision: string) {
    const tab = this.requireTab(id)
    await this.host.request({ type: 'respond', threadId: tab.threadId, requestId, decision }); return true
  }
  async respondToInput(id: string, requestId: string, answers: Record<string, unknown>) {
    const tab = this.requireTab(id)
    await this.host.request({ type: 'respond', threadId: tab.threadId, requestId, answers }); return true
  }
  async fork(id: string) {
    const tab = this.requireTab(id); const snapshot = this.snapshots.get(tab.threadId)
    if (!snapshot?.lastRunId) throw new Error('Send a message before branching this conversation')
    const targetId = this.createTab(tab.provider)
    try {
      await this.host.request({ type: 'fork', threadId: tab.threadId, targetThreadId: targetId, runId: snapshot.lastRunId })
      await this.attach(targetId, `glui:${targetId}`)
      return { tabId: targetId, sessionId: `glui:${targetId}`, provider: tab.provider, projectPath: snapshot.workspaceRoot }
    } catch (error) { this.tabs.delete(targetId); throw error }
  }
  async listSessions(provider?: ProviderId, projectPath?: string): Promise<SessionMeta[]> {
    if (projectPath) { try { projectPath = realpathSync(projectPath) } catch {} }
    const sessions = await this.host.request<SessionMeta[]>({ type: 'history' })
    return sessions.filter(s => (!provider || s.provider === provider) && (!projectPath || s.projectPath === projectPath)).map(s => ({ ...s, sessionId: `glui:${s.sessionId}` }))
  }
  nativeSessionId(sessionId: string | null): string | null {
    return sessionId?.startsWith('glui:') ? this.snapshots.get(sessionId.slice(5))?.nativeSessionId ?? null : sessionId
  }
  getHealth(): HealthReport { return { tabs: [...this.tabs.values()].map(t => ({ ...t, alive: t.status === 'connecting' || t.status === 'running' })), queueDepth: [...this.snapshots.values()].reduce((n, s) => n + s.queuedPrompts.length, 0) } }
  getTabStatus(id: string) { return this.tabs.get(id) }
  getClaudeInfo() { return { path: null, version: null } }
  getEnrichedError(_id: string, code: number | null): EnrichedError { return { message: 'Workspace request failed', exitCode: code, elapsedMs: 0, stderrTail: [], toolCallCount: 0 } }
  startBtwRun(id: string, options: RunOptions, onChunk: (s: string) => void, onDone: () => void, onError: (s: string) => void) {
    const tabId = this.createTab(options.provider)
    let text = ''
    const cleanup = () => { this.off('snapshot', listen); this.closeTab(tabId) }
    const listen = (target: string, snapshot: PillThread) => {
      if (target !== tabId) return
      const next = snapshot.messages.filter(m => m.role === 'assistant').map(m => m.content).join('\n')
      if (next.startsWith(text)) onChunk(next.slice(text.length)); text = next
      if (snapshot.permissions.length || snapshot.questions.length) { void this.cancelTab(tabId); onError('This question needs interaction. Open it in conversation history.'); cleanup() }
      else if (snapshot.status === 'completed') { onDone(); cleanup() }
      else if (snapshot.status === 'failed') { onError(snapshot.messages.at(-1)?.content ?? 'Side question failed'); cleanup() }
    }
    this.on('snapshot', listen)
    void this.submitPrompt(tabId, id, options).catch(error => { onError(String(error)); cleanup() })
  }
  shutdown() { this.host.shutdown() }
  private requireTab(id: string) { const tab = this.tabs.get(id); if (!tab) throw new Error('Conversation tab no longer exists'); return tab }
  private status(id: string, status: TabRegistryEntry['status']) { const tab = this.requireTab(id); const old = tab.status; tab.status = status; if (old !== status) this.emit('tab-status-change', id, status, old) }
  private failure(id: string, error: Error) { this.emit('error', id, { ...this.getEnrichedError(id, null), message: error.message }) }
}
