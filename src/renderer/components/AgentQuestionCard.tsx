import React, { useState } from 'react'
import type { NormalizedEvent } from '../../shared/types'
import { useSessionStore } from '../stores/sessionStore'
import { useColors } from '../theme'

export function AgentQuestionCard({ tabId, request }: { tabId: string; request: Extract<NormalizedEvent, { type: 'user_input' }> }) {
  const colors = useColors()
  const respond = useSessionStore(s => s.respondInput)
  const [values, setValues] = useState<Record<string, string>>({})
  const [choices, setChoices] = useState<Record<string, string[]>>({})
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  return <form style={{ border: `1px solid ${colors.accentBorderMedium}`, background: colors.surfacePrimary, borderRadius: 12, padding: 16, margin: '12px 0' }} onSubmit={async e => {
    e.preventDefault(); setSending(true); setError('')
    try { await respond(tabId, request.questionId, Object.fromEntries(request.questions.map(q => [q.id, { answers: q.multiple ? [...(choices[q.id] || []), ...(values[q.id]?.trim() ? [values[q.id].trim()] : [])] : [values[q.id] || ''] }]))) }
    catch (error) { setError(String(error)); setSending(false) }
  }}>
    {request.questions.map(q => <label key={q.id} style={{ display: 'block', marginBottom: 12, color: colors.textPrimary, fontSize: 12 }}>
      <span>{q.question}</span>
      {q.options?.length ? <div className="flex flex-wrap gap-2 mt-2">{q.options.map(o => <button type="button" key={o.label} onClick={() => q.multiple ? setChoices(v => ({ ...v, [q.id]: (v[q.id] || []).includes(o.label) ? v[q.id].filter(a => a !== o.label) : [...(v[q.id] || []), o.label] })) : setValues(v => ({ ...v, [q.id]: o.label }))} aria-pressed={q.multiple ? choices[q.id]?.includes(o.label) || false : values[q.id] === o.label} title={o.description}
        style={{ padding: '6px 10px', borderRadius: 6, background: (q.multiple ? choices[q.id]?.includes(o.label) : values[q.id] === o.label) ? colors.accent : colors.surfaceSecondary, color: (q.multiple ? choices[q.id]?.includes(o.label) : values[q.id] === o.label) ? colors.textOnAccent : colors.textPrimary }}>{o.label}</button>)}</div> : null}
      <input type={q.isSecret ? 'password' : 'text'} required={!q.multiple || !choices[q.id]?.length} aria-label={q.question} placeholder="Your answer" value={values[q.id] || ''} onChange={e => setValues(v => ({ ...v, [q.id]: e.target.value }))}
        style={{ width: '100%', marginTop: 8, padding: 8, borderRadius: 6, background: colors.inputPillBg, color: colors.textPrimary, border: `1px solid ${colors.inputBorder}` }} />
    </label>)}
    {error && <p role="alert" style={{ color: colors.statusError }}>{error}</p>}
    <button disabled={sending} type="submit" style={{ background: colors.accent, color: colors.textOnAccent, borderRadius: 7, padding: '7px 12px', fontSize: 12 }}>{sending ? 'Sending…' : 'Send answer'}</button>
  </form>
}
