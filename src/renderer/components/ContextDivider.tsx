import { Archive, ArrowRight, ArrowsLeftRight, CaretDown } from '@phosphor-icons/react'
import type { PillContextAgent, PillContextChange } from '../../../orchestrator/packages/shared/src/gluiPill'
import { useColors } from '../theme'
import { ProviderIcon } from './ProviderIcon'

function AgentLabel({ agent, source = false }: { agent: PillContextAgent; source?: boolean }) {
  const colors = useColors()
  return (
    <span className="context-agent" style={{ color: source ? colors.accent : colors.textSecondary }} title={agent.label}>
      {agent.provider && <ProviderIcon provider={agent.provider} size={12} />}
      <span>{agent.label}</span>
    </span>
  )
}

export function ContextDivider({ change }: { change: PillContextChange }) {
  const colors = useColors()
  const handoff = change.kind === 'handoff'
  const running = change.state === 'running'
  const failed = change.state === 'failed'
  const label = handoff
    ? failed ? 'Handoff interrupted' : 'Context handoff'
    : running ? 'Compacting context' : failed ? 'Compaction interrupted' : 'Context compacted'
  const Icon = handoff ? ArrowsLeftRight : Archive
  const row = (
    <span className="context-divider-row" style={{ color: failed ? colors.statusError : colors.textTertiary }}>
      <span className="context-rule" style={{ background: colors.toolBorder }} />
      <span className="context-divider-content">
        <span className="context-event-label">
          <Icon size={12} className={running ? 'context-progress' : undefined} />
          {label}
        </span>
        {handoff && (
          <span className="context-agents">
            {change.sources?.map((agent, index) => <AgentLabel key={`${agent.label}-${index}`} agent={agent} source />)}
            {!!change.sources?.length && change.target && <ArrowRight size={11} aria-label="to" />}
            {change.target && <AgentLabel agent={change.target} />}
          </span>
        )}
        {!handoff && change.beforeTokens !== undefined && change.afterTokens !== undefined && (
          <span className="context-token-count">{change.beforeTokens.toLocaleString()} → {change.afterTokens.toLocaleString()} tokens</span>
        )}
        {change.summary && <CaretDown size={10} className="context-detail-chevron" />}
      </span>
      <span className="context-rule" style={{ background: colors.toolBorder }} />
    </span>
  )
  return change.summary ? (
    <details className="context-divider">
      <summary aria-label={`${label}. Show summary`}>{row}</summary>
      <div className="context-summary" style={{ color: colors.textSecondary, borderColor: colors.toolBorder }}>
        {change.summary}
      </div>
    </details>
  ) : <div className="context-divider">{row}</div>
}
