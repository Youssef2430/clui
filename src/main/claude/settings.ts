import { existsSync, readFileSync } from 'fs'
import { homedir } from 'os'
import { join, resolve } from 'path'
import type { ClaudeModelOption, ClaudeModelSettings } from '../../shared/models'

type ClaudeSettingsFile = {
  env?: Record<string, unknown>
}

const DEFAULT_MODEL_ENV = [
  {
    envKey: 'ANTHROPIC_DEFAULT_OPUS_MODEL',
    id: 'opus',
    label: 'Opus default',
    aliases: ['opus', 'default opus'],
  },
  {
    envKey: 'ANTHROPIC_DEFAULT_SONNET_MODEL',
    id: 'sonnet',
    label: 'Sonnet default',
    aliases: ['sonnet', 'default sonnet'],
  },
  {
    envKey: 'ANTHROPIC_DEFAULT_HAIKU_MODEL',
    id: 'haiku',
    label: 'Haiku default',
    aliases: ['haiku', 'default haiku'],
  },
] as const

export function loadClaudeSettingsEnv(projectPath?: string): Record<string, string> {
  const env: Record<string, string> = {}

  for (const filePath of getClaudeSettingsPaths(projectPath)) {
    const settings = readClaudeSettingsFile(filePath)
    if (!settings?.env) continue

    for (const [key, value] of Object.entries(settings.env)) {
      if (typeof value === 'string') env[key] = value
      else if (typeof value === 'number' || typeof value === 'boolean') env[key] = String(value)
    }
  }

  return env
}

export function getClaudeModelSettings(projectPath?: string): ClaudeModelSettings {
  const env = loadClaudeSettingsEnv(projectPath)
  const defaultModel = env.ANTHROPIC_MODEL || null
  const options: ClaudeModelOption[] = [
    {
      id: null,
      label: 'Default',
      detail: defaultModel || undefined,
      aliases: ['default', 'auto', 'clear'],
    },
  ]

  for (const entry of DEFAULT_MODEL_ENV) {
    const detail = env[entry.envKey]
    if (!detail) continue

    options.push({
      id: entry.id,
      label: entry.label,
      detail,
      aliases: entry.aliases,
    })
  }

  return { options, defaultModel }
}

function getClaudeSettingsPaths(projectPath?: string): string[] {
  const paths = [join(homedir(), '.claude', 'settings.json')]
  const projectDir = normalizeProjectPath(projectPath)

  if (projectDir && projectDir !== homedir()) {
    paths.push(
      join(projectDir, '.claude', 'settings.json'),
      join(projectDir, '.claude', 'settings.local.json'),
    )
  }

  return paths.filter((filePath, index, all) =>
    all.indexOf(filePath) === index && existsSync(filePath),
  )
}

function normalizeProjectPath(projectPath?: string): string | null {
  if (!projectPath || projectPath === '~') return homedir()
  if (projectPath.startsWith('~/')) return resolve(homedir(), projectPath.slice(2))
  return resolve(projectPath)
}

function readClaudeSettingsFile(filePath: string): ClaudeSettingsFile | null {
  try {
    const parsed = JSON.parse(readFileSync(filePath, 'utf-8')) as ClaudeSettingsFile
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}
