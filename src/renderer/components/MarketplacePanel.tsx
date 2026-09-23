import React, { useDeferredValue, useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowClockwise, ArrowUpRight, Check, DownloadSimple, MagnifyingGlass, Plus, SpinnerGap, Trash, X } from '@phosphor-icons/react'
import { useSessionStore } from '../stores/sessionStore'
import { useColors } from '../theme'
import type { CatalogPlugin, PluginStatus } from '../../shared/types'

export function MarketplacePanel({ height = 470 }: { height?: number }) {
  const colors = useColors()
  const catalog = useSessionStore(s => s.marketplaceCatalog)
  const targets = useSessionStore(s => s.marketplaceTargets)
  const loading = useSessionStore(s => s.marketplaceLoading)
  const error = useSessionStore(s => s.marketplaceError)
  const states = useSessionStore(s => s.marketplacePluginStates)
  const search = useSessionStore(s => s.marketplaceSearch)
  const setSearch = useSessionStore(s => s.setMarketplaceSearch)
  const close = useSessionStore(s => s.closeMarketplace)
  const refresh = useSessionStore(s => s.loadMarketplace)
  const create = useSessionStore(s => s.buildYourOwn)
  const [installedOnly, setInstalledOnly] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [limit, setLimit] = useState(35)
  const deferred = useDeferredValue(search.trim().toLowerCase())
  const filtered = useMemo(() => catalog.filter(p => (!installedOnly || states[p.id] === 'installed' || states[p.id] === 'removing') && (!deferred || `${p.name} ${p.repo} ${p.description} ${p.tags.join(' ')}`.toLowerCase().includes(deferred))), [catalog, states, installedOnly, deferred])
  useEffect(() => { setLimit(35) }, [deferred, installedOnly])
  useEffect(() => { const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); close() } }; document.addEventListener('keydown', key); return () => document.removeEventListener('keydown', key) }, [close])
  return <section data-glui-ui aria-label="Skills directory" style={{ height, display: 'flex', flexDirection: 'column', color: colors.textPrimary }}>
    <header style={{ padding: '17px 20px 12px', display: 'flex', justifyContent: 'space-between', gap: 12 }}>
      <div><div style={{ fontSize: 19, fontWeight: 650, letterSpacing: '-.7px' }}>Skills<span style={{ color: colors.accent }}>.</span></div><p style={{ fontSize: 11, color: colors.textTertiary, marginTop: 3 }}>Install once. Use across your agents.</p></div>
      <div className="flex items-center gap-2"><button className="skill-icon" title="Create a skill" aria-label="Create a skill" onClick={create}><Plus size={16} /></button><button className="skill-icon" title="Refresh directory" aria-label="Refresh directory" disabled={loading} onClick={() => void refresh(true)}><ArrowClockwise size={15} className={loading ? 'animate-spin' : undefined} /></button><button className="skill-icon" aria-label="Close skills directory" onClick={close}><X size={16} /></button></div>
    </header>
    <div style={{ padding: '0 20px 12px' }}><label className="skill-search" style={{ background: colors.inputPillBg, border: `1px solid ${colors.containerBorder}` }}><MagnifyingGlass size={16} style={{ color: colors.textTertiary }} /><input autoFocus aria-label="Search skills" placeholder="Search skills, authors, or repositories…" value={search} onChange={e => setSearch(e.target.value)} style={{ background: 'transparent', color: colors.textPrimary, fontSize: 12, flex: 1, minWidth: 0, outline: 'none' }} />{search && <button aria-label="Clear search" onClick={() => setSearch('')}><X size={12} /></button>}</label></div>
    <div style={{ display: 'flex', alignItems: 'center', gap: 18, borderBottom: `1px solid ${colors.containerBorder}`, margin: '0 20px' }}>
      {[false, true].map(value => <button key={String(value)} onClick={() => setInstalledOnly(value)} aria-pressed={installedOnly === value} style={{ padding: '0 0 10px', fontSize: 11, fontWeight: 600, color: installedOnly === value ? colors.accent : colors.textTertiary, borderBottom: `2px solid ${installedOnly === value ? colors.accent : 'transparent'}` }}>{value ? 'Installed' : 'Discover'}</button>)}
      <span style={{ marginLeft: 'auto', fontSize: 10, color: colors.textTertiary }}>{filtered.length} skills</span>
    </div>
    {error && <div role="alert" style={{ fontSize: 11, padding: '8px 20px', color: colors.statusError }}>{error} <button onClick={() => void refresh(true)} style={{ textDecoration: 'underline' }}>Retry</button></div>}
    <div style={{ overflowY: 'auto', flex: 1, minHeight: 0, padding: '0 20px' }}>
      {loading && !catalog.length ? <div className="skill-empty"><SpinnerGap size={19} className="animate-spin" /><span>Loading the directory…</span></div> : !filtered.length ? <div className="skill-empty"><MagnifyingGlass size={21} /><span>{search ? 'No skills match your search.' : installedOnly ? 'Your installed skills will appear here.' : 'No skills are available yet.'}</span>{search && <button onClick={() => setSearch('')} style={{ color: colors.accent }}>Clear search</button>}</div> : filtered.slice(0, limit).map((plugin, index) => <SkillRow key={plugin.id} plugin={plugin} index={index + 1} status={states[plugin.id] ?? 'not_installed'} expanded={expanded === plugin.id} toggle={() => setExpanded(expanded === plugin.id ? null : plugin.id)} />)}
      {filtered.length > limit && <button className="skill-more" onClick={() => setLimit(n => n + 35)}>Show more skills</button>}
    </div>
    <footer style={{ borderTop: `1px solid ${colors.containerBorder}`, padding: '10px 20px', display: 'flex', gap: 7, alignItems: 'center', color: colors.textTertiary, fontSize: 10 }}><span style={{ width: 5, height: 5, borderRadius: 9, background: targets.length ? colors.accent : colors.textTertiary, flexShrink: 0 }} /><span style={{ whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }} title={targets.map(t => t.name).join(', ')}>{targets.length ? `Available for ${targets.map(t => t.name).join(' · ')}` : 'Install an agent to start adding skills'}</span></footer>
  </section>
}

function SkillRow({ plugin, status, expanded, toggle, index }: { plugin: CatalogPlugin; status: PluginStatus; expanded: boolean; toggle: () => void; index: number }) {
  const colors = useColors()
  const install = useSessionStore(s => s.installMarketplacePlugin)
  const remove = useSessionStore(s => s.uninstallMarketplacePlugin)
  const error = useSessionStore(s => s.marketplacePluginErrors[plugin.id])
  const targets = useSessionStore(s => s.marketplaceTargets)
  const busy = status === 'installing' || status === 'removing'
  const installed = status === 'installed'
  const collection = plugin.sourcePath.includes('/skills/') ? plugin.sourcePath.split('/skills/')[0]?.split('/').at(-1) : undefined
  return <article style={{ borderBottom: `1px solid ${colors.containerBorder}` }}>
    <div style={{ display: 'flex', gap: 10, alignItems: 'center', minHeight: 67 }}>
      <span style={{ fontSize: 10, width: 18, flexShrink: 0, color: colors.textTertiary, fontVariantNumeric: 'tabular-nums', opacity: .65 }}>{String(index).padStart(2, '0')}</span>
      <button className="skill-row-name" title={`${plugin.repo}/${plugin.sourcePath}`} aria-expanded={expanded} onClick={toggle}><span style={{ fontSize: 12, fontWeight: 600, display: 'block', color: colors.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis' }}>{plugin.name}</span><span style={{ display: 'block', color: colors.textTertiary, fontSize: 10, marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis' }}>{plugin.repo}{collection ? ` · ${collection}` : ''}</span></button>
      <button disabled={busy || (!installed && !targets.length)} className="skill-action" aria-label={installed ? `Show ${plugin.name} installation` : `Install ${plugin.name} for all available agents`} onClick={() => installed ? toggle() : void install(plugin)} style={{ color: installed ? colors.accent : colors.textSecondary, background: installed ? colors.accentLight : colors.surfaceHover }}>
        {busy ? <SpinnerGap size={13} className="animate-spin" /> : installed ? <Check size={13} /> : <DownloadSimple size={13} />}<span>{status === 'installing' ? 'Adding…' : status === 'removing' ? 'Removing…' : installed ? 'Added' : status === 'failed' ? 'Retry' : 'Add'}</span>
      </button>
    </div>
    <AnimatePresence initial={false}>{expanded && <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: .16 }} style={{ overflow: 'hidden' }}><div style={{ padding: '0 0 14px 28px' }}>
      <p style={{ fontSize: 11, lineHeight: 1.65, color: colors.textSecondary, margin: '0 0 10px', userSelect: 'text' }}>{plugin.description}</p>
      <div className="flex flex-wrap gap-1.5" style={{ marginBottom: 10 }}>{targets.map(target => <span key={target.id} style={{ fontSize: 9, padding: '3px 7px', borderRadius: 5, color: plugin.installedProviders?.includes(target.id) ? colors.accent : colors.textTertiary, background: colors.surfaceHover }}>{plugin.installedProviders?.includes(target.id) ? '✓ ' : ''}{target.name}</span>)}</div>
      <div className="flex items-center justify-between"><button className="flex items-center gap-1" style={{ fontSize: 10, color: colors.textTertiary }} onClick={() => window.glui.openExternal(`https://github.com/${plugin.repo}/tree/${plugin.revision || 'HEAD'}/${plugin.sourcePath}`)}>View source<ArrowUpRight size={11} /></button>{installed && <div className="flex gap-3"><button style={{ fontSize: 10, color: colors.textSecondary }} onClick={() => void install(plugin)}>Update links</button><button className="flex items-center gap-1" style={{ fontSize: 10, color: colors.textTertiary }} onClick={() => void remove(plugin)}><Trash size={11} />Remove</button></div>}</div>
    </div></motion.div>}</AnimatePresence>
    {error && <p role="alert" style={{ margin: '0 0 12px 28px', fontSize: 11, lineHeight: 1.5, color: colors.statusError }}>{error}</p>}
  </article>
}
