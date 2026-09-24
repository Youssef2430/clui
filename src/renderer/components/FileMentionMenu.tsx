import React, { useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'framer-motion'
import {
  FolderSimple, File, ArrowLeft,
  FileTs, FileTsx, FileJs, FileJsx, FileHtml, FileCss,
  FilePy, FileRs, FileCpp, FileC, FileCSharp, FileSql, FileVue,
  FileMd, FileDoc, FilePdf, FileTxt, FileCsv, FileXls, FilePpt,
  FileImage, FileJpg, FilePng, FileSvg,
  FileVideo, FileAudio, FileZip, FileCode, FileIni,
  Terminal, Gear, Lock, Package, Database, Globe,
} from '@phosphor-icons/react'
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

const ICON_SIZE = 13

/** Map file extension → Phosphor icon component + optional color hint */
export function getFileIcon(filename: string): React.ReactNode {
  const ext = filename.includes('.') ? filename.split('.').pop()!.toLowerCase() : ''
  const name = filename.toLowerCase()

  // Config / dotfiles by name
  if (name === 'package.json' || name === 'package-lock.json') return <Package size={ICON_SIZE} />
  if (name === 'dockerfile' || name === 'docker-compose.yml' || name === 'docker-compose.yaml') return <Database size={ICON_SIZE} />
  if (name === 'license' || name === 'license.md') return <Lock size={ICON_SIZE} />
  if (name === '.gitignore' || name === '.gitattributes') return <Gear size={ICON_SIZE} />
  if (name === '.env' || name === '.env.local' || name === '.env.production') return <Lock size={ICON_SIZE} />
  if (name === 'makefile' || name === 'cmakelists.txt') return <Terminal size={ICON_SIZE} />
  if (name === 'tsconfig.json' || name === 'jsconfig.json') return <Gear size={ICON_SIZE} />

  switch (ext) {
    // TypeScript / JavaScript
    case 'ts': return <FileTs size={ICON_SIZE} />
    case 'tsx': return <FileTsx size={ICON_SIZE} />
    case 'js': return <FileJs size={ICON_SIZE} />
    case 'jsx': return <FileJsx size={ICON_SIZE} />
    case 'mjs': case 'cjs': return <FileJs size={ICON_SIZE} />

    // Web
    case 'html': case 'htm': return <FileHtml size={ICON_SIZE} />
    case 'css': case 'scss': case 'sass': case 'less': return <FileCss size={ICON_SIZE} />
    case 'vue': return <FileVue size={ICON_SIZE} />

    // Data / Config
    case 'json': case 'jsonc': case 'json5': return <FileCode size={ICON_SIZE} />
    case 'yaml': case 'yml': return <FileIni size={ICON_SIZE} />
    case 'toml': case 'ini': case 'cfg': case 'conf': return <FileIni size={ICON_SIZE} />
    case 'xml': return <FileCode size={ICON_SIZE} />
    case 'env': return <Lock size={ICON_SIZE} />
    case 'csv': return <FileCsv size={ICON_SIZE} />
    case 'sql': return <FileSql size={ICON_SIZE} />
    case 'db': case 'sqlite': case 'sqlite3': return <Database size={ICON_SIZE} />

    // Languages
    case 'py': case 'pyi': case 'pyx': return <FilePy size={ICON_SIZE} />
    case 'rs': return <FileRs size={ICON_SIZE} />
    case 'cpp': case 'cc': case 'cxx': case 'hpp': return <FileCpp size={ICON_SIZE} />
    case 'c': case 'h': return <FileC size={ICON_SIZE} />
    case 'cs': return <FileCSharp size={ICON_SIZE} />
    case 'go': case 'java': case 'kt': case 'scala': case 'swift': case 'rb': case 'php':
    case 'r': case 'lua': case 'zig': case 'ex': case 'exs': case 'erl': case 'hs':
    case 'clj': case 'cljs': case 'lisp': case 'el': case 'dart': case 'nim':
      return <FileCode size={ICON_SIZE} />

    // Shell / scripts
    case 'sh': case 'bash': case 'zsh': case 'fish': case 'bat': case 'cmd': case 'ps1':
      return <Terminal size={ICON_SIZE} />

    // Docs
    case 'md': case 'mdx': return <FileMd size={ICON_SIZE} />
    case 'txt': case 'text': case 'log': return <FileTxt size={ICON_SIZE} />
    case 'pdf': return <FilePdf size={ICON_SIZE} />
    case 'doc': case 'docx': case 'rtf': return <FileDoc size={ICON_SIZE} />
    case 'xls': case 'xlsx': return <FileXls size={ICON_SIZE} />
    case 'ppt': case 'pptx': return <FilePpt size={ICON_SIZE} />

    // Images
    case 'jpg': case 'jpeg': return <FileJpg size={ICON_SIZE} />
    case 'png': return <FilePng size={ICON_SIZE} />
    case 'svg': return <FileSvg size={ICON_SIZE} />
    case 'gif': case 'webp': case 'ico': case 'bmp': case 'tiff': case 'avif':
      return <FileImage size={ICON_SIZE} />

    // Media
    case 'mp4': case 'webm': case 'avi': case 'mov': case 'mkv': case 'flv':
      return <FileVideo size={ICON_SIZE} />
    case 'mp3': case 'wav': case 'ogg': case 'flac': case 'aac': case 'm4a':
      return <FileAudio size={ICON_SIZE} />

    // Archives
    case 'zip': case 'tar': case 'gz': case 'bz2': case 'xz': case '7z': case 'rar':
      return <FileZip size={ICON_SIZE} />

    // Lock files
    case 'lock': return <Lock size={ICON_SIZE} />

    // Web manifest
    case 'wasm': return <Globe size={ICON_SIZE} />

    default: return <File size={ICON_SIZE} />
  }
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
    const fetchIdRef = useRef(0)

    // Parse filter into directory prefix + name filter
    const lastSlash = filter.lastIndexOf('/')
    const dirPrefix = lastSlash >= 0 ? filter.slice(0, lastSlash + 1) : ''
    const nameFilter = lastSlash >= 0 ? filter.slice(lastSlash + 1) : filter

    // Fetch directory listing when dirPrefix changes (with stale-request guard)
    useEffect(() => {
      const id = ++fetchIdRef.current
      setLoading(true)
      const fullPath = dirPrefix
        ? `${basePath}/${dirPrefix}`.replace(/\/+$/, '')
        : basePath
      window.glui.listDir(fullPath).then((result) => {
        if (fetchIdRef.current !== id) return // stale response, ignore
        setEntries(result)
        setLoading(false)
      }).catch(() => {
        if (fetchIdRef.current !== id) return
        setEntries([])
        setLoading(false)
      })
    }, [dirPrefix, basePath])

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
        data-glui-ui
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
          className="glui-popover overflow-hidden rounded-xl flex flex-col"
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
                    {entry.isDirectory ? <FolderSimple size={ICON_SIZE} weight="fill" /> : getFileIcon(entry.name)}
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
