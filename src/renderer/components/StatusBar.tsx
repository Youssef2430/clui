import React, { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'framer-motion'
import { Terminal, Check } from '@phosphor-icons/react'
import { useSessionStore } from '../stores/sessionStore'
import { usePopoverLayer } from './PopoverLayer'
import { useColors, useThemeStore } from '../theme'
import type { PreferredTerminalId, TerminalInstallation } from '../../shared/types'

export function TerminalLaunchControl({
  sessionId,
  projectPath,
}: {
  sessionId: string | null
  projectPath: string
}) {
  const preferredTerminalId = useThemeStore((s) => s.preferredTerminalId)
  const setPreferredTerminalId = useThemeStore((s) => s.setPreferredTerminalId)
  const popoverLayer = usePopoverLayer()
  const colors = useColors()

  const [open, setOpen] = useState(false)
  const [terminals, setTerminals] = useState<TerminalInstallation[]>([])
  const [terminalsLoading, setTerminalsLoading] = useState(false)
  const popoverId = 'terminal-launch-control-popover'
  const triggerRef = useRef<HTMLButtonElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top?: number; bottom?: number; right: number; maxHeight: number }>({ right: 8, maxHeight: 320 })

  const refreshTerminals = useCallback(async () => {
    setTerminalsLoading(true)
    try {
      const items = await window.glui.listInstalledTerminals()
      setTerminals(items)
    } catch {
      setTerminals([])
    } finally {
      setTerminalsLoading(false)
    }
  }, [])

  const updatePos = useCallback(() => {
    if (!triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    const below = window.innerHeight - rect.bottom - 14
    const above = rect.top - 14
    const downward = below >= Math.min(280, above)
    setPos({
      ...(downward ? { top: rect.bottom + 6 } : { bottom: window.innerHeight - rect.top + 6 }),
      right: Math.max(8, Math.min(window.innerWidth - rect.right, window.innerWidth - 252)),
      maxHeight: Math.max(0, downward ? below : above),
    })
  }, [])

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      const target = e.target as Node
      if (triggerRef.current?.contains(target)) return
      if (popoverRef.current?.contains(target)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.stopPropagation()
      setOpen(false)
      triggerRef.current?.focus()
    }
    document.addEventListener('keydown', escape, true)
    return () => {
      document.removeEventListener('mousedown', handler)
      document.removeEventListener('keydown', escape, true)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    void refreshTerminals()

    const onResize = () => updatePos()
    const observer = new ResizeObserver(onResize)
    const column = triggerRef.current?.closest('.glui-column')
    if (column) observer.observe(column)
    window.addEventListener('resize', onResize)
    return () => { observer.disconnect(); window.removeEventListener('resize', onResize) }
  }, [open, refreshTerminals, updatePos])

  const selectedTerminal = preferredTerminalId === 'auto'
    ? null
    : terminals.find((terminal) => terminal.id === preferredTerminalId) ?? null
  const selectedTerminalValue: PreferredTerminalId = preferredTerminalId !== 'auto' && !terminalsLoading && !selectedTerminal
    ? 'auto'
    : preferredTerminalId

  const launchTerminal = (terminalId: PreferredTerminalId) => {
    void window.glui.openInTerminal(sessionId, projectPath, terminalId, useSessionStore.getState().tabs.find(t => t.id === useSessionStore.getState().activeTabId)?.provider)
  }

  const handleMenuToggle = () => {
    if (!open) updatePos()
    setOpen((isOpen) => !isOpen)
  }

  const handlePick = (terminalId: PreferredTerminalId) => {
    setPreferredTerminalId(terminalId)
    setOpen(false)
    launchTerminal(terminalId)
  }

  const currentDescription = selectedTerminal
    ? `Launches in ${selectedTerminal.label}`
    : preferredTerminalId === 'auto'
      ? 'Launches in your macOS default terminal app'
      : 'Launches in your saved terminal app'

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => launchTerminal(preferredTerminalId)}
        onContextMenu={event => { event.preventDefault(); handleMenuToggle() }}
        onKeyDown={event => {
          if (event.key === 'ArrowDown') { event.preventDefault(); handleMenuToggle() }
        }}
        className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-full transition-colors"
        style={{ color: colors.textTertiary }}
        title={`Open in CLI — ${currentDescription}. Right-click to choose terminal.`}
        aria-label="Open in CLI"
        aria-description="Right-click or press Arrow Down to choose a terminal app."
        aria-expanded={open}
        aria-controls={open ? popoverId : undefined}
        aria-haspopup="dialog"
      >
        <Terminal size={14} />
      </button>

      {popoverLayer && open && createPortal(
        <motion.div
          id={popoverId}
          role="dialog"
          aria-label="Choose terminal app"
          ref={popoverRef}
          data-glui-ui
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 4 }}
          transition={{ duration: 0.12 }}
          className="glui-popover rounded-xl"
          style={{
            position: 'fixed',
            ...pos,
            width: 244,
            maxWidth: 'calc(100vw - 16px)',
            overflowY: 'auto',
            pointerEvents: 'auto',
            background: colors.popoverBg,
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            boxShadow: colors.popoverShadow,
            border: `1px solid ${colors.popoverBorder}`,
          }}
        >
          <div className="p-1.5">
            <div className="px-2.5 pt-1 pb-1.5">
              <div className="text-[11px]" style={{ color: colors.textPrimary }}>
                Open in CLI
              </div>
              <div className="text-[11px] leading-[1.4] mt-1" style={{ color: colors.textTertiary }}>
                Pick an installed terminal to save it as the launcher. Automatic uses the macOS default handler.
              </div>
            </div>

            <button
              onClick={() => handlePick('auto')}
              className="w-full flex items-center justify-between rounded-lg px-2.5 py-2 text-[11px] text-left transition-colors"
              style={{
                color: selectedTerminalValue === 'auto' ? colors.textPrimary : colors.textSecondary,
                fontWeight: selectedTerminalValue === 'auto' ? 600 : 400,
              }}
            >
              <div className="min-w-0">
                <div className="truncate">Automatic</div>
                <div className="text-[11px] mt-0.5" style={{ color: colors.textTertiary }}>
                  Use macOS default terminal app
                </div>
              </div>
              {selectedTerminalValue === 'auto' && <Check size={12} style={{ color: colors.accent }} />}
            </button>

            <div className="mx-1 my-1" style={{ height: 1, background: colors.popoverBorder }} />

            {terminalsLoading && (
              <div className="px-2.5 py-2 text-[11px]" style={{ color: colors.textTertiary }}>
                Detecting installed terminal apps…
              </div>
            )}

            {!terminalsLoading && terminals.length === 0 && (
              <div className="px-2.5 py-2 text-[11px] leading-[1.4]" style={{ color: colors.textTertiary }}>
                No individual terminal apps were detected. Automatic still uses whatever macOS opens for terminal scripts.
              </div>
            )}

            {!terminalsLoading && terminals.map((terminal) => {
              const isSelected = terminal.id === selectedTerminalValue
              return (
                <button
                  key={terminal.id}
                  onClick={() => handlePick(terminal.id)}
                  className="w-full flex items-center justify-between rounded-lg px-2.5 py-2 text-[11px] text-left transition-colors"
                  style={{
                    color: isSelected ? colors.textPrimary : colors.textSecondary,
                    fontWeight: isSelected ? 600 : 400,
                  }}
                >
                  <span className="truncate pr-2">{terminal.label}</span>
                  {isSelected && <Check size={12} style={{ color: colors.accent }} />}
                </button>
              )
            })}
          </div>
        </motion.div>,
        popoverLayer,
      )}
    </>
  )
}
