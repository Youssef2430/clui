import { useEffect } from 'react'
import { useThemeStore } from '../theme'
import type { GlassSurface } from '../../shared/glass'

/** Native material follows the visible DOM, never the transparent overlay window. */
export function useGlassMaterial() {
  const brand = useThemeStore(s => s.brandPalette)
  const dark = useThemeStore(s => s.isDark)
  useEffect(() => {
    if (!window.glui?.updateGlass) return
    const root = document.documentElement
    let disposed = false, frame = 0, until = 0, nextId = 1, signature = ''
    let pending = false, dirty = false
    const ids = new WeakMap<Element, number>()
    // One compound path applies tint once across intersecting surfaces. Giving
    // every DOM surface its own translucent fill darkens all their overlaps.
    const tint = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    tint.classList.add('native-material-tint')
    tint.setAttribute('aria-hidden', 'true')
    const defs = document.createElementNS(tint.namespaceURI, 'defs')
    const gradient = document.createElementNS(tint.namespaceURI, 'linearGradient')
    gradient.setAttribute('id', 'glui-material-wash')
    gradient.setAttribute('x2', '0')
    gradient.setAttribute('y2', '1')
    for (const [offset, opacity] of [['0', dark ? '.64' : '.30'], ['.55', dark ? '.48' : '.18'], ['1', dark ? '.28' : '.10']]) {
      const stop = document.createElementNS(tint.namespaceURI, 'stop')
      stop.setAttribute('offset', offset)
      stop.setAttribute('stop-color', dark ? '#090b10' : '#ffffff')
      stop.setAttribute('stop-opacity', opacity)
      gradient.append(stop)
    }
    defs.append(gradient)
    tint.append(defs)
    const tintPaths = new Map<number, Element>()
    document.body.prepend(tint)
    const roundedPath = (surface: GlassSurface) => {
      const x = surface.x + 1, y = surface.y + 1, w = Math.max(0, surface.width - 2), h = Math.max(0, surface.height - 2)
      const r = Math.max(0, Math.min(surface.radius - 1, w / 2, h / 2))
      return `M${x + r},${y}h${w - 2 * r}a${r},${r} 0 0 1 ${r},${r}v${h - 2 * r}a${r},${r} 0 0 1 ${-r},${r}h${2 * r - w}a${r},${r} 0 0 1 ${-r},${-r}v${2 * r - h}a${r},${r} 0 0 1 ${r},${-r}Z`
    }
    const accessibility = matchMedia('(prefers-reduced-transparency: reduce), (prefers-contrast: more)')
    const round = (v: number) => Math.round(v * 2) / 2
    const sync = async () => {
      if (pending) { dirty = true; return }
      const enabled = brand === 'glass' && !accessibility.matches
      const surfaces: GlassSurface[] = []
      const tintSurfaces: GlassSurface[] = []
      if (enabled) {
        const layer = (el: HTMLElement) => el.matches('.glui-popover') ? 100 : el.matches('[data-glui-shell]') ? 10
          : el.matches('.composer-shelf') ? 20 : el.matches('.glui-composer') ? 30
          : el.matches('.stack-btn') ? 40 + (Number(getComputedStyle(el).zIndex) || 0) : 50
        const elements = [...document.querySelectorAll<HTMLElement>('.glass-surface, .glui-popover')]
          .sort((a, b) => layer(a) - layer(b))
        for (const el of elements) {
          const rect = el.getBoundingClientRect(), style = getComputedStyle(el)
          if (rect.width < 1 || rect.height < 1 || style.visibility === 'hidden' || style.display === 'none') continue
          let opacity = 1
          for (let parent: HTMLElement | null = el; parent; parent = parent.parentElement) opacity *= Number(getComputedStyle(parent).opacity)
          if (opacity < .01) continue
          if (!ids.has(el)) ids.set(el, nextId++)
          const surface = { id: ids.get(el)!, x: round(rect.x), y: round(rect.y), width: round(rect.width), height: round(rect.height),
            radius: Math.min(parseFloat(style.borderTopLeftRadius) || 0, rect.width / 2, rect.height / 2), opacity: round(opacity * 100) / 100 }
          surfaces.push(surface)
          if (!el.matches('.glui-popover')) tintSurfaces.push(surface)
        }
      }
      const tintGroups = new Map<number, string[]>()
      for (const surface of tintSurfaces) {
        const group = tintGroups.get(surface.opacity) ?? []
        group.push(roundedPath(surface))
        tintGroups.set(surface.opacity, group)
      }
      for (const [opacity, paths] of tintGroups) {
        let element = tintPaths.get(opacity)
        if (!element) {
          element = document.createElementNS(tint.namespaceURI, 'path')
          element.setAttribute('fill-opacity', String(opacity))
          tint.append(element)
          tintPaths.set(opacity, element)
        }
        const path = paths.join(' ')
        if (element.getAttribute('d') !== path) element.setAttribute('d', path)
      }
      for (const [opacity, element] of tintPaths) {
        if (!tintGroups.has(opacity)) { element.remove(); tintPaths.delete(opacity) }
      }
      const update = { dark, surfaces: surfaces.slice(0, 32) }
      const key = JSON.stringify(update)
      if (key === signature) return
      signature = key
      pending = true
      try {
        const available = await window.glui.updateGlass(update)
        if (!disposed) root.classList.toggle('native-glass', enabled && available)
      } catch { if (!disposed) root.classList.remove('native-glass') }
      finally {
        pending = false
        if (dirty && !disposed) { dirty = false; void sync() }
      }
    }
    // Follow finite transitions without keeping an idle render/IPC loop alive.
    const tick = () => {
      frame = 0
      void sync()
      if (performance.now() < until) frame = requestAnimationFrame(tick)
    }
    const schedule = () => {
      until = performance.now() + 500
      if (!frame) frame = requestAnimationFrame(tick)
    }
    const mutation = new MutationObserver(schedule)
    mutation.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['style', 'class'] })
    window.addEventListener('resize', schedule)
    document.addEventListener('scroll', schedule, true)
    document.addEventListener('transitionrun', schedule, true)
    document.addEventListener('transitionend', schedule, true)
    accessibility.addEventListener('change', schedule)
    const onShown = window.glui.onWindowShown(() => { signature = ''; schedule() })
    schedule()
    return () => {
      disposed = true
      cancelAnimationFrame(frame)
      mutation.disconnect()
      window.removeEventListener('resize', schedule)
      document.removeEventListener('scroll', schedule, true)
      document.removeEventListener('transitionrun', schedule, true)
      document.removeEventListener('transitionend', schedule, true)
      accessibility.removeEventListener('change', schedule)
      onShown()
      tint.remove()
      root.classList.remove('native-glass')
      void window.glui.updateGlass({ dark, surfaces: [] }).catch(() => {})
    }
  }, [brand, dark])
}
