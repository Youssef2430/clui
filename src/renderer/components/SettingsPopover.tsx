import { PROVIDERS } from '../../shared/providers'
import React, { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'framer-motion'
import { DotsThree, Bell, ArrowsOutSimple, Moon, ArrowsClockwise, Check } from '@phosphor-icons/react'
import { useThemeStore, BRAND_PALETTES, type BrandPalette } from '../theme'
import { useSessionStore } from '../stores/sessionStore'
import { usePopoverLayer } from './PopoverLayer'
import { useColors } from '../theme'
import { usePanelSize } from '../panel-size'

function RowToggle({
  checked,
  onChange,
  colors,
  label,
}: {
  checked: boolean
  onChange: (next: boolean) => void
  colors: ReturnType<typeof useColors>
  label: string
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={checked}
      onClick={() => onChange(!checked)}
      className="relative w-9 h-5 rounded-full transition-colors"
      style={{
        background: checked ? colors.accent : colors.surfaceSecondary,
        border: `1px solid ${checked ? colors.accent : colors.containerBorder}`,
      }}
    >
      <span
        className="absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full transition-all"
        style={{
          left: checked ? 18 : 2,
          background: checked ? colors.containerBg : '#fff',
        }}
      />
    </button>
  )
}

/* ─── Settings popover ─── */

export function SettingsPopover() {
  const brandPalette = useThemeStore(s => s.brandPalette)
  const setBrandPalette = useThemeStore(s => s.setBrandPalette)
  const providers = useSessionStore(s => s.providers)
  const refreshProviders = useSessionStore(s => s.refreshProviders)
  const soundEnabled = useThemeStore((s) => s.soundEnabled)
  const setSoundEnabled = useThemeStore((s) => s.setSoundEnabled)
  const themeMode = useThemeStore((s) => s.themeMode)
  const setThemeMode = useThemeStore((s) => s.setThemeMode)
  const expandedUI = useThemeStore((s) => s.expandedUI)
  const setExpandedUI = useThemeStore((s) => s.setExpandedUI)
  const updateReady = useThemeStore((s) => s.updateReady)
  const updateVersion = useThemeStore((s) => s.updateVersion)
  const isExpanded = useSessionStore((s) => s.isExpanded && !s.marketplaceOpen && !s.searchPanelOpen)
  const popoverLayer = usePopoverLayer()
  const colors = useColors()
  const [checking, setChecking] = useState(false)

  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ right: number; top?: number; bottom?: number; maxHeight?: number }>({ right: 0 })

  const updatePos = useCallback(() => {
    if (!triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    const gap = 6 // Match HistoryPicker spacing exactly.
    const margin = 8
    const right = Math.max(margin, Math.min(window.innerWidth - rect.right, window.innerWidth - 280 - margin))

    if (isExpanded) {
      // Keep anchored below trigger (so it never covers the dots button),
      // and shrink if needed instead of shifting upward onto the trigger.
      const top = rect.bottom + gap
      setPos({
        top,
        right,
        maxHeight: Math.max(0, window.innerHeight - top - margin),
      })
      return
    }

    // Same logic as HistoryPicker for collapsed mode: open upward from trigger.
    setPos({
      bottom: window.innerHeight - rect.top + gap,
      right,
      maxHeight: Math.max(0, rect.top - gap - margin),
    })
  }, [isExpanded])

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

  useEffect(() => {
    if (!open) return
    const onResize = () => updatePos()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [open, updatePos])

  // Keep panel tracking the trigger continuously while open so it follows
  // width/position animations of the top bar without feeling "stuck in space."
  useEffect(() => {
    if (!open) return
    let raf = 0
    const tick = () => {
      updatePos()
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => {
      if (raf) cancelAnimationFrame(raf)
    }
  }, [open, expandedUI, isExpanded, updatePos])

  const handleToggle = () => {
    if (!open) updatePos()
    setOpen((o) => !o)
  }

  return (
    <>
      <button
        ref={triggerRef}
        onClick={handleToggle}
        className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-full transition-colors"
        style={{ color: colors.textTertiary }}
        title="Settings"
      >
        <DotsThree size={16} weight="bold" />
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
            width: 280,
            maxWidth: 'calc(100vw - 16px)',
            pointerEvents: 'auto',
            background: colors.popoverBg,
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            boxShadow: colors.popoverShadow,
            border: `1px solid ${colors.popoverBorder}`,
            ...(pos.maxHeight != null ? { maxHeight: pos.maxHeight, overflowY: 'auto' as const } : {}),
          }}
        >
          <div className="p-3 flex flex-col gap-2.5">
            <div style={{ color: colors.textPrimary, fontSize: 12, fontWeight: 600 }}>GLUI <span style={{ color: colors.textTertiary, fontWeight: 400 }}> / Glue UI</span></div>
            <div className="theme-options" role="group" aria-label="Theme">
              {Object.entries(BRAND_PALETTES).map(([id, p]) => (
                <button key={id} className="theme-option" aria-label={`${p.name}${id === 'glass' ? ' (default)' : ''}`} aria-pressed={brandPalette === id} onClick={() => setBrandPalette(id as BrandPalette)}>
                  <span className={`theme-preview theme-preview-${id}`} style={{ backgroundColor: p.cream }} aria-hidden="true">
                    <span className="theme-preview-orb" style={{ background: p.rose }} />
                    <span className="theme-preview-pill" style={{ background: p.ivory }}><span style={{ background: p.accent }} /></span>
                    {brandPalette === id && <span className="theme-selected"><Check size={9} weight="bold" /></span>}
                  </span>
                  <span className="theme-name">{p.name}</span>
                  <span className="theme-description">{id === 'glass' ? 'Default' : id === 'burgundy' ? 'Warm & rich' : 'Quiet & green'}</span>
                </button>
              ))}
            </div>
            <div className="flex items-center justify-between" style={{ color: colors.textPrimary, fontSize: 12 }}>
              <span>Appearance</span>
              <div className="appearance-options" role="group" aria-label="Appearance">
                {(['light', 'dark', 'system'] as const).map(mode => <button key={mode} aria-pressed={themeMode === mode} aria-label={`${mode[0].toUpperCase()}${mode.slice(1)} appearance`} onClick={() => setThemeMode(mode)}>{mode[0].toUpperCase()}{mode.slice(1)}</button>)}
              </div>
            </div>
            <div style={{ height: 1, background: colors.popoverBorder }} />
            <div className="flex justify-between" style={{ fontSize: 12, color: colors.textPrimary }}>Agents <button onClick={() => void refreshProviders()} style={{ color: colors.accent }}>Refresh</button></div>
            {providers.map(p => <div key={p.id} style={{ fontSize: 11, color: colors.textSecondary }}><span title={PROVIDERS[p.id].login}>{PROVIDERS[p.id].name}</span> <span style={{ float: 'right', color: p.installed ? colors.statusComplete : colors.statusError }}>{p.installed ? p.version : 'Not installed'}</span>{!p.installed && <code style={{ display: 'block', userSelect: 'text', fontSize: 10, marginTop: 4 }}>{PROVIDERS[p.id].install}</code>}</div>)}
            {/* Full width */}
            <div>
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <ArrowsOutSimple size={14} style={{ color: colors.textTertiary }} />
                  <div className="text-[12px] font-medium" style={{ color: colors.textPrimary }}>
                    Full width
                  </div>
                </div>
                <RowToggle
                  checked={expandedUI}
                  onChange={(next) => {
                    setExpandedUI(next)
                    usePanelSize.getState().setSize(null)
                  }}
                  colors={colors}
                  label="Toggle full width panel"
                />
              </div>
            </div>

            <div style={{ height: 1, background: colors.popoverBorder }} />

            {/* Notification sound */}
            <div>
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <Bell size={14} style={{ color: colors.textTertiary }} />
                  <div className="text-[12px] font-medium" style={{ color: colors.textPrimary }}>
                    Notification sound
                  </div>
                </div>
                <RowToggle
                  checked={soundEnabled}
                  onChange={setSoundEnabled}
                  colors={colors}
                  label="Toggle notification sound"
                />
              </div>
            </div>

            <div style={{ height: 1, background: colors.popoverBorder }} />

            {/* Check for updates */}
            <div>
              <button
                className="flex items-center gap-2 min-w-0 w-full text-left"
                disabled={!!updateVersion && !updateReady}
                onClick={async () => {
                  if (updateReady) {
                    window.glui.installUpdate()
                    return
                  }
                  setChecking(true)
                  try {
                    await window.glui.checkForUpdate()
                  } catch {}
                  setTimeout(() => setChecking(false), 3000)
                }}
              >
                <ArrowsClockwise
                  size={14}
                  style={{ color: updateVersion ? colors.accent : colors.textTertiary }}
                  className={checking || (updateVersion && !updateReady) ? 'animate-spin' : ''}
                />
                <div className="text-[12px] font-medium" style={{ color: updateVersion ? colors.accent : colors.textPrimary }}>
                  {updateReady
                    ? `Update to v${updateVersion}`
                    : updateVersion
                      ? `Downloading v${updateVersion}…`
                      : checking
                        ? 'Checking…'
                        : 'Check for updates'}
                </div>
              </button>
            </div>
          </div>
        </motion.div>,
        popoverLayer,
      )}
    </>
  )
}
