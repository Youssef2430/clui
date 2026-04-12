import React, { useState, useCallback, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { MagnifyingGlass, SpinnerGap, X, Clock, FolderSimple, ArrowRight } from '@phosphor-icons/react'
import { useSessionStore } from '../stores/sessionStore'
import { useColors } from '../theme'
import type { SearchResult } from '../../shared/types'

/** Derive a short project name from a full path or encoded dir. */
function shortPath(p: string): string {
  if (!p) return ''
  if (p.startsWith('-') && !p.includes('/')) {
    const parts = p.split('-').filter(Boolean)
    return parts[parts.length - 1] || p
  }
  const parts = p.replace(/\/+$/, '').split('/')
  return parts[parts.length - 1] || p
}

/** Format a timestamp as relative time. */
function timeAgo(timestamp: string): string {
  const now = Date.now()
  const then = new Date(timestamp).getTime()
  const diffSec = Math.floor((now - then) / 1000)
  if (diffSec < 60) return 'just now'
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`
  if (diffSec < 604800) return `${Math.floor(diffSec / 86400)}d ago`
  if (diffSec < 2592000) return `${Math.floor(diffSec / 604800)}w ago`
  return new Date(timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

/** Confidence label from score. */
function confidenceLabel(score: number): string {
  const pct = Math.round(score * 100)
  return `${pct}% match`
}

export function SearchPanel() {
  const colors = useColors()
  const closeSearchPanel = useSessionStore((s) => s.closeSearchPanel)
  const indexStatus = useSessionStore((s) => s.searchIndexStatus)

  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [hasSearched, setHasSearched] = useState(false)

  const inputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 60)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => () => clearTimeout(debounceRef.current), [])

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults([])
      setSearching(false)
      setHasSearched(false)
      return
    }
    setSearching(true)
    try {
      const res = await window.clui.searchSessions(q.trim())
      setResults(res)
      setHasSearched(true)
    } catch {
      setResults([])
      setHasSearched(true)
    } finally {
      setSearching(false)
    }
  }, [])

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    setQuery(val)
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => doSearch(val), 300)
  }, [doSearch])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      closeSearchPanel()
    }
  }, [closeSearchPanel])

  const handleResultClick = useCallback((result: SearchResult) => {
    const title = result.firstMessage?.substring(0, 30) || result.slug || 'Search Result'
    useSessionStore.getState().resumeSession(result.sessionId, title, result.projectPath)
    closeSearchPanel()
  }, [closeSearchPanel])

  const isIndexing = indexStatus.state === 'indexing'
  const isError = indexStatus.state === 'error'
  const isIdle = indexStatus.state === 'idle'
  const meaningful = results.filter((r) => r.score > 0.15)

  return (
    <div
      data-clui-ui
      onKeyDown={handleKeyDown}
      style={{
        height: 470,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* ─── Header ─── */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '16px 18px 10px',
        borderBottom: `1px solid ${colors.containerBorder}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <MagnifyingGlass size={20} weight="regular" style={{ color: colors.accent }} />
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: colors.textPrimary }}>
              Search Conversations
            </div>
            <div style={{ fontSize: 11, color: colors.textTertiary, marginTop: 2 }}>
              Find past conversations by meaning or keywords
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {hasSearched && meaningful.length > 0 && (
            <span style={{ fontSize: 11, color: colors.textTertiary }}>
              {meaningful.length} result{meaningful.length === 1 ? '' : 's'}
            </span>
          )}
          <button
            onClick={closeSearchPanel}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: colors.textTertiary, padding: 2, display: 'flex',
              borderRadius: 4,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = colors.textPrimary)}
            onMouseLeave={(e) => (e.currentTarget.style.color = colors.textTertiary)}
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* ─── Search input ─── */}
      <div style={{ padding: '12px 18px 0', flexShrink: 0 }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          background: colors.inputPillBg,
          borderRadius: 12,
          padding: '9px 12px',
          border: `1px solid ${colors.containerBorder}`,
          transition: 'border-color 0.15s',
        }}>
          {searching ? (
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
              style={{ display: 'flex', flexShrink: 0 }}
            >
              <SpinnerGap size={13} style={{ color: colors.accent }} />
            </motion.div>
          ) : (
            <MagnifyingGlass size={13} style={{ color: colors.textTertiary, flexShrink: 0 }} />
          )}
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder="Search by meaning or keyword..."
            style={{
              flex: 1,
              background: 'none',
              border: 'none',
              outline: 'none',
              color: colors.textPrimary,
              fontSize: 12,
              fontFamily: 'inherit',
            }}
          />
          {query && (
            <button
              onClick={() => { setQuery(''); setResults([]); setHasSearched(false); inputRef.current?.focus() }}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: colors.textTertiary, padding: 0, display: 'flex',
                flexShrink: 0,
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = colors.textPrimary)}
              onMouseLeave={(e) => (e.currentTarget.style.color = colors.textTertiary)}
            >
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      {/* ─── Index status ─── */}
      {(isIndexing || isError || (isIdle && query.trim())) && (
        <div style={{ padding: '8px 18px 0', flexShrink: 0 }}>
          {isIndexing && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '7px 10px', borderRadius: 8,
              background: colors.accentLight,
              border: `1px solid ${colors.accentBorder}`,
            }}>
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                style={{ display: 'flex', flexShrink: 0 }}
              >
                <SpinnerGap size={12} style={{ color: colors.accent }} />
              </motion.div>
              <span style={{ fontSize: 11, color: colors.accent, fontWeight: 500 }}>
                Indexing conversations
                {indexStatus.total
                  ? <> &middot; {indexStatus.indexed || 0}/{indexStatus.total}</>
                  : '...'
                }
              </span>
            </div>
          )}
          {isError && (
            <div style={{
              padding: '7px 10px', borderRadius: 8, fontSize: 11,
              color: colors.statusError,
              background: colors.statusErrorBg,
              border: `1px solid rgba(196, 112, 96, 0.15)`,
            }}>
              {indexStatus.error || 'Search index error'}
            </div>
          )}
          {isIdle && query.trim() && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '7px 10px', borderRadius: 8,
              background: colors.surfacePrimary,
              border: `1px solid ${colors.containerBorder}`,
              fontSize: 11, color: colors.textTertiary,
            }}>
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                style={{ display: 'flex', flexShrink: 0 }}
              >
                <SpinnerGap size={12} />
              </motion.div>
              Preparing search index...
            </div>
          )}
        </div>
      )}

      {/* ─── Results body ─── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '10px 18px 14px' }} className="custom-scrollbar">

        {/* Empty — no query */}
        {!query.trim() && !hasSearched && (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', height: '100%', gap: 6, padding: '20px 0',
          }}>
            <MagnifyingGlass size={28} weight="thin" style={{ color: colors.textTertiary, opacity: 0.4 }} />
            <span style={{ color: colors.textTertiary, fontSize: 12, marginTop: 4 }}>
              Type to search across all conversations
            </span>
            <span style={{
              fontSize: 10, color: colors.textTertiary, opacity: 0.5,
              fontFamily: 'monospace', marginTop: 2,
            }}>
              Cmd+Shift+F
            </span>
          </div>
        )}

        {/* Empty — no results */}
        {query.trim() && hasSearched && !searching && meaningful.length === 0 && (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', height: '100%', gap: 4, padding: '20px 0',
          }}>
            <span style={{ color: colors.textTertiary, fontSize: 12 }}>
              No matching conversations
            </span>
            {isIndexing && (
              <span style={{ color: colors.textTertiary, fontSize: 11, opacity: 0.6 }}>
                Results may appear after indexing completes
              </span>
            )}
          </div>
        )}

        {/* Results list */}
        <AnimatePresence initial={false}>
          {meaningful.map((result, i) => (
            <ResultCard
              key={result.sessionId}
              result={result}
              colors={colors}
              index={i}
              onClick={handleResultClick}
            />
          ))}
        </AnimatePresence>
      </div>
    </div>
  )
}

// ─── Result Card ───

function ResultCard({ result, colors, index, onClick }: {
  result: SearchResult
  colors: ReturnType<typeof useColors>
  index: number
  onClick: (result: SearchResult) => void
}) {
  const [hovered, setHovered] = useState(false)
  const [tooltipVisible, setTooltipVisible] = useState(false)
  const tooltipTimeout = useRef<ReturnType<typeof setTimeout>>()
  const scorePercent = Math.round(result.score * 100)

  // Derive a pill color from score
  const scoreColor = scorePercent >= 70
    ? colors.statusComplete
    : scorePercent >= 40
    ? colors.accent
    : colors.textTertiary

  const handleIndicatorEnter = (e: React.MouseEvent) => {
    e.stopPropagation()
    clearTimeout(tooltipTimeout.current)
    setTooltipVisible(true)
  }

  const handleIndicatorLeave = () => {
    tooltipTimeout.current = setTimeout(() => setTooltipVisible(false), 100)
  }

  useEffect(() => () => clearTimeout(tooltipTimeout.current), [])

  return (
    <motion.button
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, delay: index * 0.03 }}
      onClick={() => onClick(result)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); setTooltipVisible(false) }}
      style={{
        display: 'block',
        width: '100%',
        textAlign: 'left',
        background: hovered ? colors.surfaceHover : 'transparent',
        border: `1px solid ${hovered ? colors.containerBorder : 'transparent'}`,
        cursor: 'pointer',
        padding: '11px 12px',
        borderRadius: 12,
        marginBottom: 4,
        transition: 'all 0.14s ease',
        position: 'relative',
        fontFamily: 'inherit',
      }}
    >
      {/* Snippet text */}
      <div style={{
        color: colors.textPrimary,
        fontSize: 12.5,
        lineHeight: '18px',
        display: '-webkit-box',
        WebkitLineClamp: 2,
        WebkitBoxOrient: 'vertical',
        overflow: 'hidden',
        wordBreak: 'break-word',
      }}>
        {result.snippet}
      </div>

      {/* Meta row */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        marginTop: 7,
        fontSize: 10.5,
        color: colors.textTertiary,
      }}>
        {/* Project pill */}
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 3,
          padding: '2px 7px', borderRadius: 999,
          background: colors.surfacePrimary,
          border: `1px solid ${colors.containerBorder}`,
          fontWeight: 500,
          maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          <FolderSimple size={10} weight="fill" style={{ flexShrink: 0, opacity: 0.7 }} />
          {shortPath(result.projectPath)}
        </span>

        {/* Timestamp */}
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
          <Clock size={10} style={{ opacity: 0.7 }} />
          {timeAgo(result.lastTimestamp)}
        </span>

        <div style={{ flex: 1 }} />

        {/* Confidence indicator — radial ring */}
        <span
          onMouseEnter={handleIndicatorEnter}
          onMouseLeave={handleIndicatorLeave}
          style={{
            position: 'relative',
            display: 'inline-flex',
            cursor: 'default',
          }}
        >
          <svg width={13} height={13} viewBox="0 0 13 13" style={{ display: 'block' }}>
            {(() => {
              const count = 12
              const cx = 6.5, cy = 6.5, r = 5
              const dotR = 1
              const filled = Math.round(result.score * count)
              return Array.from({ length: count }, (_, i) => {
                const angle = (i / count) * Math.PI * 2 - Math.PI / 2
                const x = cx + r * Math.cos(angle)
                const y = cy + r * Math.sin(angle)
                return (
                  <circle
                    key={i}
                    cx={x} cy={y} r={dotR}
                    fill={scoreColor}
                    opacity={i < filled ? 0.9 : 0.15}
                  />
                )
              })
            })()}
          </svg>

          {/* Tooltip on hover */}
          <AnimatePresence>
            {tooltipVisible && (
              <motion.span
                initial={{ opacity: 0, y: 4, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 2, scale: 0.97 }}
                transition={{ duration: 0.12 }}
                style={{
                  position: 'absolute',
                  bottom: 'calc(100% + 6px)',
                  right: -4,
                  padding: '4px 8px',
                  borderRadius: 6,
                  background: colors.popoverBg,
                  border: `1px solid ${colors.popoverBorder}`,
                  boxShadow: colors.popoverShadow,
                  color: colors.textSecondary,
                  fontSize: 10,
                  fontWeight: 500,
                  whiteSpace: 'nowrap',
                  pointerEvents: 'none',
                  zIndex: 50,
                }}
              >
                {confidenceLabel(result.score)}
              </motion.span>
            )}
          </AnimatePresence>
        </span>

        {/* Arrow on hover */}
        <motion.span
          animate={{ opacity: hovered ? 0.6 : 0, x: hovered ? 0 : -4 }}
          transition={{ duration: 0.14 }}
          style={{ display: 'flex', color: colors.textTertiary }}
        >
          <ArrowRight size={11} weight="bold" />
        </motion.span>
      </div>
    </motion.button>
  )
}
