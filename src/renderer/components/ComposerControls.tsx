import React, { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { CaretDown, Check, LockKey, LockKeyOpen, MagnifyingGlass, SpinnerGap, FolderSimple, GitBranch, Lightning } from '@phosphor-icons/react'
import { useSessionStore } from '../stores/sessionStore'
import { useColors } from '../theme'
import { usePopoverLayer } from './PopoverLayer'
import { ProviderIcon } from './ProviderIcon'
import { PROVIDERS, type ProviderId } from '../../shared/providers'
import type { PillRuntimeMode } from '../../../orchestrator/packages/shared/src/gluiPill'

const ACCESS: Record<PillRuntimeMode, { label: string; description: string }> = {
  'approval-required': { label: 'Ask first', description: 'Ask before actions that need permission.' },
  'auto-accept-edits': { label: 'Allow edits', description: 'Allow file edits; ask before other restricted actions.' },
  auto: { label: 'Auto', description: 'Let the agent review actions and ask when needed.' },
  'full-access': { label: 'Full access', description: 'Run tools without asking for approval.' },
}
type Menu = 'model' | 'effort' | 'access' | 'folder' | 'branch'

export function ComposerControls({ wide = false }: { wide?: boolean }) {
  const colors = useColors()
  const expandedUI = wide
  const setDirectory = useSessionStore(s => s.setBaseDirectory)
  const [workspace, setWorkspace] = useState<{ branch: string | null; root: string | null }>({ branch: null, root: null })
  const layer = usePopoverLayer()
  const tab = useSessionStore(s => s.tabs.find(t => t.id === s.activeTabId))
  const settings = useSessionStore(s => s.modelSettings)
  const loading = useSessionStore(s => s.modelSettingsLoading)
  const catalogError = useSessionStore(s => s.modelSettingsError)
  const providers = useSessionStore(s => s.providers)
  const refresh = useSessionStore(s => s.refreshModelSettings)
  const setProvider = useSessionStore(s => s.setProvider)
  const setModel = useSessionStore(s => s.setPreferredModel)
  const setOption = useSessionStore(s => s.setModelOption)
  const setAccess = useSessionStore(s => s.setRuntimeMode)
  const permissionMode = useSessionStore(s => s.permissionMode)
  const [menu, setMenu] = useState<Menu | null>(null)
  const [query, setQuery] = useState('')
  const [error, setError] = useState('')
  const [switching, setSwitching] = useState(false)
  const [position, setPosition] = useState({ left: 0, bottom: 0, maxHeight: 360, width: 336 })
  const panel = useRef<HTMLDivElement>(null)
  const triggers = useRef<Partial<Record<Menu, HTMLButtonElement | null>>>({})
  const busy = switching || tab?.status === 'running' || tab?.status === 'connecting'
  const modelId = tab?.preferredModel ?? tab?.sessionModel ?? settings.defaultModel
  const model = settings.options.find(m => m.id === modelId)
  const effort = model?.descriptors?.find(d => d.type === 'select' && /effort|reasoning|variant/i.test(d.id + ' ' + d.label))
  const effortValue = tab?.modelOptions?.find(o => o.id === effort?.id)?.value ?? effort?.currentValue ?? effort?.options?.find(o => o.isDefault)?.id
  const effortLabel = effort?.options?.find(o => o.id === effortValue)?.label ?? 'Default'
  const access = tab?.runtimeMode ?? (permissionMode === 'auto' ? 'full-access' : 'approval-required')
  const selectedProvider = tab?.provider ?? 'claude'
  const modelName = model?.label ?? modelId ?? 'Default model'

  useEffect(() => {
    let disposed = false
    setWorkspace({ branch: null, root: null })
    const update = () => { if (tab?.hasChosenDirectory && tab.workingDirectory) void window.glui.getWorkspaceInfo(tab.workingDirectory).then(info => { if (!disposed) setWorkspace(info) }).catch(() => { if (!disposed) setWorkspace({ branch: null, root: null }) }) }
    update(); window.addEventListener('focus', update)
    return () => { disposed = true; window.removeEventListener('focus', update) }
  }, [tab?.workingDirectory, tab?.hasChosenDirectory, tab?.status])
  useEffect(() => { void refresh(tab?.hasChosenDirectory ? tab.workingDirectory : undefined) }, [refresh, tab?.id, tab?.provider, tab?.workingDirectory, tab?.hasChosenDirectory])
  useEffect(() => { if (!switching) setMenu(null); setError(''); setQuery('') }, [tab?.id])
  useEffect(() => {
    if (!menu) return
    const outside = (e: MouseEvent) => {
      if (!panel.current?.contains(e.target as Node) && !triggers.current[menu]?.contains(e.target as Node)) setMenu(null)
    }
    const escape = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); setMenu(null); triggers.current[menu]?.focus() } }
    document.addEventListener('mousedown', outside)
    document.addEventListener('keydown', escape, true)
    return () => { document.removeEventListener('mousedown', outside); document.removeEventListener('keydown', escape, true) }
  }, [menu])
  const positionMenu = useCallback((next: Menu) => {
    const trigger = triggers.current[next]
    if (!trigger) return
    const rect = trigger.getBoundingClientRect()
    const column = trigger.closest('.glui-column')
    const composer = column?.querySelector('.glui-composer')?.getBoundingClientRect()
    const shell = column?.querySelector('[data-glui-shell]')?.getBoundingClientRect()
    // Keep the input and its shelf visible. In the closed view, clear the
    // tab strip too; in a thread, menus can float over the conversation.
    const top = shell && shell.height < 80 ? shell.top : composer?.top ?? rect.top
    const width = Math.min(next === 'effort' ? 200 : next === 'model' ? 336 : 320, window.innerWidth - 24)
    const anchorLeft = next === 'branch' ? rect.right - width : rect.left
    const nextPosition = { left: Math.max(12, Math.min(anchorLeft, window.innerWidth - width - 12)),
      bottom: window.innerHeight - top + 8, maxHeight: Math.max(80, Math.min(380, top - 24)), width }
    setPosition(previous => Object.keys(nextPosition).every(key => previous[key as keyof typeof previous] === nextPosition[key as keyof typeof nextPosition]) ? previous : nextPosition)
  }, [])
  useEffect(() => {
    if (!menu) return
    const reposition = () => positionMenu(menu)
    const observer = new ResizeObserver(reposition)
    const column = triggers.current[menu]?.closest('.glui-column')
    column?.querySelectorAll('.glui-composer, [data-glui-shell], .composer-shelf').forEach(element => observer.observe(element))
    window.addEventListener('resize', reposition)
    reposition()
    return () => { observer.disconnect(); window.removeEventListener('resize', reposition) }
  }, [menu, positionMenu])
  const toggle = (next: Menu) => {
    if (menu === next) { setMenu(null); return }
    positionMenu(next)
    setMenu(next); setError(''); setQuery('')
  }
  const choose = (fn: () => void) => { fn(); setMenu(null); if (menu) triggers.current[menu]?.focus() }
  const trigger = (key: Menu, label: React.ReactNode, title: string, disabled = busy) => <button ref={el => { triggers.current[key] = el }} type="button" className={`composer-control composer-control-${key}`} aria-label={title} title={title} aria-expanded={menu === key} aria-controls={menu === key ? 'composer-menu' : undefined} aria-haspopup="dialog" disabled={disabled} onClick={() => toggle(key)}>
    {label}<CaretDown size={11} style={{ opacity: .65, flexShrink: 0 }} />
  </button>
  const row = (id: string, label: string, description: string | undefined, selected: boolean, onClick: () => void) => <button key={id} type="button" className="composer-option" aria-pressed={selected} onClick={onClick}>
    <span style={{ minWidth: 0 }}><span style={{ display: 'block', fontWeight: selected ? 600 : 500 }}>{label}</span>{description && <span style={{ display: 'block', fontSize: 11, color: colors.textTertiary, marginTop: 3 }}>{description}</span>}</span>
    {selected && <Check size={14} style={{ color: colors.accent, flexShrink: 0 }} />}
  </button>
  return <div data-glui-ui className={`composer-shelf glass-surface ${expandedUI ? "wide" : "compact"}`} style={{ color: colors.textSecondary }}>
    {trigger('folder', <><FolderSimple size={14} /><span className="composer-folder-label truncate">{tab?.hasChosenDirectory ? tab.workingDirectory.split('/').filter(Boolean).at(-1) : 'Folder'}</span></>, tab?.workingDirectory || 'Choose working folder')}
    <span className="composer-divider" />
    {trigger('model', <><ProviderIcon provider={selectedProvider} size={18} />{expandedUI && <span className="truncate" style={{ maxWidth: 125 }}>{modelName}</span>}</>, `${PROVIDERS[selectedProvider].name} · ${modelName}. Choose agent and model`)}
    <span className="composer-divider" />
    {trigger('effort', <><Lightning size={13} /><span className="truncate">{effortLabel}</span></>, effort ? `${effort.label}: ${effortLabel}` : 'This model uses its default reasoning', busy || !effort)}
    <span className="composer-divider" />
    {trigger('access', <>{access === 'full-access' ? <LockKeyOpen size={15} /> : <LockKey size={15} />}<span className="truncate">{ACCESS[access].label}</span></>, `Access: ${ACCESS[access].label}`)}
    {workspace.branch && <span style={{ marginLeft: 'auto', display: 'flex', minWidth: 0 }}>{trigger('branch', <><GitBranch size={13} /><span className="truncate" style={{ maxWidth: expandedUI ? 100 : 45 }}>{workspace.branch}</span></>, `Branch: ${workspace.branch}`)}</span>}
    {layer && createPortal(<AnimatePresence>{menu && <motion.div key={menu} id="composer-menu" className="glui-popover" role="dialog" aria-label={menu === 'model' ? 'Choose agent and model' : menu === 'effort' ? 'Reasoning effort' : menu === 'folder' ? 'Working folder' : menu === 'branch' ? 'Git branch' : 'Access level'} ref={panel} data-glui-ui initial={{ opacity: 0, y: 5, scale: .985 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 3 }} transition={{ duration: .13 }} onKeyDown={e => {
      if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key) || (e.target instanceof HTMLInputElement && e.key !== 'ArrowDown')) return
      const options = Array.from(panel.current?.querySelectorAll<HTMLButtonElement>('.composer-option:not(:disabled)') ?? [])
      if (!options.length) return
      e.preventDefault()
      const current = options.indexOf(document.activeElement as HTMLButtonElement)
      const index = e.key === 'Home' ? 0 : e.key === 'End' ? options.length - 1 : (current + (e.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length
      options[index]?.focus()
    }} style={{ position: 'fixed', ...position, display: 'flex', flexDirection: 'column', pointerEvents: 'auto', borderRadius: 16, background: colors.popoverBg, color: colors.textPrimary, border: `1px solid ${colors.popoverBorder}`, boxShadow: colors.popoverShadow, padding: 6, overflowX: 'hidden', overflowY: 'auto' }}>
      {menu === 'model' ? <>
        <div style={{ display: 'flex', gap: 4, padding: '5px 3px 9px', borderBottom: `1px solid ${colors.containerBorder}` }}>
          {(Object.keys(PROVIDERS) as ProviderId[]).map(id => <button key={id} type="button" disabled={switching || providers.find(p => p.id === id)?.installed === false} aria-pressed={id === selectedProvider} title={providers.find(p => p.id === id)?.installed === false ? `${PROVIDERS[id].name} is not installed` : PROVIDERS[id].name} className="composer-provider" style={{ background: id === selectedProvider ? colors.accentLight : 'transparent', color: id === selectedProvider ? colors.accent : colors.textSecondary }} onClick={async () => {
            setSwitching(true); setError('')
            try { await setProvider(id); setQuery('') } catch (error) { setError(String(error)) } finally { setSwitching(false) }
          }}><ProviderIcon provider={id} size={16} />{id === 'claude' ? 'Claude' : PROVIDERS[id].name}</button>)}
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '10px 9px', color: colors.textTertiary }}><MagnifyingGlass size={14} /><input autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder="Find a model…" aria-label="Find a model" style={{ width: '100%', background: 'transparent', color: colors.textPrimary, outline: 'none', fontSize: 12 }} /></label>
        <div style={{ overflowY: 'auto', minHeight: 48 }}>
          {loading || switching ? <div className="composer-empty"><SpinnerGap size={16} className="animate-spin" />Loading models…</div> : catalogError ? <div role="alert" className="composer-empty">{catalogError}<button onClick={() => void refresh()}>Retry</button></div> : <>
            {settings.options.filter(m => !query || `${m.label} ${m.id}`.toLowerCase().includes(query.toLowerCase())).map(m => row(m.id ?? 'default', m.label, m.id === settings.defaultModel ? 'Agent default' : m.detail, m.id === modelId, () => choose(() => setModel(m.id))))}
            {!settings.options.some(m => `${m.label} ${m.id}`.toLowerCase().includes(query.toLowerCase())) && <div className="composer-empty">No matching models</div>}
          </>}
        </div>
        <div style={{ padding: '8px 10px 4px', color: colors.textTertiary, fontSize: 10 }}>Changing agents continues this conversation.</div>
      </> : menu === 'effort' ? <><div className="composer-menu-title">{effort?.label ?? 'Reasoning effort'}</div>{effort?.options?.map(o => row(o.id, o.label, o.description, effortValue === o.id, () => choose(() => setOption(effort.id, o.id))))}</> : menu === 'folder' ? <><div className="composer-menu-title">Working folder</div><div style={{ padding: '5px 10px 10px', fontSize: 11, color: colors.textSecondary, overflowWrap: 'anywhere', userSelect: 'text' }}>{tab?.workingDirectory}</div>{row('choose-folder', 'Choose folder…', tab?.messages.length ? 'Starts a new conversation in the selected folder.' : undefined, false, async () => { const directory = await window.glui.selectDirectory(); if (directory) { setDirectory(directory); setMenu(null) } })}</> : menu === 'branch' ? <><div className="composer-menu-title">Current branch</div>{row('current-branch', workspace.branch || 'Detached', workspace.root || undefined, true, () => {})}{row('manage-branch', 'Branches & worktrees', 'Open the workspace branch controls.', false, () => { setMenu(null); void window.glui.openWorkspace(tab?.id) })}</> : <><div className="composer-menu-title">Access for this conversation</div>{(settings.runtimeModes ?? ['approval-required', 'auto', 'full-access'] as PillRuntimeMode[]).map(mode => row(mode, ACCESS[mode].label, mode === 'auto' && selectedProvider === 'opencode' ? 'Allow edits automatically; ask before other actions.' : ACCESS[mode].description, access === mode, () => choose(() => setAccess(mode))))}</>}
      {error && <div role="alert" style={{ padding: 10, fontSize: 11, color: colors.statusError }}>{error}</div>}
    </motion.div>}</AnimatePresence>, layer)}
  </div>
}
