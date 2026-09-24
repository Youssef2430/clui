import { useState } from 'react'
import { ArrowUpRight, Globe } from '@phosphor-icons/react'
import type { PillWebSource } from '../../../orchestrator/packages/shared/src/gluiPill'
import { webSourceUrl } from '../../../orchestrator/packages/shared/src/webSearchSources'
import { citationSource } from '../lib/webCitations'
import { useColors } from '../theme'

export function WebSourceList({ sources }: { sources: readonly PillWebSource[] }) {
  const colors = useColors()
  const seen = new Set<string>()
  return <span className="web-source-list">{sources.filter(source => {
    if (!webSourceUrl(source.url) || seen.has(source.url)) return false
    seen.add(source.url); return true
  }).map(source => (
    <span className="web-source" key={source.url}>
      <a href={source.url} title={source.url} style={{ color: colors.accent }} onClick={event => { event.preventDefault(); void window.glui.openExternal(source.url) }}>
        <Globe size={11} /><span>{source.title || new URL(source.url).hostname}</span><ArrowUpRight size={10} />
      </a>
      <span className="web-source-domain" style={{ color: colors.textTertiary }}>{new URL(source.url).hostname}</span>
      {source.snippet && <span style={{ color: colors.textSecondary }}>{source.snippet}</span>}
    </span>
  ))}</span>
}

export function WebCitation({ refs, sources = [] }: { refs: string[]; sources?: readonly PillWebSource[] }) {
  const colors = useColors()
  const [open, setOpen] = useState(false)
  const resolved = refs.map(ref => citationSource(ref, sources)).filter((source): source is PillWebSource => !!source)
  const missing = resolved.length < refs.length || refs.length === 0
  return <span className="web-citation">
    <button type="button" className="web-citation-chip" aria-expanded={open} aria-label="View citation sources"
      title={missing ? 'The agent did not provide all source links' : 'View sources'}
      style={{ color: colors.accent, background: colors.accentLight, borderColor: colors.toolBorder }} onClick={() => setOpen(!open)}>
      <Globe size={10} />{resolved.length ? `Sources${refs.length > 1 ? ` ${refs.length}` : ''}` : 'Source unavailable'}
    </button>
    {open && <span className="web-citation-details" role="group" aria-label="Citation sources" style={{ borderColor: colors.toolBorder }}>
      <WebSourceList sources={resolved} />
      {missing && <span style={{ color: colors.textTertiary }}>The agent did not provide a link for {resolved.length ? 'some of these citations' : 'this citation'}.</span>}
    </span>}
  </span>
}
