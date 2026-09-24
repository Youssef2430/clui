export const PROVIDERS = {
  claude: { name: 'Claude Code', command: 'claude', install: 'npm install -g @anthropic-ai/claude-code', login: 'claude', description: 'Anthropic’s coding agent', transport: 'stream-json' },
  codex: { name: 'Codex', command: 'codex', install: 'npm install -g @openai/codex', login: 'codex login', description: 'OpenAI’s coding agent', transport: 'app-server' },
  opencode: { name: 'OpenCode', command: 'opencode', install: 'npm install -g opencode-ai', login: 'opencode auth login', description: 'Your models, your workflow', transport: 'http + events' },
} as const

export type ProviderId = keyof typeof PROVIDERS
export interface ProviderInfo {
  id: ProviderId
  installed: boolean
  version: string | null
  error?: string
}
export function isProviderId(value: unknown): value is ProviderId {
  return typeof value === 'string' && Object.hasOwn(PROVIDERS, value)
}
export function requireProvider(value: unknown): ProviderId {
  if (value === undefined) return 'claude'
  if (!isProviderId(value)) throw new Error('Unknown agent provider')
  return value
}
