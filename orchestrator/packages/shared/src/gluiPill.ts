/** JSON-only boundary between GLUI's floating shell and its owned workspace. */
export type PillProvider = "claude" | "codex" | "opencode";
export type PillRuntimeMode = "approval-required" | "auto-accept-edits" | "auto" | "full-access";
export type PillModelOptions = Array<{ id: string; value: string | boolean }>;
export interface PillModelDescriptor {
  id: string; label: string; description?: string; type: "select" | "boolean";
  options?: Array<{ id: string; label: string; description?: string; isDefault?: boolean }>;
  currentValue?: string | boolean;
}
export interface PillModelCatalog {
  options: Array<{ id: string | null; label: string; detail?: string; descriptors?: PillModelDescriptor[] }>;
  defaultModel: string | null;
  runtimeModes?: PillRuntimeMode[];
}
export interface PillContextAgent {
  provider?: PillProvider;
  label: string;
}
export interface PillContextChange {
  kind: "handoff" | "compaction";
  state: "running" | "completed" | "failed";
  sources?: PillContextAgent[];
  target?: PillContextAgent;
  summary?: string;
  beforeTokens?: number;
  afterTokens?: number;
}
export interface PillMessage {
  id: string;
  role: "user" | "assistant" | "tool" | "system";
  content: string;
  timestamp: number;
  attachments?: Array<{ id: string; type: "image" | "file"; name: string; mimeType: string; size: number; path: string }>;
  toolName?: string;
  toolId?: string;
  toolInput?: string;
  toolResult?: string;
  toolStatus?: "running" | "completed" | "error";
  toolKind?: "command_execution" | "dynamic_tool" | "file_change" | "file_search" | "web_search" | "subagent";
  toolState?: string;
  sources?: PillWebSource[];
  contextChange?: PillContextChange;
}
export interface PillWebSource {
  url: string;
  title?: string;
  snippet?: string;
  citationId?: string;
}
export interface PillThread {
  threadId: string;
  title: string;
  provider: PillProvider;
  model: string;
  modelOptions?: PillModelOptions;
  runtimeMode?: PillRuntimeMode;
  workspaceRoot: string;
  nativeSessionId: string | null;
  status: "idle" | "connecting" | "running" | "completed" | "failed";
  activeRequestId: string | null;
  messages: PillMessage[];
  queuedPrompts: Array<{ prompt: string }>;
  permissions: Array<{
    questionId: string;
    toolTitle: string;
    toolDescription?: string;
    options: Array<{ optionId: string; label: string }>;
  }>;
  questions: Array<{
    type: "user_input";
    questionId: string;
    questions: Array<{ id: string; question: string; options?: Array<{ label: string; description?: string }>; multiple?: boolean; isSecret?: boolean }>;
  }>;
  lastRunId: string | null;
  hasMoreHistory: boolean;
}
export type PillAction =
  | { type: "catalog"; provider: PillProvider }
  | { type: "prompt"; threadId: string; requestId: string; provider: PillProvider; model?: string; modelOptions?: PillModelOptions; runtimeMode?: PillRuntimeMode; projectPath: string; prompt: string; permissionMode: "ask" | "auto"; nativeSessionId?: string; attachments?: Array<{ id: string; type: "image" | "file"; name: string; mimeType?: string; dataUrl: string; size?: number }> }
  | { type: "watch" | "unwatch" | "stop" | "history"; threadId?: string }
  | { type: "load-earlier"; threadId: string }
  | { type: "select"; threadId: string; provider: PillProvider; model?: string }
  | { type: "respond"; threadId: string; requestId: string; decision?: string; answers?: Record<string, unknown> }
  | { type: "fork"; threadId: string; targetThreadId: string; runId: string }
  | { type: "dispatch"; command: unknown };
export type PillRequest = { kind: "request"; id: string; action: PillAction };
export type PillReply =
  | { kind: "ready" }
  | { kind: "response"; id: string; value?: unknown; error?: string }
  | { kind: "thread"; thread: PillThread }
  | { kind: "failure"; message: string };
