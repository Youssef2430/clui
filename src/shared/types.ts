import type { PillContextChange, PillMessage, PillModelOptions, PillRuntimeMode } from "../../orchestrator/packages/shared/src/gluiPill"
import type { ProviderId } from './providers'
// ─── Claude Code Stream Event Types (verified from v2.1.63) ───

export interface BaseSystemEvent {
  type: 'system'
  subtype: string
  session_id?: string
  uuid: string
  [key: string]: unknown
}

export interface InitEvent extends BaseSystemEvent {
  subtype: 'init'
  cwd: string
  session_id: string
  tools: string[]
  mcp_servers: Array<{ name: string; status: string }>
  model: string
  permissionMode: string
  agents: string[]
  skills: string[]
  plugins: string[]
  claude_code_version: string
  fast_mode_state: string
  uuid: string
}

export interface StatusEvent extends BaseSystemEvent {
  subtype: 'status'
  message?: string
  status?: string
  compact_result?: string
  content?: string
  data?: {
    message?: string
    status?: string
    compact_result?: string
    content?: string
    [key: string]: unknown
  }
}

export interface CompactBoundaryEvent extends BaseSystemEvent {
  subtype: 'compact_boundary'
  message?: string
  summary?: string
  content?: string
  trigger?: string
  compacted_messages?: number
  compact_metadata?: {
    trigger?: string
    pre_tokens?: number
    post_tokens?: number
    duration_ms?: number
    [key: string]: unknown
  }
  data?: {
    message?: string
    summary?: string
    content?: string
    trigger?: string
    compacted_messages?: number
    compact_metadata?: {
      trigger?: string
      pre_tokens?: number
      post_tokens?: number
      duration_ms?: number
      [key: string]: unknown
    }
    [key: string]: unknown
  }
}

export interface StreamEvent {
  type: 'stream_event'
  event: StreamSubEvent
  session_id: string
  parent_tool_use_id: string | null
  uuid: string
}

export type StreamSubEvent =
  | { type: 'message_start'; message: AssistantMessagePayload }
  | { type: 'content_block_start'; index: number; content_block: ContentBlock }
  | { type: 'content_block_delta'; index: number; delta: ContentDelta }
  | { type: 'content_block_stop'; index: number }
  | { type: 'message_delta'; delta: { stop_reason: string | null }; usage: UsageData; context_management?: unknown }
  | { type: 'message_stop' }

export interface ContentBlock {
  type: 'text' | 'tool_use'
  text?: string
  id?: string
  name?: string
  input?: Record<string, unknown>
}

export type ContentDelta =
  | { type: 'text_delta'; text: string }
  | { type: 'input_json_delta'; partial_json: string }

export interface AssistantEvent {
  type: 'assistant'
  message: AssistantMessagePayload
  parent_tool_use_id: string | null
  session_id: string
  uuid: string
}

export interface AssistantMessagePayload {
  model: string
  id: string
  role: 'assistant'
  content: ContentBlock[]
  stop_reason: string | null
  usage: UsageData
}

export interface RateLimitEvent {
  type: 'rate_limit_event'
  rate_limit_info: {
    status: string
    resetsAt: number
    rateLimitType: string
  }
  session_id: string
  uuid: string
}

export interface ResultEvent {
  type: 'result'
  subtype: 'success' | 'error'
  is_error: boolean
  duration_ms: number
  num_turns: number
  result: string
  total_cost_usd: number
  session_id: string
  usage: UsageData & {
    input_tokens: number
    output_tokens: number
    cache_read_input_tokens?: number
    cache_creation_input_tokens?: number
  }
  permission_denials: string[]
  uuid: string
}

export interface UsageData {
  input_tokens?: number
  output_tokens?: number
  cache_read_input_tokens?: number
  cache_creation_input_tokens?: number
  service_tier?: string
}

export interface PermissionEvent {
  type: 'permission_request'
  tool: { name: string; description?: string; input?: Record<string, unknown> }
  question_id: string
  options: Array<{ id: string; label: string; kind?: string }>
  session_id: string
  uuid: string
}

export interface UserEvent {
  type: 'user'
  message?: {
    role?: 'user'
    content?: string | Array<{ type?: string; text?: string; [key: string]: unknown }>
  }
  session_id?: string
  parent_tool_use_id?: string | null
  timestamp?: string
  isReplay?: boolean
  isSynthetic?: boolean
  uuid?: string
}

// Union of all possible top-level events
export type ClaudeEvent = InitEvent | StatusEvent | CompactBoundaryEvent | StreamEvent | AssistantEvent | RateLimitEvent | ResultEvent | PermissionEvent | UserEvent | UnknownEvent

export interface UnknownEvent {
  type: string
  [key: string]: unknown
}

// ─── Tab State Machine (v2 — from execution plan) ───

export type TabStatus = 'connecting' | 'idle' | 'running' | 'completed' | 'failed' | 'dead'

export interface PermissionRequest {
  questionId: string
  toolTitle: string
  toolDescription?: string
  toolInput?: Record<string, unknown>
  options: Array<{ optionId: string; kind?: string; label: string }>
}

export interface Attachment {
  id: string
  type: 'image' | 'file'
  name: string
  path: string
  mimeType?: string
  /** Base64 data URL for image previews */
  dataUrl?: string
  /** File size in bytes */
  size?: number
}

export interface TabState {
  provider: ProviderId
  preferredModel: string | null
  modelOptions?: PillModelOptions
  runtimeMode?: PillRuntimeMode
  id: string
  providerSessionId: string | null
  status: TabStatus
  activeRequestId: string | null
  hasUnread: boolean
  currentActivity: string
  permissionQueue: PermissionRequest[]
  inputRequests: Array<Extract<NormalizedEvent, { type: 'user_input' }>>
  /** Fallback card when tools were denied and no interactive permission is available */
  permissionDenied: { tools: Array<{ toolName: string; toolUseId: string }> } | null
  attachments: Attachment[]
  messages: Message[]
  title: string
  /** Last run's result data (cost, tokens, duration) */
  lastResult: RunResult | null
  /** Session metadata from init event */
  sessionModel: string | null
  sessionTools: string[]
  sessionMcpServers: Array<{ name: string; status: string }>
  sessionSkills: string[]
  sessionVersion: string | null
  /** Prompts waiting behind the current run (display text + optional attachments) */
  queuedPrompts: Array<{ prompt: string; attachments?: Attachment[] }>
  /** Working directory for this tab's Claude sessions */
  workingDirectory: string
  /** Whether the user explicitly chose a directory (vs. using default home) */
  hasChosenDirectory: boolean
  /** Extra directories accessible via --add-dir (session-preserving) */
  additionalDirs: string[]
  /** Live todo/task state built from TodoWrite tool completions */
  todos: Record<string, TodoTask>
  /** Message ID of the injected TodoCard system message, updated in-place */
  todoMessageId: string | null
  /** True while Claude is compacting the conversation for the current run */
  isCompacting: boolean
  /** Message ID of the live compaction notice, updated in-place */
  compactionMessageId: string | null
}

export interface Message {
  id: string
  role: 'user' | 'assistant' | 'tool' | 'system'
  content: string
  toolName?: string
  toolInput?: string
  toolId?: string
  toolResult?: string
  toolStatus?: 'running' | 'completed' | 'error'
  timestamp: number
  /** Attachments sent with this user message (images / files) */
  attachments?: Attachment[]
  contextChange?: PillContextChange
  toolKind?: PillMessage['toolKind']
  toolState?: string
  sources?: PillMessage['sources']
}

export interface RunResult {
  totalCostUsd: number | null
  durationMs: number
  numTurns: number
  usage: UsageData
  sessionId: string
}

// ─── Terminal Integration ───

export type TerminalId = string
export type PreferredTerminalId = 'auto' | TerminalId

export interface TerminalInstallation {
  id: TerminalId
  label: string
}

// ─── Todo/Task State ───

export interface TodoTask {
  id: string
  subject: string
  description?: string
  status: 'pending' | 'in_progress' | 'completed' | 'deleted'
  blockedBy?: string[]
  blocks?: string[]
}

// ─── Canonical Events (normalized from raw stream) ───

export type NormalizedEvent =
  | { type: 'session_init'; sessionId: string; tools: string[]; model: string; mcpServers: Array<{ name: string; status: string }>; skills: string[]; version: string; isWarmup?: boolean }
  | { type: 'status_update'; message: string; sessionId?: string | null; status?: string; isCompaction?: boolean }
  | { type: 'compact_boundary'; sessionId?: string | null; summary?: string; trigger?: string; compactedMessages?: number }
  | { type: 'text_chunk'; text: string; parentToolUseId?: string | null }
  | { type: 'tool_call'; toolName: string; toolId: string; index: number; parentToolUseId?: string | null }
  | { type: 'tool_call_update'; toolId: string; partialInput: string; replace?: boolean; parentToolUseId?: string | null }
  | { type: 'tool_result'; toolId: string; result: string; isError?: boolean }
  | { type: 'user_input'; questionId: string; questions: Array<{ id: string; question: string; options?: Array<{ label: string; description?: string }>; multiple?: boolean; isSecret?: boolean }> }
  | { type: 'tool_call_complete'; index: number; parentToolUseId?: string | null }
  | { type: 'agent_progress'; toolUseId: string; content: string }
  | { type: 'task_update'; message: AssistantMessagePayload }
  | { type: 'task_complete'; result: string; costUsd: number | null; durationMs: number; numTurns: number; usage: UsageData; sessionId: string; permissionDenials?: Array<{ toolName: string; toolUseId: string }> }
  | { type: 'error'; message: string; isError: boolean; sessionId?: string }
  | { type: 'session_dead'; exitCode: number | null; signal: string | null; stderrTail: string[] }
  | { type: 'rate_limit'; status: string; resetsAt: number; rateLimitType: string }
  | { type: 'usage'; usage: UsageData }
  | { type: 'permission_request'; questionId: string; toolName: string; toolDescription?: string; toolInput?: Record<string, unknown>; options: Array<{ id: string; label: string; kind?: string }> }

// ─── BTW Side Question ───

export interface BtwOptions {
  modelOptions?: PillModelOptions
  runtimeMode?: PillRuntimeMode
  provider?: ProviderId
  model?: string
  btwId: string
  question: string
  projectPath: string
}

export interface BtwEvent {
  btwId: string
  type: 'chunk' | 'done' | 'error'
  text?: string
  errorMessage?: string
}

// ─── Run Options ───

export interface RunOptions {
  modelOptions?: PillModelOptions
  runtimeMode?: PillRuntimeMode
  provider?: ProviderId
  permissionMode?: 'ask' | 'auto'
  attachments?: Attachment[]
  prompt: string
  projectPath: string
  sessionId?: string
  allowedTools?: string[]
  maxTurns?: number
  maxBudgetUsd?: number
  systemPrompt?: string
  model?: string
  /** Path to GLUI-scoped settings file with hook config (passed via --settings) */
  hookSettingsPath?: string
  /** Extra directories to add via --add-dir (session-preserving) */
  addDirs?: string[]
}

// ─── Control Plane Types ───

export interface TabRegistryEntry {
  provider: ProviderId
  tabId: string
  providerSessionId: string | null
  status: TabStatus
  activeRequestId: string | null
  runPid: number | null
  createdAt: number
  lastActivityAt: number
  promptCount: number
}

export interface HealthReport {
  tabs: Array<{
    tabId: string
    status: TabStatus
    activeRequestId: string | null
    providerSessionId: string | null
    alive: boolean
  }>
  queueDepth: number
}

export interface EnrichedError {
  message: string
  stderrTail: string[]
  stdoutTail?: string[]
  exitCode: number | null
  elapsedMs: number
  toolCallCount: number
  sawPermissionRequest?: boolean
  permissionDenials?: Array<{ tool_name: string; tool_use_id: string }>
}

// ─── Search ───

export interface SearchResult {
  provider?: ProviderId
  sessionId: string
  projectPath: string
  score: number
  snippet: string
  firstMessage: string | null
  lastTimestamp: string
  slug: string | null
}

export interface SearchIndexStatus {
  state: 'idle' | 'downloading' | 'indexing' | 'ready' | 'error'
  indexed?: number
  total?: number
  progress?: number  // 0-100, used during 'downloading' state
  error?: string
}

// ─── Session History ───

export interface SessionMeta {
  provider?: ProviderId
  sessionId: string
  slug: string | null
  firstMessage: string | null
  lastTimestamp: string
  size: number
  /** Project identifier — a real filesystem path (from LIST_SESSIONS) or
   *  an encoded directory name like "-Users-foo-bar" (from LIST_ALL_SESSIONS). */
  projectPath?: string
}

export interface SessionLoadMessage {
  role: string
  content: string
  toolName?: string
  toolId?: string
  timestamp: number
}

// ─── Marketplace / Plugin Types ───

export type PluginStatus = 'not_installed' | 'checking' | 'removing' | 'installing' | 'installed' | 'failed'

export interface CatalogPlugin {
  installedProviders?: string[]
  managed?: boolean
  revision?: string
  id: string              // unique: `${repo}/${skillPath}` e.g. 'anthropics/skills/skills/xlsx'
  name: string            // from SKILL.md or plugin.json
  description: string     // from SKILL.md or plugin.json
  version: string         // from plugin.json or '0.0.0'
  author: string          // from plugin.json or marketplace entry
  marketplace: string     // marketplace name from marketplace.json
  repo: string            // 'anthropics/skills'
  sourcePath: string      // path within repo, e.g. 'skills/xlsx'
  installName: string     // individual skill name for SKILL.md skills, bundle name for CLI plugins
  category: string        // 'Agent Skills' | 'Knowledge Work' | 'Financial Services'
  tags: string[]          // Semantic use-case tags derived from name/description (e.g. 'Design', 'Finance')
  isSkillMd: boolean      // true = individual SKILL.md (direct install), false = CLI plugin (bundle install)
}

// ─── Overlay Window Geometry Constants ───
// Single source of truth shared between main and renderer to prevent snap/clamp drift.

export const OVERLAY_BAR_WIDTH = 1040
export const OVERLAY_PILL_HEIGHT = 720
export const OVERLAY_PILL_BOTTOM_MARGIN = 24

// ─── IPC Channel Names ───

export const IPC = {
  WORKSPACE_INFO: 'glui:workspace-info',
  THREAD_SNAPSHOT: 'glui:thread-snapshot',
  ATTACH_THREAD: 'glui:attach-thread',
  FORK_THREAD: 'glui:fork-thread',
  WORKSPACE_HISTORY: 'glui:workspace-history',
  LIST_PROVIDERS: 'glui:list-providers',
  SET_PROVIDER: 'glui:set-provider',
  RESPOND_INPUT: 'glui:respond-input',
  // Request-response (renderer → main)
  START: 'glui:start',
  CREATE_TAB: 'glui:create-tab',
  PROMPT: 'glui:prompt',
  CANCEL: 'glui:cancel',
  STOP_TAB: 'glui:stop-tab',
  RETRY: 'glui:retry',
  STATUS: 'glui:status',
  TAB_HEALTH: 'glui:tab-health',
  CLOSE_TAB: 'glui:close-tab',
  SELECT_DIRECTORY: 'glui:select-directory',
  OPEN_EXTERNAL: 'glui:open-external',
  OPEN_IN_TERMINAL: 'glui:open-in-terminal',
  LIST_INSTALLED_TERMINALS: 'glui:list-installed-terminals',
  ATTACH_FILES: 'glui:attach-files',
  TAKE_SCREENSHOT: 'glui:take-screenshot',
  TRANSCRIBE_AUDIO: 'glui:transcribe-audio',
  PASTE_IMAGE: 'glui:paste-image',
  GET_DIAGNOSTICS: 'glui:get-diagnostics',
  RESPOND_PERMISSION: 'glui:respond-permission',
  INIT_SESSION: 'glui:init-session',
  RESET_TAB_SESSION: 'glui:reset-tab-session',
  ANIMATE_HEIGHT: 'glui:animate-height',
  LIST_SESSIONS: 'glui:list-sessions',
  LIST_ALL_SESSIONS: 'glui:list-all-sessions',
  LOAD_SESSION: 'glui:load-session',
  GET_TOOL_RESULTS: 'glui:get-tool-results',
  GET_CONTEXT: 'glui:get-context',
  GET_MODEL_SETTINGS: 'glui:get-model-settings',
  LIST_DIR: 'glui:list-dir',

  // One-way events (main → renderer)
  TEXT_CHUNK: 'glui:text-chunk',
  TOOL_CALL: 'glui:tool-call',
  TOOL_CALL_UPDATE: 'glui:tool-call-update',
  TOOL_CALL_COMPLETE: 'glui:tool-call-complete',
  TASK_UPDATE: 'glui:task-update',
  TASK_COMPLETE: 'glui:task-complete',
  SESSION_DEAD: 'glui:session-dead',
  SESSION_INIT: 'glui:session-init',
  ERROR: 'glui:error',
  RATE_LIMIT: 'glui:rate-limit',

  // Window management
  RESIZE_HEIGHT: 'glui:resize-height',
  SET_WINDOW_WIDTH: 'glui:set-window-width',
  HIDE_WINDOW: 'glui:hide-window',
  WINDOW_SHOWN: 'glui:window-shown',
  SET_IGNORE_MOUSE_EVENTS: 'glui:set-ignore-mouse-events',
  START_WINDOW_DRAG: 'glui:start-window-drag',
  RESET_WINDOW_POSITION: 'glui:reset-window-position',
  SHOW_SNAP_GRID: 'glui:show-snap-grid',
  HIDE_SNAP_GRID: 'glui:hide-snap-grid',
  UPDATE_SNAP_ZONE: 'glui:update-snap-zone',
  IS_VISIBLE: 'glui:is-visible',

  // Skill provisioning (main → renderer)
  SKILL_STATUS: 'glui:skill-status',

  // Theme
  GET_THEME: 'glui:get-theme',
  UPDATE_GLASS: 'glui:update-glass',
  THEME_CHANGED: 'glui:theme-changed',

  // Whisper setup
  FIX_WHISPER: 'glui:fix-whisper',

  // Marketplace
  MARKETPLACE_FETCH: 'glui:marketplace-fetch',
  MARKETPLACE_INSTALLED: 'glui:marketplace-installed',
  MARKETPLACE_INSTALL: 'glui:marketplace-install',
  MARKETPLACE_UNINSTALL: 'glui:marketplace-uninstall',

  // Search
  SEARCH_SESSIONS: 'glui:search-sessions',
  SEARCH_BUILD_INDEX: 'glui:search-build-index',
  SEARCH_INDEX_STATUS: 'glui:search-index-status',

  // BTW side question
  BTW_PROMPT: 'glui:btw-prompt',
  BTW_EVENT: 'glui:btw-event',

  // Permission mode
  SET_PERMISSION_MODE: 'glui:set-permission-mode',

  // Auto-update
  CHECK_FOR_UPDATE: 'glui:check-for-update',
  INSTALL_UPDATE: 'glui:install-update',
  UPDATE_AVAILABLE: 'glui:update-available',
  UPDATE_DOWNLOADED: 'glui:update-downloaded',
  UPDATE_ERROR: 'glui:update-error',

  // Legacy (kept for backward compat during migration)
  STREAM_EVENT: 'glui:stream-event',
  RUN_COMPLETE: 'glui:run-complete',
  RUN_ERROR: 'glui:run-error',
} as const
