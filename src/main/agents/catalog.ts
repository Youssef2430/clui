import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { homedir } from 'node:os'
import { getCliEnv } from '../cli-env'
import { getClaudeModelSettings } from '../claude/settings'
import { PROVIDERS, type ProviderId, type ProviderInfo } from '../../shared/providers'
import { EMPTY_MODEL_SETTINGS, type AgentModelSettings } from '../../shared/models'
import { CodexClient, OpenCodeClient } from './transports'

export async function listProviders(): Promise<ProviderInfo[]> {
  return Promise.all((Object.keys(PROVIDERS) as ProviderId[]).map(async id => {
    try {
      const { stdout } = await promisify(execFile)(PROVIDERS[id].command, ['--version'], { env: getCliEnv(), timeout: 8000 })
      return { id, installed: true, version: stdout.trim() }
    } catch (error: any) { return { id, installed: false, version: null, error: error.code === 'ENOENT' ? 'CLI not found' : 'CLI could not start' } }
  }))
}
export async function getAgentModels(provider: ProviderId, cwd = homedir()): Promise<AgentModelSettings> {
  if (provider === 'claude') return getClaudeModelSettings(cwd)
  if (provider === 'codex') {
    const c = new CodexClient(cwd)
    try {
      await c.initialize()
      const result = await c.request('model/list', {})
      return { defaultModel: result.data.find((m: any) => m.isDefault)?.model || null, options: [
        ...EMPTY_MODEL_SETTINGS.options, ...result.data.map((m: any) => ({ id: m.model || m.id, label: m.displayName || m.model || m.id, detail: m.description })),
      ] }
    } finally { c.close() }
  }
  const c = new OpenCodeClient(cwd)
  try {
    const result = await c.request('/provider')
    const config = await c.request('/config')
    const options = [...EMPTY_MODEL_SETTINGS.options]
    for (const p of result.all || []) if (result.connected?.includes(p.id)) {
      for (const [id, m] of Object.entries(p.models || {}) as Array<[string, any]>) if (!m.modalities?.output || m.modalities.output.includes('text')) options.push({ id: `${p.id}/${id}`, label: m.name || id, detail: p.name || p.id })
    }
    return { defaultModel: config.model || null, options }
  } finally { c.close() }
}
