import type {
  ClaudeEvent,
  NormalizedEvent,
  StreamEvent,
  InitEvent,
  StatusEvent,
  CompactBoundaryEvent,
  AssistantEvent,
  ResultEvent,
  RateLimitEvent,
  PermissionEvent,
  ContentDelta,
} from '../../shared/types'

/**
 * Maps raw Claude stream-json events to canonical GLUI events.
 *
 * The normalizer is stateless — it takes one raw event and returns
 * zero or more normalized events. The caller (RunManager) is responsible
 * for sequencing and routing.
 */
export function normalize(raw: ClaudeEvent): NormalizedEvent[] {
  switch (raw.type) {
    case 'system':
      return normalizeSystem(raw as InitEvent)

    case 'stream_event':
      return normalizeStreamEvent(raw as StreamEvent)

    case 'assistant':
      return normalizeAssistant(raw as AssistantEvent)

    case 'result':
      return normalizeResult(raw as ResultEvent)

    case 'rate_limit_event':
      return normalizeRateLimit(raw as RateLimitEvent)

    case 'permission_request':
      return normalizePermission(raw as PermissionEvent)

    case 'progress':
      return normalizeProgress(raw)

    default:
      // Unknown event type — skip silently (defensive)
      return []
  }
}

function normalizeSystem(event: InitEvent | StatusEvent | CompactBoundaryEvent): NormalizedEvent[] {
  if (event.subtype === 'status') {
    return normalizeStatus(event)
  }

  if (event.subtype === 'compact_boundary') {
    return normalizeCompactBoundary(event)
  }

  if (event.subtype !== 'init') return []

  return [{
    type: 'session_init',
    sessionId: event.session_id,
    tools: event.tools || [],
    model: event.model || 'unknown',
    mcpServers: event.mcp_servers || [],
    skills: event.skills || [],
    version: event.claude_code_version || 'unknown',
  }]
}

function extractStatusText(event: StatusEvent | CompactBoundaryEvent): string {
  const fromData = event.data && typeof event.data === 'object'
    ? (
        typeof event.data.message === 'string' ? event.data.message
          : typeof event.data.status === 'string' ? event.data.status
            : typeof event.data.summary === 'string' ? event.data.summary
            : typeof event.data.content === 'string' ? event.data.content
              : ''
      )
    : ''

  if (typeof event.message === 'string' && event.message.trim()) return event.message
  if (typeof event.status === 'string' && event.status.trim()) return event.status
  if ('summary' in event && typeof event.summary === 'string' && event.summary.trim()) return event.summary
  if (typeof event.content === 'string' && event.content.trim()) return event.content
  if (fromData.trim()) return fromData

  return ''
}

function extractCompactResult(event: StatusEvent): string | undefined {
  if (typeof event.compact_result === 'string' && event.compact_result.trim()) {
    return event.compact_result.trim().toLowerCase()
  }
  if (typeof event.data?.compact_result === 'string' && event.data.compact_result.trim()) {
    return event.data.compact_result.trim().toLowerCase()
  }
  return undefined
}

function looksLikeCompaction(text: string, event: StatusEvent | CompactBoundaryEvent): boolean {
  if (event.subtype === 'compact_boundary') return true

  if ('compact_result' in event && typeof extractCompactResult(event) === 'string') {
    return true
  }

  const haystack = [
    text,
    typeof event.status === 'string' ? event.status : '',
    typeof event.message === 'string' ? event.message : '',
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  return /\bcompact(?:ing|ed|ion)?\b|\bsummar(?:y|ize|izing|ized)\b|\bcontext\b/.test(haystack)
}

function normalizeStatus(event: StatusEvent): NormalizedEvent[] {
  const compactResult = extractCompactResult(event)
  let message = extractStatusText(event)

  if (!message && compactResult === 'success') {
    // compact_boundary carries the authoritative completion metadata.
    // Ignore the intermediary success status so the UI does not regress to
    // a generic "Working..." state between compaction start and completion.
    return []
  }

  if (!message && compactResult) {
    message = compactResult === 'success'
      ? 'Conversation compacted.'
      : 'Compaction interrupted.'
  }

  if ((event.status || '').toLowerCase() === 'compacting' && message.toLowerCase() === 'compacting') {
    message = 'Compacting conversation...'
  }

  message = message || 'Working...'
  return [{
    type: 'status_update',
    message,
    sessionId: event.session_id || null,
    status: typeof event.status === 'string' ? event.status : undefined,
    isCompaction: looksLikeCompaction(message, event),
  }]
}

function normalizeCompactBoundary(event: CompactBoundaryEvent): NormalizedEvent[] {
  const summary = extractStatusText(event) || undefined
  const compactMetadata = event.compact_metadata && typeof event.compact_metadata === 'object'
    ? event.compact_metadata
    : event.data?.compact_metadata && typeof event.data.compact_metadata === 'object'
      ? event.data.compact_metadata
      : undefined
  const trigger = typeof event.trigger === 'string'
    ? event.trigger
    : typeof event.data?.trigger === 'string'
      ? event.data.trigger
      : typeof compactMetadata?.trigger === 'string'
        ? compactMetadata.trigger
      : undefined
  const compactedMessages = typeof event.compacted_messages === 'number'
    ? event.compacted_messages
    : typeof event.data?.compacted_messages === 'number'
      ? event.data.compacted_messages
      : undefined

  return [{
    type: 'compact_boundary',
    sessionId: event.session_id || null,
    summary,
    trigger,
    compactedMessages,
  }]
}

function normalizeStreamEvent(event: StreamEvent): NormalizedEvent[] {
  const sub = event.event
  if (!sub) return []
  const parentId = event.parent_tool_use_id || null

  switch (sub.type) {
    case 'content_block_start': {
      if (sub.content_block.type === 'tool_use') {
        return [{
          type: 'tool_call',
          toolName: sub.content_block.name || 'unknown',
          toolId: sub.content_block.id || '',
          index: sub.index,
          parentToolUseId: parentId,
        }]
      }
      // text block start — no event needed, text comes via deltas
      return []
    }

    case 'content_block_delta': {
      const delta = sub.delta as ContentDelta
      if (delta.type === 'text_delta') {
        return [{ type: 'text_chunk', text: delta.text, parentToolUseId: parentId }]
      }
      if (delta.type === 'input_json_delta') {
        return [{
          type: 'tool_call_update',
          toolId: '', // caller can associate via index tracking
          partialInput: delta.partial_json,
          parentToolUseId: parentId,
        }]
      }
      return []
    }

    case 'content_block_stop': {
      return [{
        type: 'tool_call_complete',
        index: sub.index,
        parentToolUseId: parentId,
      }]
    }

    case 'message_start':
    case 'message_delta':
    case 'message_stop':
      // These are structural events — the assembled `assistant` event handles message completion
      return []

    default:
      return []
  }
}

function normalizeAssistant(event: AssistantEvent): NormalizedEvent[] {
  return [{
    type: 'task_update',
    message: event.message,
  }]
}

function normalizeResult(event: ResultEvent): NormalizedEvent[] {
  if (event.is_error || event.subtype === 'error') {
    return [{
      type: 'error',
      message: event.result || 'Unknown error',
      isError: true,
      sessionId: event.session_id,
    }]
  }

  const denials = Array.isArray((event as any).permission_denials)
    ? (event as any).permission_denials.map((d: any) => ({
        toolName: d.tool_name || '',
        toolUseId: d.tool_use_id || '',
      }))
    : undefined

  return [{
    type: 'task_complete',
    result: event.result || '',
    costUsd: event.total_cost_usd || 0,
    durationMs: event.duration_ms || 0,
    numTurns: event.num_turns || 0,
    usage: event.usage || {},
    sessionId: event.session_id,
    ...(denials && denials.length > 0 ? { permissionDenials: denials } : {}),
  }]
}

function normalizeRateLimit(event: RateLimitEvent): NormalizedEvent[] {
  const info = event.rate_limit_info
  if (!info) return []

  return [{
    type: 'rate_limit',
    status: info.status,
    resetsAt: info.resetsAt,
    rateLimitType: info.rateLimitType,
  }]
}

function normalizeProgress(raw: any): NormalizedEvent[] {
  const parentToolUseId = raw.parentToolUseID
  if (!parentToolUseId) return []

  const data = raw.data
  if (!data || !data.message) return []

  const msg = data.message
  const content = msg.message?.content

  // Extract meaningful content from the progress event
  const parts: string[] = []

  if (Array.isArray(content)) {
    for (const block of content) {
      if (block.type === 'text' && block.text) {
        parts.push(block.text)
      } else if (block.type === 'tool_use' && block.name) {
        // Show what tool the subagent is using
        const input = block.input || {}
        let detail = ''
        if (block.name === 'Read' || block.name === 'Edit' || block.name === 'Write') {
          detail = `: ${input.file_path || input.path || ''}`
        } else if (block.name === 'Bash') {
          const cmd = input.command || ''
          detail = `: ${typeof cmd === 'string' ? cmd.substring(0, 60) : ''}`
        } else if (block.name === 'Grep' || block.name === 'Glob') {
          detail = `: ${input.pattern || ''}`
        }
        parts.push(`[${block.name}${detail}]`)
      } else if (block.type === 'tool_result' && block.content) {
        // Tool results from user turns — skip these for progress display
      }
    }
  }

  if (parts.length === 0) return []

  return [{
    type: 'agent_progress',
    toolUseId: parentToolUseId,
    content: parts.join('\n'),
  }]
}

function normalizePermission(event: PermissionEvent): NormalizedEvent[] {
  return [{
    type: 'permission_request',
    questionId: event.question_id,
    toolName: event.tool?.name || 'unknown',
    toolDescription: event.tool?.description,
    toolInput: event.tool?.input,
    options: (event.options || []).map((o) => ({
      id: o.id,
      label: o.label,
      kind: o.kind,
    })),
  }]
}
