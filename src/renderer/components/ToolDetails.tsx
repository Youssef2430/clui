import { useState } from 'react'
import { CaretDown, CaretRight } from '@phosphor-icons/react'
import type { Message } from '../../shared/types'
import { useColors } from '../theme'
import { WebSourceList } from './WebSources'

/** Canonical runtime tools already contain their result; never fetch Claude JSONL for them. */
export function ToolDetails({ tool }: { tool: Message }) {
  const [open, setOpen] = useState(false)
  const colors = useColors()
  const running = tool.toolStatus === 'running'
  const failed = tool.toolStatus === 'error'
  const hasOutput = !!tool.toolResult || !!tool.sources?.length
  let input = tool.toolInput || ''
  try {
    const parsed = JSON.parse(input)
    input = tool.toolKind === 'command_execution' ? parsed.command || ''
      : tool.toolKind === 'web_search' ? parsed.query || ''
      : tool.toolKind === 'file_search' ? parsed.pattern || ''
      : tool.toolKind === 'file_change' ? parsed.file_path || ''
      : tool.toolKind === 'subagent' ? parsed.prompt || ''
      : JSON.stringify(parsed, null, 2)
  } catch { /* Keep partial or plain-text input intact. */ }
  const state = tool.toolState === 'interrupted' || tool.toolState === 'cancelled' ? 'Interrupted'
    : failed ? 'Failed' : tool.toolState === 'waiting' ? 'Waiting' : running ? 'Running' : 'Completed'
  const empty = tool.toolKind === 'web_search'
    ? 'The agent did not share search results or source links.'
    : 'The agent did not return output for this tool.'
  if (!input && !hasOutput) return <span className="tool-empty" style={{ color: failed ? colors.statusError : colors.textTertiary }}>
    {state}{!running && ` · ${empty}`}
  </span>
  return <div className="tool-details">
    <button type="button" className="tool-detail-toggle" aria-expanded={open} onClick={() => setOpen(!open)} style={{ color: failed ? colors.statusError : colors.textTertiary }}>
      {open ? <CaretDown size={9} /> : <CaretRight size={9} />}
      {tool.sources?.length ? `${tool.sources.length} source${tool.sources.length === 1 ? '' : 's'}` : hasOutput ? 'Output' : 'Details'}
      <span>· {state}</span>
    </button>
    {open && <div className="tool-detail-body" style={{ background: colors.surfaceHover, borderColor: colors.toolBorder, color: colors.textSecondary }}>
      {input && <pre aria-label="Tool input">{input}</pre>}
      {tool.sources?.length ? <WebSourceList sources={tool.sources} /> : null}
      {tool.toolResult && <pre aria-label="Tool output">{tool.toolResult}</pre>}
      {!hasOutput && !running && <span style={{ color: colors.textTertiary }}>{empty}</span>}
    </div>}
  </div>
}
