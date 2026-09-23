import React, { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'framer-motion'
import { Clock, ChatCircle, FolderSimple } from '@phosphor-icons/react'
import { useSessionStore } from '../stores/sessionStore'
import { usePopoverLayer } from './PopoverLayer'
import { useColors } from '../theme'
import { shortPath, timeAgo } from '../utils/format'
import type { SessionMeta } from '../../shared/types'

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}K`
  return `${(bytes / (1024 * 1024)).toFixed(1)}M`
}

type HistoryScope = 'project' | 'all'

export function HistoryPicker() {
  const resumeSession = useSessionStore((s) => s.resumeSession)
  const isExpanded = useSessionStore((s) => s.isExpanded && !s.marketplaceOpen && !s.searchPanelOpen)
  const activeTab = useSessionStore(
    (s) => s.tabs.find((t) => t.id === s.activeTabId),
  )
  const staticInfo = useSessionStore((s) => s.staticInfo)
  const popoverLayer = usePopoverLayer()
  const colors = useColors()
  const effectiveProjectPath = activeTab?.hasChosenDirectory
    ? activeTab.workingDirectory
    : (staticInfo?.homePath || activeTab?.workingDirectory || '~')

  const historyPickerOpen = useSessionStore((s) => s.historyPickerOpen)
  const closeHistoryPicker = useSessionStore((s) => s.closeHistoryPicker)
  const [localOpen, setLocalOpen] = useState(false)
  const open = localOpen || historyPickerOpen
  const setOpen = useCallback((v: boolean | ((prev: boolean) => boolean)) => {
    setLocalOpen((prev) => {
      const next = typeof v === 'function' ? (v as (prev: boolean) => boolean)(prev) : v
      if (!next) closeHistoryPicker()
      return next
    })
  }, [closeHistoryPicker])
  // Sync local state when store closes externally (e.g. second Cmd+Shift+H press)
  useEffect(() => {
    if (!historyPickerOpen) setLocalOpen(false)
  }, [historyPickerOpen])
  const [scope, setScope] = useState<HistoryScope>('all')
  const [sessions, setSessions] = useState<SessionMeta[]>([])
  const [historyError, setHistoryError] = useState('')
  const [loading, setLoading] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ right: number; top?: number; bottom?: number; maxHeight?: number }>({ right: 0 })

  const updatePos = useCallback(() => {
    if (!triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    if (isExpanded) {
      const top = rect.bottom + 6
      setPos({
        top,
        right: window.innerWidth - rect.right,
        maxHeight: window.innerHeight - top - 12,
      })
    } else {
      setPos({
        bottom: window.innerHeight - rect.top + 6,
        right: window.innerWidth - rect.right,
      })
    }
  }, [isExpanded])

  const loadSessions = useCallback(async (s: HistoryScope) => {
    setLoading(true)
    setHistoryError('')
    const results = await Promise.allSettled([
      s === 'all' ? window.glui.listAllSessions(activeTab?.provider) : window.glui.listSessions(effectiveProjectPath, activeTab?.provider),
      window.glui.workspaceHistory(activeTab?.provider, s === 'all' ? undefined : effectiveProjectPath),
    ])
    setSessions(results.flatMap(result => result.status === 'fulfilled' ? result.value : []).sort((a, b) => Date.parse(b.lastTimestamp) - Date.parse(a.lastTimestamp)))
    if (results.some(result => result.status === 'rejected')) setHistoryError('Some history could not be loaded.')
    setLoading(false)
  }, [effectiveProjectPath, activeTab?.provider])

  // Respond to external toggle (Cmd+Shift+H)
  useEffect(() => {
    if (historyPickerOpen && !localOpen) {
      updatePos()
      void loadSessions(scope)
      setLocalOpen(true)
    }
  }, [historyPickerOpen, localOpen, updatePos, loadSessions, scope])

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      const target = e.target as Node
      if (triggerRef.current?.contains(target)) return
      if (popoverRef.current?.contains(target)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const handleToggle = () => {
    if (!open) {
      updatePos()
      void loadSessions(scope)
    }
    setOpen((o) => !o)
  }

  const handleScopeChange = (newScope: HistoryScope) => {
    setScope(newScope)
    void loadSessions(newScope)
  }

  const handleSelect = (session: SessionMeta) => {
    setOpen(false)
    const title = session.firstMessage
      ? (session.firstMessage.length > 30 ? session.firstMessage.substring(0, 27) + '...' : session.firstMessage)
      : session.slug || 'Resumed'
    // Use the session's original project path if available, otherwise fall back to current
    const projectPath = session.projectPath || effectiveProjectPath
    void resumeSession(session.sessionId, title, projectPath, session.provider || activeTab?.provider)
  }

  return (
    <>
      <button
        ref={triggerRef}
        onClick={handleToggle}
        className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-full transition-colors"
        style={{ color: colors.textTertiary }}
        title="Resume a previous session"
      >
        <Clock size={13} />
      </button>

      {popoverLayer && open && createPortal(
        <motion.div
          ref={popoverRef}
          data-glui-ui
          initial={{ opacity: 0, y: isExpanded ? -4 : 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: isExpanded ? -4 : 4 }}
          transition={{ duration: 0.12 }}
          className="glui-popover rounded-xl"
          style={{
            position: 'fixed',
            ...(pos.top != null ? { top: pos.top } : {}),
            ...(pos.bottom != null ? { bottom: pos.bottom } : {}),
            right: pos.right,
            width: 300,
            pointerEvents: 'auto',
            background: colors.popoverBg,
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            boxShadow: colors.popoverShadow,
            border: `1px solid ${colors.popoverBorder}`,
            ...(pos.maxHeight != null ? { maxHeight: pos.maxHeight } : {}),
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column' as const,
          }}
        >
          {/* Header with scope toggle */}
          <div className="px-3 py-2 flex items-center justify-between flex-shrink-0" style={{ borderBottom: `1px solid ${colors.popoverBorder}` }}>
            <span className="text-[11px] font-medium" style={{ color: colors.textTertiary }}>
              Recent Sessions
            </span>
            <div
              className="flex rounded-md overflow-hidden"
              style={{ border: `1px solid ${colors.toolBorder}` }}
            >
              {(['project', 'all'] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => handleScopeChange(s)}
                  className="text-[10px] px-2 py-0.5 transition-colors"
                  style={{
                    background: scope === s ? colors.surfaceHover : 'transparent',
                    color: scope === s ? colors.textPrimary : colors.textTertiary,
                    border: 'none',
                  }}
                >
                  {s === 'project' ? 'Project' : 'All'}
                </button>
              ))}
            </div>
          </div>

          <div className="overflow-y-auto py-1" style={{ maxHeight: pos.maxHeight != null ? undefined : 240 }}>
            {loading && (
              <div className="px-3 py-4 text-center text-[11px]" style={{ color: colors.textTertiary }}>
                Loading...
              </div>
            )}

            {historyError && <div role="alert" className="px-3 py-2 text-[11px]" style={{ color: colors.statusError }}>{historyError} <button onClick={() => void loadSessions(scope)}>Retry</button></div>}
            {!loading && sessions.length === 0 && (
              <div className="px-3 py-4 text-center text-[11px]" style={{ color: colors.textTertiary }}>
                No previous sessions found
              </div>
            )}

            {!loading && sessions.map((session) => (
              <button
                key={session.sessionId}
                onClick={() => handleSelect(session)}
                className="w-full flex items-start gap-2.5 px-3 py-2 text-left transition-colors"
              >
                <ChatCircle size={13} className="flex-shrink-0 mt-0.5" style={{ color: colors.textTertiary }} />
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] truncate" style={{ color: colors.textPrimary }}>
                    {session.firstMessage || session.slug || session.sessionId.substring(0, 8)}
                  </div>
                  <div className="flex items-center gap-2 text-[10px] mt-0.5" style={{ color: colors.textTertiary }}>
                    <span>{timeAgo(session.lastTimestamp)}</span>
                    <span>{session.sessionId.startsWith('glui:') ? 'GLUI conversation' : 'CLI history'}</span>
                    {session.slug && <span className="truncate">{session.slug}</span>}
                  </div>
                  {/* Show project path when viewing all sessions */}
                  {scope === 'all' && session.projectPath && (
                    <div className="flex items-center gap-1 text-[9px] mt-0.5" style={{ color: colors.textTertiary, opacity: 0.7 }}>
                      <FolderSimple size={9} className="flex-shrink-0" />
                      <span className="truncate">{shortPath(session.projectPath)}</span>
                    </div>
                  )}
                </div>
              </button>
            ))}
          </div>
        </motion.div>,
        popoverLayer,
      )}
    </>
  )
}
