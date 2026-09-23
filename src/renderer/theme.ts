/**
 * GLUI materials and color tokens. Three themes, each with light/dark appearances.
 */
import { create } from 'zustand'
import type { PreferredTerminalId, TerminalId } from '../shared/types'

// ─── Color palettes ───

const darkColors = {
  materialSheen: 'none',
  materialRim: 'none',
  materialOpaque: '#0A0A0A',
  // Container (glass surfaces)
  containerBg: '#242422',
  containerBgCollapsed: '#21211e',
  containerBorder: '#3b3b36',
  containerShadow: '0 8px 28px rgba(0, 0, 0, 0.35), 0 1px 6px rgba(0, 0, 0, 0.25)',
  cardShadow: '0 2px 8px rgba(0,0,0,0.35)',
  cardShadowCollapsed: '0 2px 6px rgba(0,0,0,0.4)',

  // Surface layers
  surfacePrimary: '#353530',
  surfaceSecondary: '#42423d',
  surfaceHover: 'rgba(255, 255, 255, 0.05)',
  surfaceActive: 'rgba(255, 255, 255, 0.08)',

  // Input
  inputBg: 'transparent',
  inputBorder: '#3b3b36',
  inputFocusBorder: 'rgba(217, 119, 87, 0.4)',
  inputPillBg: '#2a2a27',

  // Text
  textPrimary: '#ccc9c0',
  textSecondary: '#c0bdb2',
  textTertiary: '#76766e',
  textMuted: '#353530',

  // Accent — orange
  accent: '#d97757',
  accentLight: 'rgba(217, 119, 87, 0.1)',
  accentSoft: 'rgba(217, 119, 87, 0.15)',

  // Status dots
  statusIdle: '#8a8a80',
  statusRunning: '#d97757',
  statusRunningBg: 'rgba(217, 119, 87, 0.1)',
  statusComplete: '#7aac8c',
  statusCompleteBg: 'rgba(122, 172, 140, 0.1)',
  statusError: '#c47060',
  statusErrorBg: 'rgba(196, 112, 96, 0.08)',
  statusDead: '#c47060',
  statusPermission: '#d97757',
  statusPermissionGlow: 'rgba(217, 119, 87, 0.4)',

  // Tab
  tabActive: '#353530',
  tabActiveBorder: '#4a4a45',
  tabInactive: 'transparent',
  tabHover: 'rgba(255, 255, 255, 0.05)',

  // User message bubble
  userBubble: '#353530',
  userBubbleBorder: '#4a4a45',
  userBubbleText: '#ccc9c0',

  // Tool card
  toolBg: '#353530',
  toolBorder: '#4a4a45',
  toolRunningBorder: 'rgba(217, 119, 87, 0.3)',
  toolRunningBg: 'rgba(217, 119, 87, 0.05)',

  // Timeline
  timelineLine: '#353530',
  timelineNode: 'rgba(217, 119, 87, 0.2)',
  timelineNodeActive: '#d97757',

  // Scrollbar
  scrollThumb: 'rgba(255, 255, 255, 0.15)',
  scrollThumbHover: 'rgba(255, 255, 255, 0.25)',

  // Stop button
  stopBg: '#ef4444',
  stopHover: '#dc2626',

  // Send button
  sendBg: '#d97757',
  sendHover: '#c96442',
  sendDisabled: 'rgba(217, 119, 87, 0.3)',

  // Popover
  popoverBg: '#292927',
  popoverBorder: '#3b3b36',
  popoverShadow: '0 4px 20px rgba(0,0,0,0.3), 0 1px 4px rgba(0,0,0,0.2)',

  // Code block
  codeBg: '#1a1a18',

  // Mic button
  micBg: '#353530',
  micColor: '#c0bdb2',
  micDisabled: '#42423d',

  // Placeholder
  placeholder: '#6b6b60',

  // Disabled button color
  btnDisabled: '#42423d',

  // Text on accent backgrounds
  textOnAccent: '#ffffff',

  // Button hover (CSS-only stack buttons)
  btnHoverColor: '#c0bdb2',
  btnHoverBg: '#302f2d',

  // Accent border variants (replaces hex-alpha concatenation antipattern)
  accentBorder: 'rgba(217, 119, 87, 0.19)',
  accentBorderMedium: 'rgba(217, 119, 87, 0.25)',

  // Permission card (amber)
  permissionBorder: 'rgba(245, 158, 11, 0.3)',
  permissionShadow: '0 2px 12px rgba(245, 158, 11, 0.08)',
  permissionHeaderBg: 'rgba(245, 158, 11, 0.06)',
  permissionHeaderBorder: 'rgba(245, 158, 11, 0.12)',

  // Permission allow (green)
  permissionAllowBg: 'rgba(34, 197, 94, 0.1)',
  permissionAllowHoverBg: 'rgba(34, 197, 94, 0.22)',
  permissionAllowBorder: 'rgba(34, 197, 94, 0.25)',

  // Permission deny (red)
  permissionDenyBg: 'rgba(239, 68, 68, 0.08)',
  permissionDenyHoverBg: 'rgba(239, 68, 68, 0.18)',
  permissionDenyBorder: 'rgba(239, 68, 68, 0.22)',

  // Permission denied card
  permissionDeniedBorder: 'rgba(196, 112, 96, 0.3)',
  permissionDeniedHeaderBorder: 'rgba(196, 112, 96, 0.12)',

  // Diff (Edit tool inline diff)
  diffRemovedBg: 'rgba(248, 81, 73, 0.1)',
  diffAddedBg: 'rgba(63, 185, 80, 0.1)',
} as const

const lightColors = {
  materialSheen: 'none',
  materialRim: 'none',
  materialOpaque: '#FDFDFD',
  // Container (glass surfaces)
  containerBg: '#f9f8f5',
  containerBgCollapsed: '#f4f2ed',
  containerBorder: '#dddad2',
  containerShadow: '0 8px 28px rgba(0, 0, 0, 0.08), 0 1px 6px rgba(0, 0, 0, 0.04)',
  cardShadow: '0 2px 8px rgba(0,0,0,0.06)',
  cardShadowCollapsed: '0 2px 6px rgba(0,0,0,0.08)',

  // Surface layers
  surfacePrimary: '#edeae0',
  surfaceSecondary: '#dddad2',
  surfaceHover: 'rgba(0, 0, 0, 0.04)',
  surfaceActive: 'rgba(0, 0, 0, 0.06)',

  // Input
  inputBg: 'transparent',
  inputBorder: '#dddad2',
  inputFocusBorder: 'rgba(217, 119, 87, 0.4)',
  inputPillBg: '#ffffff',

  // Text
  textPrimary: '#3c3929',
  textSecondary: '#5a5749',
  textTertiary: '#8a8a80',
  textMuted: '#dddad2',

  // Accent — orange (same)
  accent: '#d97757',
  accentLight: 'rgba(217, 119, 87, 0.1)',
  accentSoft: 'rgba(217, 119, 87, 0.12)',

  // Status dots
  statusIdle: '#8a8a80',
  statusRunning: '#d97757',
  statusRunningBg: 'rgba(217, 119, 87, 0.1)',
  statusComplete: '#5a9e6f',
  statusCompleteBg: 'rgba(90, 158, 111, 0.1)',
  statusError: '#c47060',
  statusErrorBg: 'rgba(196, 112, 96, 0.06)',
  statusDead: '#c47060',
  statusPermission: '#d97757',
  statusPermissionGlow: 'rgba(217, 119, 87, 0.3)',

  // Tab
  tabActive: '#edeae0',
  tabActiveBorder: '#dddad2',
  tabInactive: 'transparent',
  tabHover: 'rgba(0, 0, 0, 0.04)',

  // User message bubble
  userBubble: '#edeae0',
  userBubbleBorder: '#dddad2',
  userBubbleText: '#3c3929',

  // Tool card
  toolBg: '#edeae0',
  toolBorder: '#dddad2',
  toolRunningBorder: 'rgba(217, 119, 87, 0.3)',
  toolRunningBg: 'rgba(217, 119, 87, 0.05)',

  // Timeline
  timelineLine: '#dddad2',
  timelineNode: 'rgba(217, 119, 87, 0.2)',
  timelineNodeActive: '#d97757',

  // Scrollbar
  scrollThumb: 'rgba(0, 0, 0, 0.1)',
  scrollThumbHover: 'rgba(0, 0, 0, 0.18)',

  // Stop button
  stopBg: '#ef4444',
  stopHover: '#dc2626',

  // Send button
  sendBg: '#d97757',
  sendHover: '#c96442',
  sendDisabled: 'rgba(217, 119, 87, 0.3)',

  // Popover
  popoverBg: '#f9f8f5',
  popoverBorder: '#dddad2',
  popoverShadow: '0 4px 20px rgba(0,0,0,0.1), 0 1px 4px rgba(0,0,0,0.06)',

  // Code block
  codeBg: '#f0eee8',

  // Mic button
  micBg: '#edeae0',
  micColor: '#5a5749',
  micDisabled: '#c8c5bc',

  // Placeholder
  placeholder: '#b0ada4',

  // Disabled button color
  btnDisabled: '#c8c5bc',

  // Text on accent backgrounds
  textOnAccent: '#ffffff',

  // Button hover (CSS-only stack buttons)
  btnHoverColor: '#3c3929',
  btnHoverBg: '#edeae0',

  // Accent border variants (replaces hex-alpha concatenation antipattern)
  accentBorder: 'rgba(217, 119, 87, 0.19)',
  accentBorderMedium: 'rgba(217, 119, 87, 0.25)',

  // Permission card (amber)
  permissionBorder: 'rgba(245, 158, 11, 0.3)',
  permissionShadow: '0 2px 12px rgba(245, 158, 11, 0.08)',
  permissionHeaderBg: 'rgba(245, 158, 11, 0.06)',
  permissionHeaderBorder: 'rgba(245, 158, 11, 0.12)',

  // Permission allow (green)
  permissionAllowBg: 'rgba(34, 197, 94, 0.1)',
  permissionAllowHoverBg: 'rgba(34, 197, 94, 0.22)',
  permissionAllowBorder: 'rgba(34, 197, 94, 0.25)',

  // Permission deny (red)
  permissionDenyBg: 'rgba(239, 68, 68, 0.08)',
  permissionDenyHoverBg: 'rgba(239, 68, 68, 0.18)',
  permissionDenyBorder: 'rgba(239, 68, 68, 0.22)',

  // Permission denied card
  permissionDeniedBorder: 'rgba(196, 112, 96, 0.3)',
  permissionDeniedHeaderBorder: 'rgba(196, 112, 96, 0.12)',

  // Diff (Edit tool inline diff)
  diffRemovedBg: 'rgba(248, 81, 73, 0.15)',
  diffAddedBg: 'rgba(63, 185, 80, 0.15)',
} as const

export type ColorPalette = { [K in keyof typeof darkColors]: string }

export const BRAND_PALETTES = {
  glass: { name: 'Liquid Glass', accent: '#800020', rose: '#D45060', cream: '#F3E6D5', ivory: '#FFF9F2', dark: '#0A0A0A', surface: '#29171D', line: '#603C48', muted: '#CAAEB6' },
  burgundy: { name: 'Burgundy', accent: '#800020', rose: '#D45060', cream: '#F3E6D5', ivory: '#FFF9F2', dark: '#29171D', surface: '#39222B', line: '#603C48', muted: '#CAAEB6' },
  tidal: { name: 'Tidal', accent: '#215E4B', rose: '#A9EDC7', cream: '#E3EBDF', ivory: '#F1F5EC', dark: '#102925', surface: '#1B3933', line: '#30544A', muted: '#A7BCB1' },
} as const
export type BrandPalette = keyof typeof BRAND_PALETTES
function paletteColors(isDark: boolean, brand: BrandPalette): ColorPalette {
  if (brand === 'glass') return glassColors(isDark)
  const p = BRAND_PALETTES[brand]
  const accent = isDark ? (brand === 'burgundy' ? '#F39EAD' : p.rose) : p.accent
  const surface = isDark ? p.surface : p.cream
  const bg = isDark ? p.dark : p.ivory
  const border = isDark ? p.line : p.accent + '28'
  const text = isDark ? p.ivory : p.dark
  return { ...(isDark ? darkColors : lightColors),
    containerBg: bg, containerBgCollapsed: bg, containerBorder: border,
    surfacePrimary: surface, surfaceSecondary: isDark ? p.line : p.cream,
    surfaceHover: accent + '0C', surfaceActive: accent + '16',
    inputPillBg: bg, inputBorder: border, inputFocusBorder: accent + '88',
    textPrimary: text, textSecondary: isDark ? p.cream : '#624D50', textTertiary: isDark ? p.muted : '#796166', textMuted: isDark ? p.muted : '#796166',
    accent, accentLight: accent + '12', accentSoft: accent + '1F', accentBorder: accent + '30', accentBorderMedium: accent + '50',
    statusRunning: accent, statusRunningBg: accent + '12', statusPermission: accent, statusPermissionGlow: accent + '66',
    tabActive: surface, tabActiveBorder: border, tabHover: accent + '0C',
    userBubble: surface, userBubbleBorder: border, userBubbleText: text,
    toolBg: surface, toolBorder: border, toolRunningBorder: accent + '50', toolRunningBg: accent + '0C',
    timelineLine: border, timelineNode: accent + '40', timelineNodeActive: accent,
    sendBg: accent, sendHover: isDark ? p.ivory : p.accent, sendDisabled: accent + '45', textOnAccent: isDark ? p.dark : p.ivory,
    popoverBg: bg, popoverBorder: border, codeBg: isDark ? '#1D1116' : '#F7EDDF',
    micBg: surface, micColor: text, micDisabled: border, placeholder: isDark ? p.muted : '#866D70',
    btnDisabled: border, btnHoverColor: text, btnHoverBg: surface,
  }
}

// Black/white bases back the fallback; native glass uses the same neutral tints.
// Retain the glass ID so preferences from the preview continue to work.
function glassColors(dark: boolean): ColorPalette {
  const accent = dark ? '#F39EAD' : '#800020'
  const text = dark ? '#F8FAFC' : '#17191E'
  const secondary = dark ? '#E0E3E9' : '#3E424B'
  const tertiary = dark ? '#C0C6D0' : '#555B65'
  const bg = dark ? 'rgba(12, 15, 22, .54)' : 'rgba(255, 255, 255, .48)'
  const border = dark ? 'rgba(255, 255, 255, .20)' : 'rgba(255, 255, 255, .65)'
  const line = dark ? 'rgba(255, 255, 255, .13)' : 'rgba(0, 0, 0, .11)'
  const surface = dark ? 'rgba(255, 255, 255, .085)' : 'rgba(255, 255, 255, .42)'
  const hover = dark ? 'rgba(243, 158, 173, .10)' : 'rgba(128, 0, 32, .065)'
  const shadow = dark
    ? '0 12px 32px rgba(0,0,0,.20), 0 2px 6px rgba(0,0,0,.12), inset 0 1px 0 rgba(255,255,255,.16), inset 0 -1px 0 rgba(255,255,255,.06)'
    : '0 12px 32px rgba(20,30,50,.10), 0 2px 6px rgba(20,30,50,.06), inset 0 1px 0 rgba(255,255,255,.95), inset 0 -1px 0 rgba(255,255,255,.45)'
  return { ...(dark ? darkColors : lightColors),
    materialSheen: dark
      ? 'linear-gradient(165deg, rgba(255,255,255,.10), transparent 35%, transparent 65%, rgba(255,255,255,.035))'
      : 'linear-gradient(165deg, rgba(255,255,255,.55), transparent 38%, transparent 65%, rgba(255,255,255,.18))',
    materialRim: dark
      ? 'linear-gradient(135deg, rgba(255,255,255,.45), rgba(255,255,255,.04) 35%, rgba(255,255,255,.04) 65%, rgba(255,255,255,.22))'
      : 'linear-gradient(135deg, #fff, rgba(255,255,255,.18) 38%, rgba(255,255,255,.18) 64%, rgba(255,255,255,.85))',
    containerBg: bg, containerBgCollapsed: bg, containerBorder: border,
    containerShadow: shadow, cardShadow: shadow, cardShadowCollapsed: shadow,
    surfacePrimary: surface, surfaceSecondary: dark ? 'rgba(255,255,255,.16)' : 'rgba(28,35,48,.10)', surfaceHover: hover, surfaceActive: hover,
    inputPillBg: bg, inputBorder: line, inputFocusBorder: accent + '66',
    textPrimary: text, textSecondary: secondary, textTertiary: tertiary, textMuted: tertiary,
    accent, accentLight: accent + '10', accentSoft: accent + '1C', accentBorder: accent + '30', accentBorderMedium: accent + '50',
    statusRunning: accent, statusRunningBg: accent + '12', statusPermission: accent, statusPermissionGlow: accent + '44',
    tabActive: surface, tabActiveBorder: line, tabHover: hover,
    userBubble: surface, userBubbleBorder: line, userBubbleText: text,
    toolBg: surface, toolBorder: line, toolRunningBorder: accent + '40', toolRunningBg: accent + '08',
    timelineLine: line, timelineNode: accent + '40', timelineNodeActive: accent,
    sendBg: dark ? '#D45060' : '#800020', sendHover: dark ? '#E76A7B' : '#9D183A', sendDisabled: accent + '45', textOnAccent: '#FFF9F2',
    // Menus overlap foreground text in the transparent Electron compositor;
    // use a denser material here so that text cannot ghost through the options.
    popoverBg: dark ? 'rgba(16, 19, 26, .96)' : 'rgba(250, 252, 255, .96)', popoverBorder: border, popoverShadow: shadow,
    codeBg: dark ? 'rgba(0,0,0,.22)' : 'rgba(255,255,255,.36)',
    micBg: surface, micColor: secondary, micDisabled: tertiary, placeholder: tertiary,
    btnDisabled: tertiary, btnHoverColor: accent, btnHoverBg: dark ? 'rgba(255,255,255,.16)' : 'rgba(255,255,255,.64)',
    scrollThumb: dark ? 'rgba(255,255,255,.22)' : 'rgba(0,0,0,.22)',
  }
}

// ─── Theme store ───

export type ThemeMode = 'system' | 'light' | 'dark'

function isTerminalId(value: unknown): value is TerminalId {
  return typeof value === 'string' && value.trim().length > 0
}

interface ThemeState {
  brandPalette: BrandPalette
  setBrandPalette: (brand: BrandPalette) => void
  isDark: boolean
  themeMode: ThemeMode
  soundEnabled: boolean
  expandedUI: boolean
  preferredTerminalId: PreferredTerminalId
  /** OS-reported dark mode — used when themeMode is 'system' */
  _systemIsDark: boolean
  setIsDark: (isDark: boolean) => void
  setThemeMode: (mode: ThemeMode) => void
  setSoundEnabled: (enabled: boolean) => void
  setExpandedUI: (expanded: boolean) => void
  setPreferredTerminalId: (terminalId: PreferredTerminalId) => void
  /** Called by OS theme change listener — updates system value */
  setSystemTheme: (isDark: boolean) => void
  /** Auto-update state */
  updateVersion: string | null
  updateReady: boolean
  setUpdateAvailable: (version: string) => void
  setUpdateReady: (version: string) => void
}

/** Convert camelCase token name to --glui-kebab-case CSS custom property */
function camelToKebab(s: string): string {
  return s.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)
}

/** Sync all JS design tokens to CSS custom properties on :root */
function syncTokensToCss(tokens: ColorPalette): void {
  const style = document.documentElement.style
  for (const [key, value] of Object.entries(tokens)) {
    style.setProperty(`--glui-${camelToKebab(key)}`, value)
  }
}

function applyTheme(isDark: boolean): void {
  document.documentElement.dataset.palette = useThemeStore.getState().brandPalette
  document.documentElement.style.colorScheme = isDark ? 'dark' : 'light'
  document.documentElement.classList.toggle('dark', isDark)
  document.documentElement.classList.toggle('light', !isDark)
  syncTokensToCss(paletteColors(isDark, useThemeStore.getState().brandPalette))
}

const SETTINGS_KEY = 'glui-settings'
// Introduce the requested new default once. Retain the previous glui-brand key
// for rollback; subsequent choices persist under glui-theme.
function loadBrand(): BrandPalette {
  try { const v = localStorage.getItem('glui-theme'); if (v && Object.hasOwn(BRAND_PALETTES, v)) return v as BrandPalette } catch {}
  return 'glass'
}

function loadSettings(): { themeMode: ThemeMode; soundEnabled: boolean; expandedUI: boolean; preferredTerminalId: PreferredTerminalId } {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      return {
        themeMode: ['system', 'light', 'dark'].includes(parsed.themeMode) ? parsed.themeMode : 'system',
        soundEnabled: typeof parsed.soundEnabled === 'boolean' ? parsed.soundEnabled : true,
        expandedUI: typeof parsed.expandedUI === 'boolean' ? parsed.expandedUI : false,
        preferredTerminalId: parsed.preferredTerminalId === 'auto' || isTerminalId(parsed.preferredTerminalId)
          ? parsed.preferredTerminalId
          : 'auto',
      }
    }
  } catch {}
  return { themeMode: 'system', soundEnabled: true, expandedUI: false, preferredTerminalId: 'auto' }
}

function saveSettings(s: { themeMode: ThemeMode; soundEnabled: boolean; expandedUI: boolean; preferredTerminalId: PreferredTerminalId }): void {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)) } catch {}
}

const saved = loadSettings()
const systemIsDark = window.matchMedia('(prefers-color-scheme: dark)').matches
const initialIsDark = saved.themeMode === 'system' ? systemIsDark : saved.themeMode === 'dark'

export const useThemeStore = create<ThemeState>((set, get) => ({
  brandPalette: loadBrand(),
  setBrandPalette: (brandPalette) => { set({ brandPalette }); try { localStorage.setItem('glui-theme', brandPalette) } catch {}; applyTheme(get().isDark) },
  isDark: initialIsDark,
  themeMode: saved.themeMode,
  soundEnabled: saved.soundEnabled,
  expandedUI: saved.expandedUI,
  preferredTerminalId: saved.preferredTerminalId,
  _systemIsDark: systemIsDark,
  setIsDark: (isDark) => {
    set({ isDark })
    applyTheme(isDark)
  },
  setThemeMode: (mode) => {
    const resolved = mode === 'system' ? get()._systemIsDark : mode === 'dark'
    set({ themeMode: mode, isDark: resolved })
    applyTheme(resolved)
    saveSettings({ themeMode: mode, soundEnabled: get().soundEnabled, expandedUI: get().expandedUI, preferredTerminalId: get().preferredTerminalId })
  },
  setSoundEnabled: (enabled) => {
    set({ soundEnabled: enabled })
    saveSettings({ themeMode: get().themeMode, soundEnabled: enabled, expandedUI: get().expandedUI, preferredTerminalId: get().preferredTerminalId })
  },
  setExpandedUI: (expanded) => {
    set({ expandedUI: expanded })
    saveSettings({ themeMode: get().themeMode, soundEnabled: get().soundEnabled, expandedUI: expanded, preferredTerminalId: get().preferredTerminalId })
  },
  setPreferredTerminalId: (terminalId) => {
    set({ preferredTerminalId: terminalId })
    saveSettings({ themeMode: get().themeMode, soundEnabled: get().soundEnabled, expandedUI: get().expandedUI, preferredTerminalId: terminalId })
  },
  setSystemTheme: (isDark) => {
    set({ _systemIsDark: isDark })
    // Only apply if following system
    if (get().themeMode === 'system') {
      set({ isDark })
      applyTheme(isDark)
    }
  },
  updateVersion: null,
  updateReady: false,
  setUpdateAvailable: (version) => set({ updateVersion: version }),
  setUpdateReady: (version) => set({ updateVersion: version, updateReady: true }),
}))

// Initialize CSS vars with saved theme
applyTheme(initialIsDark)

/** Reactive hook — returns the active color palette */
export function useColors(): ColorPalette {
  const isDark = useThemeStore((s) => s.isDark)
  const brand = useThemeStore((s) => s.brandPalette)
  return paletteColors(isDark, brand)
}

/** Non-reactive getter — use outside React components */
export function getColors(isDark: boolean): ColorPalette {
  return paletteColors(isDark, useThemeStore.getState().brandPalette)
}

// ─── Backward compatibility ───
// Legacy static export — components being migrated should use useColors() instead
export const colors = darkColors

// ─── Spacing ───

export const spacing = {
  contentWidth: 460,
  containerRadius: 20,
  containerPadding: 12,
  tabHeight: 32,
  inputMinHeight: 44,
  inputMaxHeight: 160,
  conversationMaxHeight: 380,
  pillRadius: 9999,
  circleSize: 36,
  circleGap: 8,
} as const

// ─── Animation ───

export const motion = {
  spring: { type: 'spring' as const, stiffness: 500, damping: 30 },
  easeOut: { duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] as const },
  fadeIn: {
    initial: { opacity: 0, y: 8 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -4 },
    transition: { duration: 0.15 },
  },
} as const
