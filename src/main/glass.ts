import { createRequire } from 'node:module'
import { join } from 'node:path'
import type { BrowserWindow } from 'electron'
import type { GlassUpdate } from '../shared/glass'

type NativeGlass = { update(handle: Buffer, surfaces: GlassUpdate['surfaces'], dark: boolean): boolean }
let native: NativeGlass | null | undefined
const updates = new WeakMap<BrowserWindow, GlassUpdate>()
export function updateGlass(window: BrowserWindow, value: unknown): boolean {
  if (process.platform !== 'darwin' || window.isDestroyed() || !value || typeof value !== 'object') return false
  const update = value as GlassUpdate
  if (typeof update.dark !== 'boolean' || !Array.isArray(update.surfaces) || update.surfaces.length > 32) return false
  if (!update.surfaces.every(s => s && ['id', 'x', 'y', 'width', 'height', 'radius', 'opacity'].every(k =>
    typeof s[k as keyof typeof s] === 'number' && Number.isFinite(s[k as keyof typeof s])))) return false
  updates.set(window, update)
  if (native === undefined) {
    try { native = createRequire(__filename)(join(__dirname, '../../resources/native/glui-glass.node')) as NativeGlass }
    catch (error) { console.warn('[glass] Using CSS material fallback:', error); native = null }
  }
  // DOM coordinates are CSS pixels; AppKit uses window points, including at browser zoom.
  const zoom = window.webContents.getZoomFactor()
  const surfaces = update.surfaces.map(s => ({ ...s, x: s.x * zoom, y: s.y * zoom,
    width: s.width * zoom, height: s.height * zoom, radius: s.radius * zoom }))
  return native?.update(window.getNativeWindowHandle(), surfaces, update.dark) ?? false
}

export function refreshGlass(window: BrowserWindow): void {
  const update = updates.get(window)
  if (update) updateGlass(window, update)
}
