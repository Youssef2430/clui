import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { listProviders } from '../agents/catalog'
import type { SkillTarget } from './skill-store'

export async function availableSkillTargets(): Promise<SkillTarget[]> {
  // Test profiles must never install into the user's actual agent folders.
  const isolated = process.env.GLUI_TEST && process.env.GLUI_USER_DATA_DIR
  const home = isolated ? join(isolated, 'skill-home') : homedir()
  const config = isolated ? join(home, '.config') : process.env.XDG_CONFIG_HOME || join(home, '.config')
  const claude = isolated ? join(home, '.claude') : process.env.CLAUDE_CONFIG_DIR || join(home, '.claude')
  const installed = await listProviders()
  const targets: SkillTarget[] = [
    { id: 'claude', name: 'Claude Code', directory: join(claude, 'skills') },
    { id: 'codex', name: 'Codex', directory: join(home, '.agents', 'skills') },
    { id: 'opencode', name: 'OpenCode', directory: join(config, 'opencode', 'skills') },
  ].filter(t => installed.some(p => p.id === t.id && p.installed))
  // Native global discovery paths, as used by the open skills CLI (vercel-labs/skills).
  const additional = [
    ['cursor', 'Cursor', join(home, '.cursor')], ['gemini', 'Gemini CLI', join(home, '.gemini')],
    ['copilot', 'GitHub Copilot', join(home, '.copilot')], ['pi', 'Pi', join(home, '.pi', 'agent')],
    ['grok', 'Grok Build', isolated ? join(home, '.grok') : process.env.GROK_HOME || join(home, '.grok')],
    ['antigravity', 'Antigravity', join(home, '.gemini', 'antigravity')],
  ]
  for (const [id, name, path] of additional) if (existsSync(path!)) targets.push({ id: id!, name: name!, directory: join(path!, 'skills') })
  if (existsSync(join(config, 'amp'))) targets.push({ id: 'amp', name: 'Amp', directory: join(config, 'agents', 'skills') })
  return targets
}
