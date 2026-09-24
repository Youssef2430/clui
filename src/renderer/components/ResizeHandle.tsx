import React, { useCallback, useEffect, useRef, useState } from 'react'
import { fitPanelSize, usePanelSize, type PanelSize } from '../panel-size'

export function ResizeHandle({ size, expanded, chromeHeight, onResizeState }: { size: PanelSize; expanded: boolean; chromeHeight: number; onResizeState: (resizing: boolean) => void }) {
  const start = useRef<{ x: number; y: number; size: PanelSize } | null>(null)
  const [dragging, setDragging] = useState(false)
  const setSize = usePanelSize(s => s.setSize)
  const fit = (next: PanelSize) => fitPanelSize(next, { width: innerWidth, height: innerHeight }, chromeHeight)
  const finish = useCallback(() => {
    if (!start.current) return
    start.current = null
    setDragging(false)
    onResizeState(false)
    setSize(usePanelSize.getState().size)
    document.documentElement.classList.remove('panel-resizing')
  }, [onResizeState, setSize])
  useEffect(() => {
    window.addEventListener('blur', finish)
    return () => {
      window.removeEventListener('blur', finish)
      document.documentElement.classList.remove('panel-resizing')
    }
  }, [finish])
  return <button data-glui-ui className={`panel-resize-handle ${expanded ? 'both' : ''}`} aria-label="Resize panel" aria-pressed={dragging}
    title={expanded ? 'Drag to resize. Arrow keys adjust size. Double-click to reset.' : 'Drag to resize width. Arrow keys adjust width. Double-click to reset.'}
    onDoubleClick={() => setSize(null)}
    onPointerDown={event => {
      if (event.button !== 0) return
      event.currentTarget.setPointerCapture(event.pointerId)
      start.current = { x: event.clientX, y: event.clientY, size }
      setDragging(true)
      onResizeState(true)
      document.documentElement.classList.add('panel-resizing')
      window.glui.setIgnoreMouseEvents(false)
    }}
    onPointerMove={event => {
      const anchor = start.current
      if (!anchor) return
      setSize(fit({ width: anchor.size.width + (event.clientX - anchor.x) * 2,
        height: expanded ? anchor.size.height - (event.clientY - anchor.y) : anchor.size.height }), false)
    }}
    onPointerUp={finish} onPointerCancel={finish} onLostPointerCapture={finish}
    onKeyDown={event => {
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home'].includes(event.key)) return
      event.preventDefault()
      if (event.key === 'Home') { setSize(null); return }
      const step = event.shiftKey ? 40 : 10
      setSize(fit({ width: size.width + (event.key === 'ArrowRight' ? step : event.key === 'ArrowLeft' ? -step : 0),
        height: size.height + (expanded && event.key === 'ArrowUp' ? step : expanded && event.key === 'ArrowDown' ? -step : 0) }))
    }}><svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true"><path d="M3 2h7v7M5 7l5-5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" /></svg></button>
}
