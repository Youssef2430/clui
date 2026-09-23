import { useThemeStore } from '../theme'

export function openInPreferredTerminal(sessionId: string | null, projectPath?: string): Promise<boolean> {
  return window.glui.openInTerminal(sessionId, projectPath, useThemeStore.getState().preferredTerminalId)
}
