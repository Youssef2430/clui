import type { PillModelDescriptor, PillRuntimeMode } from "../../orchestrator/packages/shared/src/gluiPill"
export type AgentModelOption = {
  /** Native model identifier; null preserves the selected agent's configured default. */
  id: string | null
  label: string
  /** Resolved model value from settings, when known. */
  detail?: string
  aliases?: readonly string[]
  descriptors?: PillModelDescriptor[]
}

export type AgentModelSettings = {
  options: AgentModelOption[]
  defaultModel: string | null
  runtimeModes?: PillRuntimeMode[]
}

export const EMPTY_MODEL_SETTINGS: AgentModelSettings = {
  options: [{ id: null, label: 'Default', aliases: ['default', 'auto', 'clear'] }],
  defaultModel: null,
}

export function getModelLabel(
  model: string | null | undefined,
  options: readonly AgentModelOption[] = EMPTY_MODEL_SETTINGS.options,
): string {
  if (!model) return 'Default'
  const normalized = normalizeModelQuery(model)
  const match = options.find((option) =>
    normalizedModelValues(option).some((value) => value === normalized),
  )
  return match?.label || model
}

export function findModelOption(
  query: string,
  options: readonly AgentModelOption[] = EMPTY_MODEL_SETTINGS.options,
): AgentModelOption | null {
  const normalized = normalizeModelQuery(query)
  if (!normalized) return null

  const exact = options.find((option) =>
    normalizedModelValues(option).some((value) => value === normalized),
  )
  if (exact) return exact

  return options.find((option) =>
    normalizedModelValues(option).some((value) => value.includes(normalized)),
  ) || null
}

export function getModelCommandValues(options: readonly AgentModelOption[]): string {
  return options.map((option) => option.id ?? 'default').join(', ')
}

export function isMillionTokenClaudeModel(model: string | null | undefined): boolean {
  const normalized = normalizeModelQuery(model || '')
  if (!normalized) return false
  return (
    normalized.includes('[1m]') ||
    normalized === 'opus' ||
    normalized === 'sonnet' ||
    normalized.includes('opus-4') ||
    normalized.includes('sonnet-4') ||
    normalized.includes('fable')
  )
}

function normalizedModelValues(option: AgentModelOption): string[] {
  const values = [
    option.id ?? 'default',
    option.label,
    option.detail || '',
    ...(option.aliases || []),
  ]
  return values.filter(Boolean).map(normalizeModelQuery)
}

function normalizeModelQuery(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, '')
}
