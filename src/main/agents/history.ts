import { realpathSync } from 'node:fs'
import { homedir } from 'node:os'
import type { ProviderId } from '../../shared/providers'
import type { SessionMeta, SessionLoadMessage } from '../../shared/types'
import { CodexClient, OpenCodeClient } from './transports'

export async function listAgentSessions(provider: ProviderId, projectPath?: string): Promise<SessionMeta[]> {
  if (projectPath) { try { projectPath = realpathSync(projectPath) } catch {} }
  if (provider === 'codex') {
    const c = new CodexClient(projectPath || homedir())
    try {
      await c.initialize()
      const result = await c.request('thread/list', { limit: 100, sortKey: 'updated_at', ...(projectPath ? { cwd: projectPath } : {}) })
      return result.data.map((t: any) => ({ provider, sessionId: t.id, slug: t.name || null, firstMessage: t.preview || t.name || 'Codex session', lastTimestamp: new Date(t.updatedAt * 1000).toISOString(), size: 0, projectPath: t.cwd }))
    } finally { c.close() }
  }
  const c = new OpenCodeClient(projectPath || homedir())
  try {
    const sessions = await c.request('/session' + (projectPath ? `?directory=${encodeURIComponent(projectPath)}` : ''))
    return sessions.filter((t: any) => !t.parentID && (!projectPath || t.directory === projectPath)).map((t: any) => ({ provider, sessionId: t.id, slug: t.slug || null, firstMessage: t.title || 'OpenCode session', lastTimestamp: new Date(t.time.updated).toISOString(), size: 0, projectPath: t.directory }))
  } finally { c.close() }
}
export async function loadAgentSession(provider: ProviderId, id: string, cwd = homedir()): Promise<SessionLoadMessage[]> {
  if (provider === 'codex') {
    const c = new CodexClient(cwd)
    try {
      await c.initialize()
      const result = await c.request('thread/read', { threadId: id, includeTurns: true })
      return (result.thread.turns || []).flatMap((turn: any) => (turn.items || []).flatMap((item: any) => {
        const timestamp = (result.thread.updatedAt || Date.now() / 1000) * 1000
        if (item.type === 'userMessage') return [{ role: 'user', content: item.content.map((p: any) => p.text || '').join('\n'), timestamp }]
        if (item.type === 'agentMessage') return [{ role: 'assistant', content: item.text || '', timestamp }]
        if (['commandExecution', 'fileChange', 'mcpToolCall'].includes(item.type)) return [{ role: 'tool', content: item.aggregatedOutput || JSON.stringify(item.changes || item.result || {}), toolName: item.type, toolId: item.id, timestamp }]
        return []
      }))
    } finally { c.close() }
  }
  const c = new OpenCodeClient(cwd)
  try {
    const messages = await c.request(`/session/${encodeURIComponent(id)}/message?limit=200`)
    return messages.flatMap((m: any) => m.parts.flatMap((p: any) => {
      const timestamp = m.info.time.created
      if (p.type === 'text') return [{ role: m.info.role, content: p.text, timestamp }]
      if (p.type === 'tool') return [{ role: 'tool', content: p.state?.output || p.state?.error || '', toolName: p.tool, toolId: p.callID || p.id, timestamp }]
      return []
    }))
  } finally { c.close() }
}
