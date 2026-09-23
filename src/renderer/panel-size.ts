import { create } from 'zustand'

export interface PanelSize { width: number; height: number }
export function fitPanelSize(size: PanelSize, viewport: PanelSize, chromeHeight = 180): PanelSize {
  // Leave room for the floating action stack, even when browser zoom changes.
  const maxWidth = Math.max(280, Math.min(960, viewport.width - 240))
  const maxHeight = Math.max(120, viewport.height - chromeHeight - 24)
  return {
    width: Math.round(Math.max(Math.min(400, maxWidth), Math.min(size.width, maxWidth))),
    height: Math.round(Math.max(Math.min(160, maxHeight), Math.min(size.height, maxHeight))),
  }
}

const key = 'glui-panel-size'
function load(): PanelSize | null {
  if (typeof window === 'undefined') return null
  try {
    const value = JSON.parse(localStorage.getItem(key) || 'null')
    return value && Number.isFinite(value.width) && value.width > 0 && Number.isFinite(value.height) && value.height > 0 ? value : null
  } catch { return null }
}

export const usePanelSize = create<{
  size: PanelSize | null
  setSize: (size: PanelSize | null, persist?: boolean) => void
}>((set) => ({
  size: load(),
  setSize: (size, persist = true) => {
    set({ size })
    if (persist) try {
      if (size) localStorage.setItem(key, JSON.stringify(size))
      else localStorage.removeItem(key)
    } catch {}
  },
}))
