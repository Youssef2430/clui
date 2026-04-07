import React, { useCallback, useEffect, useRef, useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import { useSessionStore } from '../stores/sessionStore'
import { useColors } from '../theme'

const REMARK_PLUGINS = [remarkGfm, [remarkMath, { singleDollarTextMath: false }]] as any
const REHYPE_PLUGINS = [rehypeKatex]

// Prevents default <a> navigation inside Electron; opens links externally instead.
const SAFE_LINK_COMPONENTS = {
  a: ({ href, children }: any) => (
    <button
      type="button"
      className="underline decoration-dotted underline-offset-2 cursor-pointer"
      onClick={() => { if (href) window.clui.openExternal(String(href)) }}
    >
      {children}
    </button>
  ),
}
const TRANSITION = { duration: 0.18, ease: [0.4, 0, 0.1, 1] as const }

// ─── Claude Code Spinner: 12-frame palindrome at 120ms ───

const SPINNER_FRAMES = ['·', '✢', '✳', '✶', '✻', '✽', '✽', '✻', '✶', '✳', '✢', '·']
const SPINNER_INTERVAL = 180

function useSpinnerFrame(active: boolean): string {
  const [frame, setFrame] = useState(0)
  useEffect(() => {
    if (!active) return
    const id = setInterval(() => setFrame((f) => (f + 1) % SPINNER_FRAMES.length), SPINNER_INTERVAL)
    return () => clearInterval(id)
  }, [active])
  return SPINNER_FRAMES[frame]
}

// ─── Claude Code Shimmer: 2-char bright sweep across text ───

const SHIMMER_STEP_MS = 300
const SHIMMER_OVERSHOOT = 30 // off-screen pause at each end

function useGlimmerIndex(active: boolean, textLength: number): number {
  const [index, setIndex] = useState(-10)
  const startRef = useRef(Date.now())

  useEffect(() => {
    if (!active) return
    startRef.current = Date.now()
    const total = textLength + SHIMMER_OVERSHOOT
    const id = setInterval(() => {
      const elapsed = Date.now() - startRef.current
      const t = Math.floor(elapsed / SHIMMER_STEP_MS)
      // Right-to-left sweep (responding mode)
      setIndex(textLength + 10 - (t % total))
    }, 50)
    return () => clearInterval(id)
  }, [active, textLength])

  return index
}

interface ShimmerTextProps {
  text: string
  active: boolean
  baseColor: string
  shimmerColor: string
}

function ShimmerText({ text, active, baseColor, shimmerColor }: ShimmerTextProps) {
  const glimmerIndex = useGlimmerIndex(active, text.length)

  return (
    <span style={{ fontWeight: 500 }}>
      {text.split('').map((char, i) => {
        const isHighlighted = active && (i === glimmerIndex || Math.abs(i - glimmerIndex) === 1)
        return (
          <span
            key={i}
            style={{
              color: isHighlighted ? shimmerColor : baseColor,
              transition: 'color 0.1s ease',
            }}
          >
            {char}
          </span>
        )
      })}
    </span>
  )
}

// ─── BtwBubble ───

export function BtwBubble() {
  const btwState = useSessionStore((s) => s.btwState)
  const dismissBtw = useSessionStore((s) => s.dismissBtw)
  const colors = useColors()
  const scrollRef = useRef<HTMLDivElement>(null)
  const isNearBottomRef = useRef(true)

  const isLoading = btwState?.status === 'loading' || btwState?.status === 'streaming'
  const showLoader = !!isLoading && !btwState?.responseText
  const spinnerChar = useSpinnerFrame(showLoader)

  // Shimmer colors — use accent as base, lighter version as shimmer
  const shimmerBaseColor = colors.accent
  const shimmerHighColor = useMemo(() => {
    // Lighten the accent color for shimmer highlight
    // Parse hex or use as-is for named colors
    try {
      const hex = colors.accent.replace('#', '')
      if (hex.length === 6) {
        const r = Math.min(255, parseInt(hex.slice(0, 2), 16) + 35)
        const g = Math.min(255, parseInt(hex.slice(2, 4), 16) + 35)
        const b = Math.min(255, parseInt(hex.slice(4, 6), 16) + 35)
        return `rgb(${r}, ${g}, ${b})`
      }
    } catch {}
    return colors.accent
  }, [colors.accent])

  // Track whether user is scrolled near the bottom (mirrors ConversationView)
  const handleScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    isNearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60
  }, [])

  // Auto-scroll as response streams in, only when near bottom
  useEffect(() => {
    if (isNearBottomRef.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [btwState?.responseText])

  // Dismiss on Enter, Space, or Escape when done
  useEffect(() => {
    if (!btwState || btwState.status === 'loading' || btwState.status === 'streaming') return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        dismissBtw()
      }
    }
    document.addEventListener('keydown', handler, true)
    return () => document.removeEventListener('keydown', handler, true)
  }, [btwState?.status, dismissBtw])

  return (
    <AnimatePresence>
      {btwState && (
        <motion.div
          data-clui-ui
          initial={{ opacity: 0, y: 8, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 6, scale: 0.97 }}
          transition={TRANSITION}
          style={{ marginBottom: 8, zIndex: 12 }}
        >
          <div
            className="glass-surface no-drag"
            style={{
              borderRadius: 16,
              padding: '10px 14px',
              maxHeight: 280,
              overflowY: 'auto',
              overflowX: 'hidden',
              border: `1px solid ${colors.containerBorder}`,
            }}
            ref={scrollRef}
            onScroll={handleScroll}
          >
            {/* Question */}
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6 }}>
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                style={{ color: colors.accent, flexShrink: 0, marginTop: 1 }}
              >
                {/* Map body */}
                <path
                  d="M3 6.5L9 4l6 3 6-2.5V18.5L15 21l-6-3-6 2.5V6.5z"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinejoin="round"
                  fill="none"
                />
                <line x1="9" y1="4" x2="9" y2="18" stroke="currentColor" strokeWidth="1.8" />
                <line x1="15" y1="7" x2="15" y2="21" stroke="currentColor" strokeWidth="1.8" />
                {/* Question mark */}
                <circle cx="19.5" cy="4.5" r="4" fill={colors.accent} />
                <text x="19.5" y="7.5" textAnchor="middle" fontSize="6" fontWeight="700" fill="white" fontFamily="system-ui">?</text>
              </svg>
              <span style={{ fontSize: 13, color: colors.textSecondary, lineHeight: 1.4 }}>
                {btwState.question}
              </span>
            </div>

            {/* Loading — Claude Code style animated spinner + shimmer text */}
            {showLoader && (
              <div
                className="flex items-center gap-1.5"
                style={{ fontSize: 13, padding: '2px 0' }}
              >
                <span style={{ color: shimmerBaseColor, fontFamily: 'inherit' }}>
                  {spinnerChar}
                </span>
                <ShimmerText
                  text="Answering..."
                  active
                  baseColor={shimmerBaseColor}
                  shimmerColor={shimmerHighColor}
                />
              </div>
            )}

            {/* Streamed response */}
            {btwState.responseText && (
              <div className="text-[13px] leading-[1.6] prose-cloud min-w-0" style={{ color: colors.textPrimary }}>
                <Markdown remarkPlugins={REMARK_PLUGINS} rehypePlugins={REHYPE_PLUGINS} components={SAFE_LINK_COMPONENTS}>
                  {btwState.responseText}
                </Markdown>
              </div>
            )}

            {/* Error */}
            {btwState.status === 'error' && (
              <span style={{ fontSize: 12, color: colors.statusError }}>
                {btwState.errorMessage || 'Something went wrong'}
              </span>
            )}

            {/* Dismiss hint */}
            {(btwState.status === 'done' || btwState.status === 'error') && (
              <div style={{ marginTop: 6, fontSize: 10, color: colors.textTertiary, opacity: 0.7 }}>
                Press Esc, Enter, or Space to dismiss
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
