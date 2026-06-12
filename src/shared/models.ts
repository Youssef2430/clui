export type ClaudeModelOption = {
  /** Value passed to `claude --model`; null means use Claude Code's configured default. */
  id: string | null
  label: string
  /** Resolved model value from settings, when known. */
  detail?: string
  aliases?: readonly string[]
}

export type ClaudeModelSettings = {
  options: ClaudeModelOption[]
  defaultModel: string | null
}

export const EMPTY_MODEL_SETTINGS: ClaudeModelSettings = {
  options: [{ id: null, label: 'Default', aliases: ['default', 'auto', 'clear'] }],
  defaultModel: null,
}

export function getModelLabel(
  model: string | null | undefined,
  options: readonly ClaudeModelOption[] = EMPTY_MODEL_SETTINGS.options,
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
  options: readonly ClaudeModelOption[] = EMPTY_MODEL_SETTINGS.options,
): ClaudeModelOption | null {
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

export function getModelCommandValues(options: readonly ClaudeModelOption[]): string {
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

function normalizedModelValues(option: ClaudeModelOption): string[] {
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
