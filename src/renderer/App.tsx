import React, { useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Paperclip, Camera, HeadCircuit } from '@phosphor-icons/react'
import { TabStrip } from './components/TabStrip'
import { ConversationView } from './components/ConversationView'
import { InputBar, type InputBarHandle } from './components/InputBar'
import { StatusBar } from './components/StatusBar'
import { MarketplacePanel } from './components/MarketplacePanel'
import { BtwBubble } from './components/BtwBubble'
import { PopoverLayerProvider } from './components/PopoverLayer'
import { useClaudeEvents } from './hooks/useClaudeEvents'
import { useHealthReconciliation } from './hooks/useHealthReconciliation'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import { useSessionStore } from './stores/sessionStore'
import { useColors, useThemeStore, spacing } from './theme'
import { OVERLAY_BAR_WIDTH, OVERLAY_PILL_HEIGHT, OVERLAY_PILL_BOTTOM_MARGIN } from '../shared/types'

const TRANSITION = { duration: 0.26, ease: [0.4, 0, 0.1, 1] as const }

export default function App() {
  useClaudeEvents()
  useHealthReconciliation()

  const activeTabStatus = useSessionStore((s) => s.tabs.find((t) => t.id === s.activeTabId)?.status)
  const addAttachments = useSessionStore((s) => s.addAttachments)
  const colors = useColors()
  const setSystemTheme = useThemeStore((s) => s.setSystemTheme)
  const expandedUI = useThemeStore((s) => s.expandedUI)

  // ─── Theme initialization ───
  useEffect(() => {
    // Get initial OS theme — setSystemTheme respects themeMode (system/light/dark)
    window.clui.getTheme().then(({ isDark }) => {
      setSystemTheme(isDark)
    }).catch(() => {})

    // Listen for OS theme changes
    const unsubTheme = window.clui.onThemeChange((isDark) => {
      setSystemTheme(isDark)
    })

    // Listen for auto-update events
    const unsubUpdateAvail = window.clui.onUpdateAvailable(({ version }) => {
      useThemeStore.getState().setUpdateAvailable(version)
    })
    const unsubUpdateReady = window.clui.onUpdateDownloaded(({ version }) => {
      useThemeStore.getState().setUpdateReady(version)
    })

    return () => {
      unsubTheme()
      unsubUpdateAvail()
      unsubUpdateReady()
    }
  }, [setSystemTheme])

  useEffect(() => {
    useSessionStore.getState().initStaticInfo().then(() => {
      const homeDir = useSessionStore.getState().staticInfo?.homePath || '~'
      const tab = useSessionStore.getState().tabs[0]
      if (tab) {
        // Set working directory to home by default (user hasn't chosen yet)
        useSessionStore.setState((s) => ({
          tabs: s.tabs.map((t, i) => (i === 0 ? { ...t, workingDirectory: homeDir, hasChosenDirectory: false } : t)),
        }))
        window.clui.createTab().then(({ tabId }) => {
          useSessionStore.setState((s) => ({
            tabs: s.tabs.map((t, i) => (i === 0 ? { ...t, id: tabId } : t)),
            activeTabId: tabId,
          }))
        }).catch(() => {})
      }
    })
  }, [])

  // Shared drag ref — must be declared before the setIgnoreMouseEvents effect so both closures can read it
  const dragRef = useRef<{ startX: number; startY: number } | null>(null)
  // RAF handle and pending delta accumulator for IPC throttling during drag
  const dragRAFRef = useRef<number | null>(null)
  const pendingDeltaRef = useRef({ dx: 0, dy: 0 })

  // Vertical position tracking — window moves first (until macOS clamps it), then CSS overflows
  const minWindowY = window.screen.availTop   // top of work area (below menu bar)
  const initialWindowY = window.screen.availTop + window.screen.availHeight - OVERLAY_PILL_HEIGHT - OVERLAY_PILL_BOTTOM_MARGIN
  const windowYRef = useRef(initialWindowY)
  const cardYRef = useRef(0) // CSS translateY offset (only used after window hits its y constraint)

  // Horizontal snap tracking
  const windowXRef = useRef(
    window.screen.availLeft + Math.round((window.screen.availWidth - OVERLAY_BAR_WIDTH) / 2)
  )
  const snapGridRef = useRef<HTMLDivElement>(null)

  // OS-level click-through (RAF-throttled to avoid per-pixel IPC)
  useEffect(() => {
    if (!window.clui?.setIgnoreMouseEvents) return
    let lastIgnored: boolean | null = null

    const onMouseMove = (e: MouseEvent) => {
      // While dragging, keep full mouse capture — don't toggle ignore-events
      if (dragRef.current) return
      const el = document.elementFromPoint(e.clientX, e.clientY)
      const isUI = !!(el && el.closest('[data-clui-ui]'))
      const shouldIgnore = !isUI
      if (shouldIgnore !== lastIgnored) {
        lastIgnored = shouldIgnore
        if (shouldIgnore) {
          window.clui.setIgnoreMouseEvents(true, { forward: true })
        } else {
          window.clui.setIgnoreMouseEvents(false)
        }
      }
    }

    const onMouseLeave = () => {
      if (dragRef.current) return
      if (lastIgnored !== true) {
        lastIgnored = true
        window.clui.setIgnoreMouseEvents(true, { forward: true })
      }
    }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseleave', onMouseLeave)
    return () => {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseleave', onMouseLeave)
    }
  }, [])

  // Manual window drag — bypasses -webkit-app-region conflicts with setIgnoreMouseEvents
  useEffect(() => {
    if (!window.clui?.startWindowDrag) return

    // Snap zone helpers — horizontal only (left / center / right)
    const getSnapZone = (windowX: number): 'left' | 'center' | 'right' => {
      const availLeft = window.screen.availLeft
      const availWidth = window.screen.availWidth
      const cardCenter = windowX + OVERLAY_BAR_WIDTH / 2
      if (cardCenter < availLeft + availWidth / 3) return 'left'
      if (cardCenter > availLeft + (availWidth * 2) / 3) return 'right'
      return 'center'
    }

    const getSnapTargetX = (zone: 'left' | 'center' | 'right'): number => {
      const availLeft = window.screen.availLeft
      const availWidth = window.screen.availWidth
      if (zone === 'left') return availLeft
      if (zone === 'right') return availLeft + availWidth - OVERLAY_BAR_WIDTH
      return availLeft + Math.round((availWidth - OVERLAY_BAR_WIDTH) / 2)
    }

    // RAF-batched drag processor — runs once per animation frame during drags
    const processDrag = () => {
      dragRAFRef.current = null
      if (!dragRef.current) return
      const { dx, dy } = pendingDeltaRef.current
      pendingDeltaRef.current = { dx: 0, dy: 0 }
      if (dx === 0 && dy === 0) return

      // Horizontal: always native window movement (full screen width range)
      if (dx !== 0) {
        window.clui.startWindowDrag(dx, 0)
        windowXRef.current += dx
        const zone = getSnapZone(windowXRef.current)
        if (snapGridRef.current) {
          snapGridRef.current.dataset.zone = zone
        }
        window.clui.updateSnapZone(zone)
      }

      // Vertical: move window first (until macOS y constraint), then CSS within window
      if (dy !== 0) {
        if (dy < 0) {
          // Moving up — window first, then CSS overflow
          const windowCanMove = windowYRef.current - minWindowY
          const windowDy = Math.max(-windowCanMove, dy)
          const cssDy = dy - windowDy
          if (windowDy !== 0) {
            window.clui.startWindowDrag(0, windowDy)
            windowYRef.current += windowDy
          }
          if (cssDy !== 0) {
            cardYRef.current += cssDy
            document.documentElement.style.setProperty('--clui-card-y', `${cardYRef.current}px`)
          }
        } else {
          // Moving down — undo CSS first, then move window
          const cssUndo = Math.min(-cardYRef.current, dy)
          const windowDy = dy - cssUndo
          if (cssUndo !== 0) {
            cardYRef.current += cssUndo
            document.documentElement.style.setProperty('--clui-card-y', `${cardYRef.current}px`)
          }
          if (windowDy !== 0) {
            window.clui.startWindowDrag(0, windowDy)
            windowYRef.current += windowDy
          }
        }
      }
    }

    const onMouseDown = (e: MouseEvent) => {
      // Only respond to primary (left) button — prevent accidental drags from right/middle clicks
      if (e.button !== 0) return
      const el = e.target as HTMLElement
      // Skip interactive elements — everything else on the card is draggable
      if (el.closest('button, input, textarea, a, select, [role="button"], [contenteditable], .cm-editor')) return
      if (!el.closest('[data-clui-ui]')) return
      e.preventDefault()
      // Double-click: snap back to center-bottom
      if (e.detail >= 2) {
        window.clui.resetWindowPosition()
        windowYRef.current = initialWindowY
        windowXRef.current = window.screen.availLeft + Math.round((window.screen.availWidth - OVERLAY_BAR_WIDTH) / 2)
        cardYRef.current = 0
        document.documentElement.style.setProperty('--clui-card-y', '0px')
        return
      }
      // Ensure full mouse capture for the duration of the drag
      window.clui.setIgnoreMouseEvents(false)
      dragRef.current = { startX: e.screenX, startY: e.screenY }
      // Show snap grid (dots below card + full-screen overlay)
      const zone = getSnapZone(windowXRef.current)
      if (snapGridRef.current) {
        snapGridRef.current.dataset.zone = zone
        snapGridRef.current.style.opacity = '1'
      }
      window.clui.showSnapGrid()
      window.clui.updateSnapZone(zone)
    }

    const onMouseMove = (e: MouseEvent) => {
      if (!dragRef.current) return
      const dx = e.screenX - dragRef.current.startX
      const dy = e.screenY - dragRef.current.startY
      // Accumulate deltas and update start position immediately for correct per-frame accounting
      dragRef.current.startX = e.screenX
      dragRef.current.startY = e.screenY
      pendingDeltaRef.current.dx += dx
      pendingDeltaRef.current.dy += dy
      // Coalesce IPC calls to one per animation frame — prevents high IPC rate on fast mousemove
      if (dragRAFRef.current === null) {
        dragRAFRef.current = requestAnimationFrame(processDrag)
      }
    }

    const onMouseUp = (e: MouseEvent) => {
      if (dragRef.current) {
        // Cancel any pending RAF and discard accumulated delta — mouseup ends the drag
        if (dragRAFRef.current !== null) {
          cancelAnimationFrame(dragRAFRef.current)
          dragRAFRef.current = null
          pendingDeltaRef.current = { dx: 0, dy: 0 }
        }
        // Snap window to nearest horizontal zone
        const zone = getSnapZone(windowXRef.current)
        const targetX = getSnapTargetX(zone)
        const deltaX = targetX - windowXRef.current
        if (deltaX !== 0) {
          window.clui.startWindowDrag(deltaX, 0)
          windowXRef.current = targetX
        }
        // Hide snap grid (dots + full-screen overlay)
        if (snapGridRef.current) {
          snapGridRef.current.style.opacity = '0'
        }
        window.clui.hideSnapGrid()

        dragRef.current = null

        // Restore setIgnoreMouseEvents based on the element under the cursor at release.
        // Without this, releasing over a transparent region leaves the window intercepting
        // clicks until the next mousemove event fires.
        const el = document.elementFromPoint(e.clientX, e.clientY)
        const isUI = !!(el && el.closest('[data-clui-ui]'))
        if (!isUI) {
          window.clui.setIgnoreMouseEvents(true, { forward: true })
        } else {
          window.clui.setIgnoreMouseEvents(false)
        }
      }
    }

    document.addEventListener('mousedown', onMouseDown)
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
    return () => {
      document.removeEventListener('mousedown', onMouseDown)
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
      if (dragRAFRef.current !== null) cancelAnimationFrame(dragRAFRef.current)
    }
  }, [])

  const isExpanded = useSessionStore((s) => s.isExpanded)
  const marketplaceOpen = useSessionStore((s) => s.marketplaceOpen)
  const isRunning = activeTabStatus === 'running' || activeTabStatus === 'connecting'
  const inputBarRef = useRef<InputBarHandle>(null)

  // Layout dimensions — expandedUI widens and heightens the panel
  const contentWidth = expandedUI ? 700 : spacing.contentWidth
  const cardExpandedWidth = expandedUI ? 700 : 460
  const cardCollapsedWidth = expandedUI ? 670 : 430
  const cardCollapsedMargin = expandedUI ? 15 : 15
  const bodyMaxHeight = expandedUI ? 520 : 400

  const handleScreenshot = useCallback(async () => {
    const result = await window.clui.takeScreenshot()
    if (!result) return
    addAttachments([result])
  }, [addAttachments])

  const handleAttachFile = useCallback(async () => {
    const files = await window.clui.attachFiles()
    if (!files || files.length === 0) return
    addAttachments(files)
  }, [addAttachments])

  useKeyboardShortcuts({
    onAttachFile: handleAttachFile,
    onScreenshot: handleScreenshot,
    onFocusInput: useCallback(() => inputBarRef.current?.focus(), []),
    onOpenSlashMenu: useCallback(() => inputBarRef.current?.openSlashMenu(), []),
    onVoiceCapture: useCallback(() => inputBarRef.current?.toggleVoice(), []),
  })

  return (
    <PopoverLayerProvider>
      <div className="flex flex-col justify-end h-full" style={{ background: 'transparent' }}>

        {/* ─── 460px content column, centered. Circles overflow left. ─── */}
        <div style={{ width: contentWidth, position: 'relative', margin: '0 auto', transition: 'width 0.26s cubic-bezier(0.4, 0, 0.1, 1)', transform: 'translateY(var(--clui-card-y, 0px))' }}>

          <AnimatePresence initial={false}>
            {marketplaceOpen && (
              <div
                data-clui-ui
                style={{
                  width: 720,
                  maxWidth: 720,
                  marginLeft: '50%',
                  transform: 'translateX(-50%)',
                  marginBottom: 14,
                  position: 'relative',
                  zIndex: 30,
                }}
              >
                <motion.div
                  initial={{ opacity: 0, y: 14, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.985 }}
                  transition={TRANSITION}
                >
                  <div
                    data-clui-ui
                    className="glass-surface overflow-hidden no-drag"
                    style={{
                      borderRadius: 24,
                      maxHeight: 470,
                    }}
                  >
                    <MarketplacePanel />
                  </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>

          {/*
            ─── Tabs / message shell ───
            This always remains the chat shell. The marketplace is a separate
            panel rendered above it, never inside it.
          */}
          <motion.div
            data-clui-ui
            className="overflow-hidden flex flex-col drag-region"
            animate={{
              width: isExpanded ? cardExpandedWidth : cardCollapsedWidth,
              marginBottom: isExpanded ? 10 : -14,
              marginLeft: isExpanded ? 0 : cardCollapsedMargin,
              marginRight: isExpanded ? 0 : cardCollapsedMargin,
              background: isExpanded ? colors.containerBg : colors.containerBgCollapsed,
              borderColor: colors.containerBorder,
              boxShadow: isExpanded ? colors.cardShadow : colors.cardShadowCollapsed,
            }}
            transition={TRANSITION}
            style={{
              borderWidth: 1,
              borderStyle: 'solid',
              borderRadius: 20,
              position: 'relative',
              zIndex: isExpanded ? 20 : 10,
            }}
          >
            {/* Tab strip — always mounted */}
            <div className="no-drag">
              <TabStrip />
            </div>

            {/* Body — chat history only; the marketplace is a separate overlay above */}
            <motion.div
              initial={false}
              animate={{
                height: isExpanded ? 'auto' : 0,
                opacity: isExpanded ? 1 : 0,
              }}
              transition={TRANSITION}
              className="overflow-hidden no-drag"
            >
              <div style={{ maxHeight: bodyMaxHeight }}>
                <ConversationView />
                <StatusBar />
              </div>
            </motion.div>
          </motion.div>

          {/* ─── BTW side question bubble ─── */}
          <BtwBubble />

          {/* ─── Input row — circles float outside left ─── */}
          {/* marginBottom: shadow buffer so the glass-surface drop shadow isn't clipped at the native window edge */}
          <div data-clui-ui className="relative" style={{ minHeight: 46, zIndex: 15, marginBottom: 10 }}>
            {/* Stacked circle buttons — expand on hover */}
            <div
              data-clui-ui
              className="circles-out"
            >
              <div className="btn-stack">
                {/* btn-1: Attach (front, rightmost) */}
                <button
                  className="stack-btn stack-btn-1 glass-surface"
                  title="Attach file"
                  onClick={handleAttachFile}
                  disabled={isRunning}
                >
                  <Paperclip size={17} />
                </button>
                {/* btn-2: Screenshot (middle) */}
                <button
                  className="stack-btn stack-btn-2 glass-surface"
                  title="Take screenshot"
                  onClick={handleScreenshot}
                  disabled={isRunning}
                >
                  <Camera size={17} />
                </button>
                {/* btn-3: Skills (back, leftmost) */}
                <button
                  className="stack-btn stack-btn-3 glass-surface"
                  title="Skills & Plugins"
                  onClick={() => useSessionStore.getState().toggleMarketplace()}
                  disabled={isRunning}
                >
                  <HeadCircuit size={17} />
                </button>
              </div>
            </div>

            {/* Input pill */}
            <div
              data-clui-ui
              className="glass-surface w-full"
              style={{ minHeight: 50, borderRadius: 25, padding: '0 6px 0 16px', background: colors.inputPillBg }}
            >
              <InputBar ref={inputBarRef} />
            </div>
          </div>

          {/* Snap zone indicator — shown during drag, hidden otherwise */}
          <div ref={snapGridRef} className="snap-grid" style={{ opacity: 0 }}>
            <div className="snap-dot snap-dot-left" />
            <div className="snap-dot snap-dot-center" />
            <div className="snap-dot snap-dot-right" />
          </div>
        </div>
      </div>
    </PopoverLayerProvider>
  )
}
