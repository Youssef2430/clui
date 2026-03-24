import React, { useEffect, useRef, useState, useCallback, forwardRef, useImperativeHandle } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'framer-motion'
import { FolderSimple, File, ArrowLeft } from '@phosphor-icons/react'
import { usePopoverLayer } from './PopoverLayer'
import { useColors } from '../theme'

interface DirEntry {
  name: string
  isDirectory: boolean
}

interface Props {
  /** The text typed after '@' (e.g. 'src/com') */
  filter: string
  selectedIndex: number
  onSelect: (relativePath: string, isDirectory: boolean) => void
  onFilteredCountChange?: (count: number) => void
  anchorRect: DOMRect | null
  /** The tab's working directory (absolute path) */
  basePath: string
}

export interface FileMentionMenuHandle {
  /** Commit the currently highlighted selection (called on Tab/Enter from parent) */
  commitSelection: () => void
}

export const FileMentionMenu = forwardRef<FileMentionMenuHandle, Props>(
  function FileMentionMenu({ filter, selectedIndex, onSelect, onFilteredCountChange, anchorRect, basePath }, ref) {
    const listRef = useRef<HTMLDivElement>(null)
    const popoverLayer = usePopoverLayer()
    const colors = useColors()
    const [entries, setEntries] = useState<DirEntry[]>([])
    const [loading, setLoading] = useState(false)

    // Parse filter into directory prefix + name filter
    const lastSlash = filter.lastIndexOf('/')
    const dirPrefix = lastSlash >= 0 ? filter.slice(0, lastSlash + 1) : ''
    const nameFilter = lastSlash >= 0 ? filter.slice(lastSlash + 1) : filter

    // Fetch directory listing when dirPrefix changes
    const fetchDir = useCallback(async (prefix: string) => {
      setLoading(true)
      try {
        const fullPath = prefix
          ? `${basePath}/${prefix}`.replace(/\/+$/, '')
          : basePath
        const result = await window.clui.listDir(fullPath)
        setEntries(result)
      } catch {
        setEntries([])
      }
      setLoading(false)
    }, [basePath])

    useEffect(() => {
      fetchDir(dirPrefix)
    }, [dirPrefix, fetchDir])

    // Filter entries by name
    const filtered = nameFilter
      ? entries.filter((e) => e.name.toLowerCase().startsWith(nameFilter.toLowerCase()))
      : entries

    // Report filtered count to parent for index wrapping
    useEffect(() => {
      onFilteredCountChange?.(filtered.length)
    }, [filtered.length, onFilteredCountChange])

    // Clamp selected index
    const clampedIndex = filtered.length > 0 ? selectedIndex % filtered.length : 0

    // Expose imperative methods
    useImperativeHandle(ref, () => ({
      commitSelection: () => {
        if (filtered.length === 0) return
        const entry = filtered[clampedIndex]
        const path = dirPrefix + entry.name
        onSelect(entry.isDirectory ? path + '/' : path, entry.isDirectory)
      },
    }), [filtered, clampedIndex, dirPrefix, onSelect])

    // Scroll selected item into view
    useEffect(() => {
      if (!listRef.current) return
      const items = listRef.current.querySelectorAll('[data-mention-item]')
      const item = items[clampedIndex] as HTMLElement | undefined
      item?.scrollIntoView({ block: 'nearest' })
    }, [clampedIndex])

    if (!anchorRect || !popoverLayer) return null
    if (filtered.length === 0 && !loading && !dirPrefix) return null

    const showBackButton = dirPrefix.length > 0

    return createPortal(
      <motion.div
        data-clui-ui
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 4 }}
        transition={{ duration: 0.12 }}
        style={{
          position: 'fixed',
          bottom: window.innerHeight - anchorRect.top + 4,
          left: anchorRect.left + 12,
          right: window.innerWidth - anchorRect.right + 12,
          pointerEvents: 'auto',
        }}
      >
        <div
          className="overflow-hidden rounded-xl flex flex-col"
          style={{
            maxHeight: 280,
            background: colors.popoverBg,
            backdropFilter: 'blur(20px)',
            border: `1px solid ${colors.popoverBorder}`,
            boxShadow: colors.popoverShadow,
          }}
        >
          {/* Header: current path */}
          <div
            className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-mono border-b shrink-0"
            style={{ color: colors.textTertiary, borderColor: colors.popoverBorder }}
          >
            {showBackButton && (
              <button
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  // Go up one directory level
                  const parts = dirPrefix.replace(/\/$/, '').split('/')
                  parts.pop()
                  const parentPrefix = parts.length > 0 ? parts.join('/') + '/' : ''
                  onSelect(parentPrefix, true)
                }}
                className="flex items-center justify-center w-5 h-5 rounded hover:bg-white/10 transition-colors"
                style={{ color: colors.textSecondary }}
              >
                <ArrowLeft size={12} weight="bold" />
              </button>
            )}
            <span>@{dirPrefix || './'}</span>
          </div>

          {/* File/folder list */}
          <div ref={listRef} className="overflow-y-auto py-1">
            {loading && (
              <div className="px-3 py-2 text-[11px]" style={{ color: colors.textTertiary }}>
                Loading...
              </div>
            )}
            {!loading && filtered.length === 0 && (
              <div className="px-3 py-2 text-[11px]" style={{ color: colors.textTertiary }}>
                No matches
              </div>
            )}
            {!loading && filtered.map((entry, i) => {
              const isSelected = i === clampedIndex
              return (
                <button
                  key={entry.name}
                  data-mention-item
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    const path = dirPrefix + entry.name
                    onSelect(entry.isDirectory ? path + '/' : path, entry.isDirectory)
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-1.5 text-left transition-colors"
                  style={{
                    background: isSelected ? colors.accentLight : 'transparent',
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.background = colors.accentLight
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected) {
                      (e.currentTarget as HTMLElement).style.background = 'transparent'
                    }
                  }}
                >
                  <span
                    className="flex items-center justify-center w-6 h-6 rounded-md flex-shrink-0"
                    style={{
                      background: isSelected ? colors.accentSoft : colors.surfaceHover,
                      color: isSelected
                        ? colors.accent
                        : entry.isDirectory
                          ? colors.accent
                          : colors.textTertiary,
                    }}
                  >
                    {entry.isDirectory ? <FolderSimple size={13} weight="fill" /> : <File size={13} />}
                  </span>
                  <div className="min-w-0 flex-1 flex items-center">
                    <span
                      className="text-[12px] font-mono truncate"
                      style={{ color: isSelected ? colors.accent : colors.textPrimary }}
                    >
                      {entry.name}
                    </span>
                    {entry.isDirectory && (
                      <span
                        className="text-[10px] ml-1.5 flex-shrink-0"
                        style={{ color: colors.textTertiary }}
                      >
                        /
                      </span>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      </motion.div>,
      popoverLayer,
    )
  },
)
