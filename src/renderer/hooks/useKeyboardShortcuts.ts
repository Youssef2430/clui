import { useEffect, useCallback } from 'react'
import { useSessionStore } from '../stores/sessionStore'

/**
 * Centralized keyboard shortcut handler for Clui.
 *
 * Registered on the document level so shortcuts work regardless of focus.
 * All shortcuts use Cmd (Meta) on macOS.
 *
 * Note: on macOS, when Cmd is held, e.key returns lowercase even with Shift.
 * We normalize all key comparisons to lowercase to handle this.
 */
export function useKeyboardShortcuts({
  onAttachFile,
  onScreenshot,
  onFocusInput,
  onOpenSlashMenu,
  onVoiceCapture,
}: {
  onAttachFile: () => void
  onScreenshot: () => void
  onFocusInput: () => void
  onOpenSlashMenu: () => void
  onVoiceCapture: () => void
}) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const meta = e.metaKey
      const shift = e.shiftKey
      const ctrl = e.ctrlKey
      const key = e.key.toLowerCase()

      // ─── Cmd + N — New tab (default directory) ───
      if (meta && !shift && !ctrl && key === 'n') {
        e.preventDefault()
        useSessionStore.getState().createTab()
        return
      }

      // ─── Cmd + T — New tab in same folder ───
      if (meta && !shift && !ctrl && key === 't') {
        e.preventDefault()
        useSessionStore.getState().createTabInSameFolder()
        return
      }

      // ─── Cmd + W — Close current tab ───
      if (meta && !shift && !ctrl && key === 'w') {
        e.preventDefault()
        const { activeTabId } = useSessionStore.getState()
        useSessionStore.getState().closeTab(activeTabId)
        return
      }

      // ─── Cmd + M — Minimize (collapse) ───
      if (meta && !shift && !ctrl && key === 'm') {
        e.preventDefault()
        const { isExpanded } = useSessionStore.getState()
        if (isExpanded) {
          useSessionStore.getState().toggleExpanded()
        }
        return
      }

      // ─── Ctrl + Tab / Ctrl + Shift + Tab — Cycle tabs ───
      if (ctrl && !meta && key === 'tab') {
        e.preventDefault()
        if (shift) {
          useSessionStore.getState().prevTab()
        } else {
          useSessionStore.getState().nextTab()
        }
        return
      }

      // ─── Cmd + Shift + ] — Next tab ───
      if (meta && shift && key === ']') {
        e.preventDefault()
        useSessionStore.getState().nextTab()
        return
      }

      // ─── Cmd + Shift + [ — Previous tab ───
      if (meta && shift && key === '[') {
        e.preventDefault()
        useSessionStore.getState().prevTab()
        return
      }

      // ─── Cmd + K — Clear conversation ───
      if (meta && !shift && !ctrl && key === 'k') {
        e.preventDefault()
        useSessionStore.getState().clearTab()
        useSessionStore.getState().addSystemMessage('Conversation cleared.')
        return
      }

      // ─── Cmd + . — Stop/cancel active run ───
      if (meta && !shift && !ctrl && key === '.') {
        e.preventDefault()
        useSessionStore.getState().stopActiveRun()
        return
      }

      // ─── Cmd + Shift + C — Copy last response ───
      if (meta && shift && key === 'c') {
        e.preventDefault()
        useSessionStore.getState().copyLastResponse()
        return
      }

      // ─── Cmd + E — Toggle expanded/collapsed view ───
      if (meta && !shift && !ctrl && key === 'e') {
        e.preventDefault()
        useSessionStore.getState().toggleExpanded()
        return
      }

      // ─── Cmd + Shift + P — Open slash command palette ───
      if (meta && shift && key === 'p') {
        e.preventDefault()
        onOpenSlashMenu()
        return
      }

      // ─── Cmd + Shift + M — Toggle skills marketplace ───
      if (meta && shift && key === 'm') {
        e.preventDefault()
        useSessionStore.getState().toggleMarketplace()
        return
      }

      // ─── Cmd + Shift + H — Toggle session history ───
      if (meta && shift && key === 'h') {
        e.preventDefault()
        useSessionStore.getState().toggleHistoryPicker()
        return
      }

      // ─── Cmd + Shift + A — Attach file ───
      if (meta && shift && key === 'a') {
        e.preventDefault()
        onAttachFile()
        return
      }

      // ─── Cmd + Shift + S — Take screenshot ───
      if (meta && shift && key === 's') {
        e.preventDefault()
        onScreenshot()
        return
      }

      // ─── Cmd + Shift + T — Open in Terminal ───
      if (meta && shift && key === 't') {
        e.preventDefault()
        const state = useSessionStore.getState()
        const tab = state.tabs.find((t) => t.id === state.activeTabId)
        if (tab) {
          window.clui.openInTerminal(tab.claudeSessionId, tab.workingDirectory)
        }
        return
      }

      // ─── Cmd + Shift + V — Voice capture ───
      if (meta && shift && key === 'v') {
        e.preventDefault()
        onVoiceCapture()
        return
      }

      // ─── Cmd + L — Focus input field ───
      if (meta && !shift && !ctrl && key === 'l') {
        e.preventDefault()
        onFocusInput()
        return
      }
    },
    [onAttachFile, onScreenshot, onFocusInput, onOpenSlashMenu, onVoiceCapture],
  )

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])
}
