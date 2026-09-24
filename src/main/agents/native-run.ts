import { EventEmitter } from 'node:events'
import type { NormalizedEvent, RunOptions, UsageData } from '../../shared/types'
import { CodexClient, OpenCodeClient } from './transports'
import { maskSensitiveFields } from '../hooks/permission-server'

export class NativeRun extends EventEmitter {
  sessionId: string | null = null
  startedAt = Date.now()
  toolCallCount = 0
  sawPermissionRequest = false
  finished = false
  private codex?: CodexClient
  private openCode?: OpenCodeClient
  private turnId: string | null = null
  private text = ''
  private usage: UsageData = {}
  private cost = 0
  private tools = new Map<string, number>()
  private toolInputs = new Map<string, string>()
  private textParts = new Map<string, string>()
  private pending = new Map<string, { respond: (answer: any) => Promise<void>; timer: NodeJS.Timeout }>()
  constructor(readonly options: RunOptions, private clients: { codex?: (cwd: string) => CodexClient; opencode?: (cwd: string, mode?: 'ask' | 'auto') => OpenCodeClient } = {}) { super() }
  get pid() { return this.codex?.child.pid || this.openCode?.child.pid || null }
  get stderr() { return this.codex?.stderr || this.openCode?.stderr || [] }
  emitEvent(event: NormalizedEvent) { if (!this.finished) this.emit('event', event) }
  private init(id: string, model: string, metadataOnly = false) {
    this.sessionId = id
    this.emitEvent({ type: 'session_init', sessionId: id, model, tools: [], mcpServers: [], skills: [], version: this.options.provider!, isWarmup: metadataOnly })
  }
  private chunk(text: string) { if (text) { this.text += text; this.emitEvent({ type: 'text_chunk', text }) } }
  private tool(id: string, name: string, input: unknown, result?: string, isError = false) {
    if (!this.tools.has(id)) {
      const index = this.tools.size
      this.tools.set(id, index); this.toolCallCount++
      this.emitEvent({ type: 'tool_call', toolName: name, toolId: id, index })
    }
    const inputJson = JSON.stringify(input || {})
    if (this.toolInputs.get(id) !== inputJson) {
      this.toolInputs.set(id, inputJson)
      this.emitEvent({ type: 'tool_call_update', toolId: id, partialInput: inputJson, replace: true })
    }
    if (result !== undefined) {
      this.emitEvent({ type: 'tool_result', toolId: id, result, isError })
    }
  }
  private ask(id: string, event: NormalizedEvent, respond: (answer: any) => Promise<void>, denied: unknown) {
    if (this.pending.has(id)) return
    const timer = setTimeout(() => { void this.respond(id, denied).catch(error => this.fail(error)) }, 5 * 60_000)
    this.pending.set(id, { respond, timer }); this.sawPermissionRequest = true
    this.emitEvent(event)
  }
  async respond(id: string, answer: unknown): Promise<boolean> {
    const pending = this.pending.get(id)
    if (!pending || this.finished) return false
    if (!id.includes(':')) return false
    if (typeof answer === 'string' && !['allow', 'allow-session', 'deny'].includes(answer)) return false
    await pending.respond(answer)
    clearTimeout(pending.timer); this.pending.delete(id)
    return true
  }
  private approval(id: string, name: string, input: Record<string, unknown>, respond: (answer: string) => Promise<void>) {
    if (this.options.permissionMode === 'auto') { void respond('allow').catch(e => this.fail(e)); return }
    this.ask(id, { type: 'permission_request', questionId: id, toolName: name, toolInput: maskSensitiveFields(input), options: [
      { id: 'allow', label: 'Allow once', kind: 'allow_once' }, { id: 'allow-session', label: 'Allow for session', kind: 'allow_always' }, { id: 'deny', label: 'Deny', kind: 'reject_once' },
    ] }, respond, 'deny')
  }
  private finish(code = 0, signal: string | null = null, error?: Error) {
    if (this.finished) return
    if (!code && !signal) this.emitEvent({ type: 'task_complete', result: this.text, costUsd: this.options.provider === 'codex' ? null : this.cost, durationMs: Date.now() - this.startedAt, numTurns: 1, usage: this.usage, sessionId: this.sessionId! })
    if (error) this.emitEvent({ type: 'error', message: error.message, isError: true, sessionId: this.sessionId || undefined })
    this.finished = true
    for (const p of this.pending.values()) clearTimeout(p.timer)
    this.pending.clear()
    this.codex?.close(); this.openCode?.close()
    this.emit('exit', code, signal, this.sessionId)
  }
  fail(error: unknown) { this.finish(1, null, error instanceof Error ? error : new Error(String(error))) }
  async cancel() {
    if (this.finished) return
    try {
      if (this.codex && this.sessionId && this.turnId) await this.codex.request('turn/interrupt', { threadId: this.sessionId, turnId: this.turnId }, 2000)
      if (this.openCode && this.sessionId) await this.openCode.request(`/session/${encodeURIComponent(this.sessionId)}/abort`, {}, 2000)
    } catch {}
    this.finish(0, 'SIGINT')
  }
  async start() {
    if (this.finished) return
    try { if (this.options.provider === 'codex') await this.startCodex(); else await this.startOpenCode() } catch (error) { this.fail(error) }
  }
  private async startCodex() {
    const c = this.codex = (this.clients.codex?.(this.options.projectPath) || new CodexClient(this.options.projectPath))
    c.on('closed', () => { if (!this.finished) this.fail(new Error('Codex disconnected before the turn completed')) })
    c.on('message', (m: any) => {
      try { this.codexMessage(m) } catch (error) { this.fail(error) }
    })
    await c.initialize()
    if (this.finished) return
    const config = { cwd: this.options.projectPath, model: this.options.model || null,
      approvalPolicy: this.options.permissionMode === 'auto' ? 'never' : 'untrusted',
      sandbox: 'workspace-write',
      ...(this.options.addDirs?.length ? { config: { 'sandbox_workspace_write.writable_roots': this.options.addDirs } } : {}),
    }
    const session = await c.request(this.options.sessionId ? 'thread/resume' : 'thread/start', {
      ...config, ...(this.options.sessionId ? { threadId: this.options.sessionId } : {}),
    })
    if (this.finished) return
    this.init(session.thread.id, session.model || this.options.model || 'Default')
    const input: any[] = [{ type: 'text', text: this.options.prompt, text_elements: [] }]
    for (const attachment of this.options.attachments || []) if (attachment.type === 'image') input.push({ type: 'localImage', path: attachment.path })
    const result = await c.request('turn/start', { threadId: this.sessionId, input, model: this.options.model || null })
    this.turnId = result.turn.id
  }
  private codexMessage(m: any) {
    const p = m.params || {}
    if (this.finished || (m.id === undefined && p.threadId && this.sessionId && p.threadId !== this.sessionId)) return
    if (m.id !== undefined) {
      const id = `codex:${String(m.id)}`
      const reply = async (result: unknown) => { this.codex!.send({ id: m.id, result }) }
      if (m.method === 'item/tool/requestUserInput') {
        this.ask(id, { type: 'user_input', questionId: id, questions: p.questions }, answer => reply({ answers: answer }), {})
      } else if (m.method === 'item/permissions/requestApproval') {
        this.approval(id, 'Additional permissions', p, answer => reply({ permissions: answer === 'deny' ? {} : p.permissions, scope: answer === 'allow-session' ? 'session' : 'turn' }))
      } else if (m.method.endsWith('/requestApproval')) {
        this.approval(id, m.method.includes('fileChange') ? 'File changes' : 'Command execution', p,
          answer => reply({ decision: answer === 'deny' ? 'decline' : answer === 'allow-session' ? 'acceptForSession' : 'accept' }))
      } else {
        this.codex!.send({ id: m.id, error: { code: -32601, message: `GLUI does not implement ${m.method}` } })
      }
      return
    }
    switch (m.method) {
      case 'turn/started': this.turnId = p.turn.id; break
      case 'item/agentMessage/delta': {
        this.textParts.set(p.itemId, (this.textParts.get(p.itemId) || '') + p.delta); this.chunk(p.delta); break
      }
      case 'item/started': case 'item/completed': {
        const item = p.item; const done = m.method === 'item/completed'
        if (item.type === 'agentMessage' && done) {
          const previous = this.textParts.get(item.id) || ''
          if (item.text?.startsWith(previous)) this.chunk(item.text.slice(previous.length))
          this.textParts.set(item.id, item.text || previous)
        } else if (['commandExecution', 'fileChange', 'mcpToolCall', 'dynamicToolCall', 'webSearch', 'collabAgentToolCall'].includes(item.type)) {
          this.tool(item.id, item.type === 'commandExecution' ? 'Bash' : item.type === 'fileChange' ? 'Edit' : item.tool || item.type,
            item.type === 'commandExecution' ? { command: item.command, cwd: item.cwd } : item.arguments || item,
            done ? String(item.aggregatedOutput ?? item.result?.content?.map((c: any) => c.text || '').join('\n') ?? JSON.stringify(item.changes || item.result || item)) : undefined,
            item.status === 'failed' || (item.exitCode != null && item.exitCode !== 0))
        }
        break
      }
      case 'thread/tokenUsage/updated': {
        const usage = p.tokenUsage?.last || p.tokenUsage?.total || {}
        // Codex inputTokens includes cached input; canonical usage separates it.
        this.usage = { input_tokens: Math.max(0, (usage.inputTokens || 0) - (usage.cachedInputTokens || 0) - (usage.cacheWriteInputTokens || 0)), output_tokens: usage.outputTokens, cache_read_input_tokens: usage.cachedInputTokens, cache_creation_input_tokens: usage.cacheWriteInputTokens }
        this.emitEvent({ type: 'usage', usage: this.usage }); break
      }
      case 'turn/completed':
        if (p.turn.status === 'failed') this.fail(new Error(p.turn.error?.message || 'Codex turn failed'))
        else this.finish(0, p.turn.status === 'interrupted' ? 'SIGINT' : null)
        break
      case 'error': if (!p.willRetry) this.fail(new Error(p.error?.message || p.message || 'Codex error')); break
    }
  }
  private async startOpenCode() {
    const c = this.openCode = (this.clients.opencode?.(this.options.projectPath, this.options.permissionMode) || new OpenCodeClient(this.options.projectPath, this.options.permissionMode))
    c.child.on('close', () => { if (!this.finished) this.fail(new Error('OpenCode disconnected before the turn completed')) })
    const session = this.options.sessionId
      ? await c.request(`/session/${encodeURIComponent(this.options.sessionId)}`)
      : await c.request('/session', { title: this.options.prompt.slice(0, 80) })
    if (this.finished) return
    this.init(session.id, this.options.model || 'Default')
    const childSessions = new Set<string>()
    const roles = new Map<string, string>()
    const partTypes = new Map<string, string>()
    const usageByMessage = new Map<string, any>()
    let resolvedModel = this.options.model
    let admitted = false
    const read = await c.events(event => {
      const p = event.properties || {}
      if (['session.created', 'session.updated'].includes(event.type) && (p.info?.parentID === this.sessionId || childSessions.has(p.info?.parentID))) childSessions.add(p.info.id)
      const sid = p.sessionID || p.part?.sessionID || p.info?.sessionID
      const interaction = event.type === 'permission.asked' || event.type === 'question.asked'
      if (this.finished || (sid !== this.sessionId && !(interaction && childSessions.has(sid)))) return
      if (event.type === 'message.updated') {
        roles.set(p.info.id, p.info.role)
        if (p.info.role === 'assistant') {
          admitted = true
          if (!resolvedModel && p.info.modelID) { resolvedModel = `${p.info.providerID}/${p.info.modelID}`; this.init(session.id, resolvedModel!, true) }
          if (p.info.error) { this.fail(new Error(p.info.error.data?.message || p.info.error.name)); return }
          usageByMessage.set(p.info.id, p.info)
          this.cost = 0; this.usage = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0 }
          for (const info of usageByMessage.values()) {
            this.cost += info.cost || 0
            this.usage.input_tokens! += info.tokens?.input || 0; this.usage.output_tokens! += info.tokens?.output || 0
            this.usage.cache_read_input_tokens! += info.tokens?.cache?.read || 0
          }
        }
      } else if (event.type === 'message.part.updated') {
        const part = p.part
        partTypes.set(part.id, part.type)
        if (roles.get(part.messageID) !== 'assistant') return
        if (part.type === 'text') {
          const prev = this.textParts.get(part.id) || ''
          if (part.text?.startsWith(prev)) this.chunk(part.text.slice(prev.length))
          this.textParts.set(part.id, part.text || prev)
        } else if (part.type === 'tool') {
          const state = part.state || {}
          this.tool(part.callID || part.id, part.tool, state.input,
            ['completed', 'error'].includes(state.status) ? String(state.output || state.error || '') : undefined, state.status === 'error')
        }
      } else if (event.type === 'message.part.delta' && p.field === 'text' && roles.get(p.messageID) === 'assistant' && partTypes.get(p.partID) === 'text') {
        this.textParts.set(p.partID, (this.textParts.get(p.partID) || '') + p.delta); this.chunk(p.delta)
      } else if (event.type === 'permission.asked') {
        this.approval(`opencode:${p.id}`, p.permission || 'Tool permission', p, async answer => {
          await c.request(`/permission/${encodeURIComponent(p.id)}/reply`, { reply: answer === 'deny' ? 'reject' : answer === 'allow-session' ? 'always' : 'once' })
        })
      } else if (event.type === 'question.asked') {
        this.ask(`opencode:${p.id}`, { type: 'user_input', questionId: `opencode:${p.id}`, questions: p.questions.map((q: any, i: number) => ({ ...q, id: String(i) })) }, async answers => {
          if (!Object.keys(answers).length) await c.request(`/question/${encodeURIComponent(p.id)}/reject`, {})
          else await c.request(`/question/${encodeURIComponent(p.id)}/reply`, { answers: p.questions.map((_: any, i: number) => answers[String(i)]?.answers || []) })
        }, {})
      } else if (event.type === 'session.error') this.fail(new Error(p.error?.data?.message || p.error?.name || 'OpenCode session failed'))
      else if (admitted && (event.type === 'session.idle' || (event.type === 'session.status' && p.status?.type === 'idle'))) this.finish()
    })
    void read().catch(error => { if (!this.finished) this.fail(error) })
    const model = this.options.model
    const split = model?.indexOf('/') ?? -1
    const parts: any[] = [{ type: 'text', text: this.options.prompt }]
    for (const a of this.options.attachments || []) if (a.type === 'image' && a.dataUrl) parts.push({ type: 'file', mime: a.mimeType || 'image/png', url: a.dataUrl, filename: a.name })
    await c.request(`/session/${encodeURIComponent(session.id)}/prompt_async`, {
      parts, ...(model && split > 0 ? { model: { providerID: model.slice(0, split), modelID: model.slice(split + 1) } } : {}),
    })
  }
}
