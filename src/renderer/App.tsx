import React, { useEffect, useCallback, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Paperclip, Camera, HeadCircuit } from '@phosphor-icons/react'
import { TabStrip } from './components/TabStrip'
import { ConversationView } from './components/ConversationView'
import { InputBar, type InputBarHandle } from './components/InputBar'
import { ComposerControls } from './components/ComposerControls'
import { MarketplacePanel } from './components/MarketplacePanel'
import { SearchPanel } from './components/SearchPanel'
import { BtwBubble } from './components/BtwBubble'
import { PopoverLayerProvider } from './components/PopoverLayer'
import { useAgentEvents } from './hooks/useAgentEvents'
import { useHealthReconciliation } from './hooks/useHealthReconciliation'
import { useSearchEvents } from './hooks/useSearchEvents'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import { useSessionStore } from './stores/sessionStore'
import { useThemeStore, spacing } from './theme'
import { fitPanelSize, usePanelSize } from './panel-size'
import { ResizeHandle } from './components/ResizeHandle'
import { useGlassMaterial } from './hooks/useGlassMaterial'

const TRANSITION = { duration: 0.26, ease: [0.4, 0, 0.1, 1] as const }

export default function App() {
  useAgentEvents()
  useHealthReconciliation()
  useSearchEvents()
  useGlassMaterial()

  const activeTabStatus = useSessionStore((s) => s.tabs.find((t) => t.id === s.activeTabId)?.status)
  const addAttachments = useSessionStore((s) => s.addAttachments)
  const setSystemTheme = useThemeStore((s) => s.setSystemTheme)
  const expandedUI = useThemeStore((s) => s.expandedUI)

  // ─── Theme initialization ───
  useEffect(() => {
    // Get initial OS theme — setSystemTheme respects themeMode (system/light/dark)
    window.glui.getTheme().then(({ isDark }) => {
      setSystemTheme(isDark)
    }).catch(() => {})

    // Listen for OS theme changes
    const unsubTheme = window.glui.onThemeChange((isDark) => {
      setSystemTheme(isDark)
    })

    // Listen for auto-update events
    const unsubUpdateAvail = window.glui.onUpdateAvailable(({ version }) => {
      useThemeStore.getState().setUpdateAvailable(version)
    })
    const unsubUpdateReady = window.glui.onUpdateDownloaded(({ version }) => {
      useThemeStore.getState().setUpdateReady(version)
    })

    return () => {
      unsubTheme()
      unsubUpdateAvail()
      unsubUpdateReady()
    }
  }, [setSystemTheme])

  useEffect(() => {
    void useSessionStore.getState().initStaticInfo().then(() => {
      const homeDir = useSessionStore.getState().staticInfo?.homePath
      if (!homeDir) return
      useSessionStore.setState(s => ({ tabs: s.tabs.map(t => !t.hasChosenDirectory && t.workingDirectory === '~' ? { ...t, workingDirectory: homeDir } : t) }))
      // Backend registration is lazy and idempotent. Never replace a tab ID after
      // the user has already selected a provider or submitted their first prompt.
    })
  }, [])

  // OS-level click-through (RAF-throttled to avoid per-pixel IPC)
  useEffect(() => {
    if (!window.glui?.setIgnoreMouseEvents) return
    let lastIgnored: boolean | null = null

    const onMouseMove = (e: MouseEvent) => {
      if (document.documentElement.classList.contains('panel-resizing')) return
      const el = document.elementFromPoint(e.clientX, e.clientY)
      const isUI = !!(el && el.closest('[data-glui-ui]'))
      const shouldIgnore = !isUI
      if (shouldIgnore !== lastIgnored) {
        lastIgnored = shouldIgnore
        if (shouldIgnore) {
          window.glui.setIgnoreMouseEvents(true, { forward: true })
        } else {
          window.glui.setIgnoreMouseEvents(false)
        }
      }
    }

    const onMouseLeave = () => {
      if (document.documentElement.classList.contains('panel-resizing')) return
      if (lastIgnored !== true) {
        lastIgnored = true
        window.glui.setIgnoreMouseEvents(true, { forward: true })
      }
    }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseleave', onMouseLeave)
    return () => {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseleave', onMouseLeave)
    }
  }, [])

  const isExpanded = useSessionStore((s) => s.isExpanded)
  const marketplaceOpen = useSessionStore((s) => s.marketplaceOpen)
  const searchPanelOpen = useSessionStore((s) => s.searchPanelOpen)
  const isRunning = activeTabStatus === 'running' || activeTabStatus === 'connecting'
  const inputBarRef = useRef<InputBarHandle>(null)
  const composerRef = useRef<HTMLDivElement>(null)
  const customSize = usePanelSize(s => s.size)
  const [viewport, setViewport] = useState({ width: innerWidth, height: innerHeight })
  const [composerHeight, setComposerHeight] = useState(92)
  const [resizing, setResizing] = useState(false)
  useEffect(() => {
    const resize = () => setViewport({ width: innerWidth, height: innerHeight })
    window.addEventListener('resize', resize)
    const observer = new ResizeObserver(() => setComposerHeight(composerRef.current?.getBoundingClientRect().height ?? 92))
    if (composerRef.current) observer.observe(composerRef.current)
    return () => { window.removeEventListener('resize', resize); observer.disconnect() }
  }, [])

  // Layout dimensions — expandedUI widens and heightens the panel
  const chromeHeight = composerHeight + 82
  const panelSize = fitPanelSize(customSize ?? { width: expandedUI ? 700 : spacing.contentWidth, height: expandedUI ? 460 : 336 }, viewport, chromeHeight)
  const contentWidth = panelSize.width
  const bodyMaxHeight = panelSize.height
  const visualExpanded = isExpanded && !marketplaceOpen && !searchPanelOpen
  const auxiliaryHeight = Math.max(150, Math.min(470, viewport.height - chromeHeight - 24))

  const handleScreenshot = useCallback(async () => {
    const result = await window.glui.takeScreenshot()
    if (!result) return
    addAttachments([result])
  }, [addAttachments])

  const handleAttachFile = useCallback(async () => {
    const files = await window.glui.attachFiles()
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
        <div className="glui-column" style={{ '--glui-stack-step': `${Math.max(28, Math.min(56, (viewport.width - contentWidth) / 4 - 34))}px`, width: contentWidth, position: 'relative', margin: '0 auto', transition: resizing ? 'none' : 'width 0.2s ease', transform: 'translateY(var(--glui-card-y, 0px))' } as React.CSSProperties}>

          <AnimatePresence initial={false}>
            {marketplaceOpen && (
              <div
                data-glui-ui
                style={{
                  width: Math.min(720, viewport.width - 48),
                  maxWidth: viewport.width - 48,
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
                    data-glui-ui
                    className="glass-surface overflow-hidden no-drag"
                    style={{
                      borderRadius: 24,
                      maxHeight: auxiliaryHeight,
                    }}
                  >
                    <MarketplacePanel height={auxiliaryHeight} />
                  </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>

          <AnimatePresence initial={false}>
            {searchPanelOpen && (
              <div
                data-glui-ui
                style={{
                  width: Math.min(720, viewport.width - 48),
                  maxWidth: viewport.width - 48,
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
                    data-glui-ui
                    className="glass-surface overflow-hidden no-drag"
                    style={{
                      borderRadius: 24,
                      maxHeight: auxiliaryHeight,
                    }}
                  >
                    <SearchPanel height={auxiliaryHeight} />
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
          <div style={{ position: 'relative' }}>
          <ResizeHandle size={panelSize} expanded={visualExpanded} chromeHeight={chromeHeight} onResizeState={setResizing} />
          <motion.div
            data-glui-shell
            data-expanded={visualExpanded}
            data-glui-ui
            className="glass-surface overflow-hidden flex flex-col no-drag"
            animate={{
              width: visualExpanded ? contentWidth : contentWidth - 24,
              marginLeft: visualExpanded ? 0 : 12,
              marginRight: visualExpanded ? 0 : 12,
              marginBottom: visualExpanded ? 8 : -8,
            }}
            transition={resizing ? { duration: 0 } : TRANSITION}
            style={{
              borderRadius: 20,
              position: 'relative',
              zIndex: isExpanded ? 20 : 10,
            }}
          >
            {/* Tab strip */}
            <div>
              <TabStrip />
            </div>

            {/* Body — chat history only; the marketplace is a separate overlay above */}
            <motion.div
              initial={false}
              animate={{
                height: visualExpanded ? 'auto' : 0,
                opacity: visualExpanded ? 1 : 0,
              }}
              transition={resizing ? { duration: 0 } : TRANSITION}
              className="glui-conversation-body overflow-hidden no-drag"
            >
              <div style={{ height: bodyMaxHeight, overflow: 'hidden' }}>
                <ConversationView height={bodyMaxHeight} />
              </div>
            </motion.div>
          </motion.div>
          </div>
          <BtwBubble />
          {/* ─── Input row — circles float outside left ─── */}
          <div data-glui-ui ref={composerRef} className="relative" style={{ minHeight: 46, zIndex: 15, marginBottom: 16 }}>
            {/* Stacked circle buttons — expand on hover */}
            <div
              data-glui-ui
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
              data-glui-ui
              className="glui-composer glass-surface w-full"
              style={{ position: 'relative', zIndex: 2, minHeight: 50, borderRadius: 25, padding: '0 6px 0 16px' }}
            >
              <InputBar ref={inputBarRef} />
            </div>
            <ComposerControls wide={contentWidth >= 620} />
          </div>

        </div>
      </div>
    </PopoverLayerProvider>
  )
}
