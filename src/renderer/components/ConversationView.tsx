import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import {
  FileText, PencilSimple, FileArrowUp, Terminal, MagnifyingGlass, Globe,
  Robot, Question, Wrench, FolderOpen, Copy, Check, CaretRight, CaretDown,
  SpinnerGap, ArrowCounterClockwise, Square,
  Brain, Lightning, ChatDots, HardDrives, Plugs, Archive, CircleDashed, Cpu,
  CurrencyDollar, Clock, ArrowsClockwise, CoinVertical,
  CheckSquare, CheckCircle, Circle,
  File, Image as ImageIcon, FileCode,
} from '@phosphor-icons/react'
import { useSessionStore } from '../stores/sessionStore'
import { PermissionCard } from './PermissionCard'
import { PermissionDeniedCard } from './PermissionDeniedCard'
import { useColors, useThemeStore } from '../theme'
import type { Message, Attachment } from '../../shared/types'

// ─── Constants ───

const INITIAL_RENDER_CAP = 100
const PAGE_SIZE = 100
const REMARK_PLUGINS = [remarkGfm, remarkMath] // Hoisted — prevents re-parse on every render
const REHYPE_PLUGINS = [rehypeKatex]

// Minimal link override for Markdown surfaces without full markdownComponents:
// prevents default <a> navigation (which would leave the Electron window)
// and instead opens links externally via the IPC bridge.
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

// ─── Types ───

type GroupedItem =
  | { kind: 'user'; message: Message }
  | { kind: 'assistant'; message: Message }
  | { kind: 'system'; message: Message }
  | { kind: 'tool-group'; messages: Message[] }

// ─── Helpers ───

function groupMessages(messages: Message[]): GroupedItem[] {
  const result: GroupedItem[] = []
  let toolBuf: Message[] = []

  const flushTools = () => {
    if (toolBuf.length > 0) {
      result.push({ kind: 'tool-group', messages: [...toolBuf] })
      toolBuf = []
    }
  }

  for (const msg of messages) {
    if (msg.role === 'tool') {
      toolBuf.push(msg)
    } else {
      flushTools()
      if (msg.role === 'user') result.push({ kind: 'user', message: msg })
      else if (msg.role === 'assistant') result.push({ kind: 'assistant', message: msg })
      else result.push({ kind: 'system', message: msg })
    }
  }
  flushTools()
  return result
}

// ─── Main Component ───

export function ConversationView() {
  const tabs = useSessionStore((s) => s.tabs)
  const activeTabId = useSessionStore((s) => s.activeTabId)
  const sendMessage = useSessionStore((s) => s.sendMessage)
  const staticInfo = useSessionStore((s) => s.staticInfo)
  const scrollRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const [hovered, setHovered] = useState(false)
  const [renderOffset, setRenderOffset] = useState(0) // 0 = show from tail
  const isNearBottomRef = useRef(true)
  const prevTabIdRef = useRef(activeTabId)
  const colors = useColors()
  const expandedUI = useThemeStore((s) => s.expandedUI)

  const tab = tabs.find((t) => t.id === activeTabId)

  // Reset render offset and scroll state when switching tabs
  useEffect(() => {
    if (activeTabId !== prevTabIdRef.current) {
      prevTabIdRef.current = activeTabId
      setRenderOffset(0)
      isNearBottomRef.current = true
    }
  }, [activeTabId])

  // Track whether user is scrolled near the bottom
  const handleScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    isNearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60
  }, [])

  // Auto-scroll when content changes and user is near bottom.
  const msgCount = tab?.messages.length ?? 0
  const lastMsg = tab?.messages[tab.messages.length - 1]
  const permissionQueueLen = tab?.permissionQueue?.length ?? 0
  const queuedCount = tab?.queuedPrompts?.length ?? 0
  const scrollTrigger = `${msgCount}:${lastMsg?.content?.length ?? 0}:${permissionQueueLen}:${queuedCount}`

  useEffect(() => {
    if (isNearBottomRef.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [scrollTrigger])

  // Group only the visible slice of messages
  const allMessages = tab?.messages ?? []
  const totalCount = allMessages.length
  const startIndex = Math.max(0, totalCount - INITIAL_RENDER_CAP - renderOffset * PAGE_SIZE)
  const visibleMessages = startIndex > 0 ? allMessages.slice(startIndex) : allMessages
  const hasOlder = startIndex > 0

  const grouped = useMemo(
    () => groupMessages(visibleMessages),
    [visibleMessages],
  )

  const hiddenCount = totalCount - visibleMessages.length

  const handleLoadOlder = useCallback(() => {
    setRenderOffset((o) => o + 1)
  }, [])

  if (!tab) return null

  const isRunning = tab.status === 'running' || tab.status === 'connecting'
  const isDead = tab.status === 'dead'
  const isFailed = tab.status === 'failed'
  const showInterrupt = isRunning && tab.messages.some((m) => m.role === 'user')

  if (tab.messages.length === 0) {
    return <EmptyState />
  }

  // Messages from before initial render cap are "historical" — no motion
  const historicalThreshold = Math.max(0, totalCount - 20)

  const handleRetry = () => {
    const lastUserMsg = [...tab.messages].reverse().find((m) => m.role === 'user')
    if (lastUserMsg) {
      sendMessage(lastUserMsg.content)
    }
  }

  return (
    <div
      data-clui-ui
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Scrollable messages area */}
      <div
        ref={scrollRef}
        className="overflow-y-auto overflow-x-hidden px-4 pt-2 conversation-selectable"
        style={{ maxHeight: expandedUI ? 460 : 336, paddingBottom: 28 }}
        onScroll={handleScroll}
      >
        {/* Load older button */}
        {hasOlder && (
          <div className="flex justify-center py-2">
            <button
              onClick={handleLoadOlder}
              className="text-[11px] px-3 py-1 rounded-full transition-colors"
              style={{ color: colors.textTertiary, border: `1px solid ${colors.toolBorder}` }}
            >
              Load {Math.min(PAGE_SIZE, hiddenCount)} older messages ({hiddenCount} hidden)
            </button>
          </div>
        )}

        <div className="space-y-1 relative">
          {grouped.map((item, idx) => {
            const msgIndex = startIndex + idx
            const isHistorical = msgIndex < historicalThreshold

            switch (item.kind) {
              case 'user':
                return <UserMessage key={item.message.id} message={item.message} skipMotion={isHistorical} />
              case 'assistant':
                return <AssistantMessage key={item.message.id} message={item.message} skipMotion={isHistorical} />
              case 'tool-group':
                return <ToolGroup key={`tg-${item.messages[0].id}`} tools={item.messages} skipMotion={isHistorical} />
              case 'system':
                return <SystemMessage key={item.message.id} message={item.message} skipMotion={isHistorical} />
              default:
                return null
            }
          })}
        </div>

        {/* Permission card (shows first item from queue) */}
        <AnimatePresence>
          {tab.permissionQueue.length > 0 && (
            <PermissionCard
              tabId={tab.id}
              permission={tab.permissionQueue[0]}
              queueLength={tab.permissionQueue.length}
            />
          )}
        </AnimatePresence>

        {/* Permission denied fallback card */}
        <AnimatePresence>
          {tab.permissionDenied && (
            <PermissionDeniedCard
              tools={tab.permissionDenied.tools}
              sessionId={tab.claudeSessionId}
              projectPath={staticInfo?.projectPath || process.cwd()}
              onDismiss={() => {
                useSessionStore.setState((s) => ({
                  tabs: s.tabs.map((t) =>
                    t.id === tab.id ? { ...t, permissionDenied: null } : t
                  ),
                }))
              }}
            />
          )}
        </AnimatePresence>

        {/* Queued prompts */}
        <AnimatePresence>
          {tab.queuedPrompts.map((queued, i) => (
            <QueuedMessage key={`queued-${i}`} content={queued.prompt} />
          ))}
        </AnimatePresence>

        <div ref={bottomRef} />
      </div>

      {/* Activity row — overlaps bottom of scroll area as a fade strip */}
      <div
        className="flex items-center justify-between px-4 relative"
        style={{
          height: 28,
          minHeight: 28,
          marginTop: -28,
          background: `linear-gradient(to bottom, transparent, ${colors.containerBg} 70%)`,
          zIndex: 2,
        }}
      >
        {/* Left: status indicator */}
        <div className="flex items-center gap-1.5 text-[11px] min-w-0">
          {isRunning && (
            <span className="flex items-center gap-1.5">
              <span className="flex gap-[3px]">
                <span className="w-[4px] h-[4px] rounded-full animate-bounce-dot" style={{ background: colors.statusRunning, animationDelay: '0ms' }} />
                <span className="w-[4px] h-[4px] rounded-full animate-bounce-dot" style={{ background: colors.statusRunning, animationDelay: '150ms' }} />
                <span className="w-[4px] h-[4px] rounded-full animate-bounce-dot" style={{ background: colors.statusRunning, animationDelay: '300ms' }} />
              </span>
              <span style={{ color: colors.textSecondary }}>{tab.currentActivity || 'Working...'}</span>
            </span>
          )}

          {isDead && (
            <span style={{ color: colors.statusError, fontSize: 11 }}>Session ended unexpectedly</span>
          )}

          {isFailed && (
            <span className="flex items-center gap-1.5">
              <span style={{ color: colors.statusError, fontSize: 11 }}>Failed</span>
              <button
                onClick={handleRetry}
                className="flex items-center gap-1 rounded-full px-2 py-0.5 transition-colors"
                style={{ color: colors.accent, fontSize: 11 }}
              >
                <ArrowCounterClockwise size={10} />
                Retry
              </button>
            </span>
          )}
        </div>

        {/* Right: interrupt button when running */}
        <div className="flex items-center flex-shrink-0">
          <AnimatePresence>
            {showInterrupt && (
              <InterruptButton tabId={tab.id} />
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}

// ─── Empty State (directory picker before first message) ───

function EmptyState() {
  const setBaseDirectory = useSessionStore((s) => s.setBaseDirectory)
  const colors = useColors()

  const handleChooseFolder = async () => {
    const dir = await window.clui.selectDirectory()
    if (dir) {
      setBaseDirectory(dir)
    }
  }

  return (
    <div
      className="flex flex-col items-center justify-center px-4 py-3 gap-1.5"
      style={{ minHeight: 80 }}
    >
      <button
        onClick={handleChooseFolder}
        className="flex items-center gap-1.5 text-[12px] px-3 py-1.5 rounded-lg transition-colors"
        style={{
          color: colors.accent,
          background: colors.surfaceHover,
          border: 'none',
          cursor: 'pointer',
        }}
      >
        <FolderOpen size={13} />
        Choose folder
      </button>
      <span className="text-[11px]" style={{ color: colors.textTertiary }}>
        Press <strong style={{ color: colors.textSecondary }}>⌥ + Space</strong> to show/hide this overlay
      </span>
    </div>
  )
}

// ─── Copy Button ───

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const colors = useColors()

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {}
  }

  return (
    <motion.button
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.12 }}
      onClick={handleCopy}
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[11px] cursor-pointer flex-shrink-0"
      style={{
        background: copied ? colors.statusCompleteBg : 'transparent',
        color: copied ? colors.statusComplete : colors.textTertiary,
        border: 'none',
      }}
      title="Copy response"
    >
      {copied ? <Check size={11} /> : <Copy size={11} />}
      <span>{copied ? 'Copied' : 'Copy'}</span>
    </motion.button>
  )
}

// ─── Interrupt Button ───

function InterruptButton({ tabId }: { tabId: string }) {
  const colors = useColors()

  const handleStop = () => {
    window.clui.stopTab(tabId)
  }

  return (
    <motion.button
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.12 }}
      onClick={handleStop}
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[11px] cursor-pointer flex-shrink-0 transition-colors"
      style={{
        background: 'transparent',
        color: colors.statusError,
        border: 'none',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = colors.statusErrorBg }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
      title="Stop current task"
    >
      <Square size={9} weight="fill" />
      <span>Interrupt</span>
    </motion.button>
  )
}

// ─── Attachment path prefix helpers ───

/** Regex matching `[Attached image: /path]` or `[Attached file: /path]` lines injected by sendMessage */
const ATTACHMENT_PREFIX_RE = /\[Attached (?:image|file): ([^\]]+)\]\n*/g

/**
 * Strip `[Attached ...: ...]` prefixes from user message content for display.
 * Returns the cleaned text (may be empty if the message was attachment-only).
 */
function stripAttachmentPrefixes(content: string): string {
  return content.replace(ATTACHMENT_PREFIX_RE, '').trim()
}

/**
 * Parse `[Attached ...: /path]` prefixes from message content into lightweight
 * Attachment-like objects so we can show file chips for messages that were loaded
 * from session history (where the `attachments` field isn't persisted).
 */
function parseAttachmentPrefixes(content: string): Attachment[] {
  const results: Attachment[] = []
  let match: RegExpExecArray | null
  const re = /\[Attached (image|file): ([^\]]+)\]/g
  while ((match = re.exec(content)) !== null) {
    const type = match[1] as 'image' | 'file'
    const path = match[2]
    const name = path.split('/').pop() || path
    results.push({ id: `parsed-${path}-${results.length}`, type, name, path })
  }
  return results
}

// ─── Message Attachment Preview (read-only, displayed in sent user bubbles) ───

const MSG_FILE_ICONS: Record<string, React.ReactNode> = {
  'image/png': <ImageIcon size={14} />,
  'image/jpeg': <ImageIcon size={14} />,
  'image/gif': <ImageIcon size={14} />,
  'image/webp': <ImageIcon size={14} />,
  'image/svg+xml': <ImageIcon size={14} />,
  'text/plain': <FileText size={14} />,
  'text/markdown': <FileText size={14} />,
  'application/json': <FileCode size={14} />,
  'text/yaml': <FileCode size={14} />,
  'text/toml': <FileCode size={14} />,
}

function MessageAttachments({ attachments }: { attachments: Attachment[] }) {
  const colors = useColors()
  if (attachments.length === 0) return null

  return (
    <div className="flex flex-wrap gap-1.5 pb-1.5">
      {attachments.map((a) => {
        // Resolve image source: prefer base64 dataUrl (instant), fall back to
        // loading the file from disk via the clui-local:// custom protocol.
        const imgSrc = a.dataUrl
          || (a.type === 'image' ? `clui-local://${encodeURIComponent(a.path).replace(/%2F/g, '/')}` : undefined)

        // Image attachments: just the thumbnail, no filename
        if (imgSrc) {
          return (
            <img
              key={a.id}
              src={imgSrc}
              alt={a.name}
              className="rounded-[10px] object-cover flex-shrink-0"
              style={{
                maxWidth: '100%',
                maxHeight: 180,
                border: `1px solid ${colors.userBubbleBorder}`,
              }}
            />
          )
        }

        // Non-image attachments: icon + filename chip
        return (
          <div
            key={a.id}
            className="flex items-center gap-1.5 flex-shrink-0"
            style={{
              background: colors.surfaceSecondary,
              border: `1px solid ${colors.userBubbleBorder}`,
              borderRadius: 10,
              padding: '4px 8px',
              maxWidth: 200,
            }}
          >
            <span className="flex-shrink-0" style={{ color: colors.textTertiary }}>
              {MSG_FILE_ICONS[a.mimeType || ''] || <File size={14} />}
            </span>
            <span
              className="text-[11px] font-medium truncate min-w-0 flex-1"
              style={{ color: colors.userBubbleText, opacity: 0.85 }}
            >
              {a.name}
            </span>
          </div>
        )
      })}
    </div>
  )
}

// ─── User Message ───

function UserMessage({ message, skipMotion }: { message: Message; skipMotion?: boolean }) {
  const colors = useColors()

  // Resolve attachments: prefer the rich `attachments` field (has dataUrl thumbnails),
  // fall back to parsing `[Attached ...: /path]` prefixes from content (session history).
  const attachments = (message.attachments && message.attachments.length > 0)
    ? message.attachments
    : parseAttachmentPrefixes(message.content)
  const hasAttachments = attachments.length > 0

  // Strip attachment path prefixes from the displayed text
  const displayText = hasAttachments ? stripAttachmentPrefixes(message.content) : message.content

  const content = (
    <div
      className="text-[13px] leading-[1.5] px-3 py-1.5 max-w-[85%]"
      style={{
        background: colors.userBubble,
        color: colors.userBubbleText,
        border: `1px solid ${colors.userBubbleBorder}`,
        borderRadius: '14px 14px 4px 14px',
        paddingTop: hasAttachments ? 10 : undefined,
      }}
    >
      {hasAttachments && (
        <MessageAttachments attachments={attachments} />
      )}
      {displayText}
    </div>
  )

  if (skipMotion) {
    return <div className="flex justify-end py-1.5">{content}</div>
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.15 }}
      className="flex justify-end py-1.5"
    >
      {content}
    </motion.div>
  )
}

// ─── Queued Message (waiting at bottom until processed) ───

function QueuedMessage({ content }: { content: string }) {
  const colors = useColors()

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.15 }}
      className="flex justify-end py-1.5"
    >
      <div
        className="text-[13px] leading-[1.5] px-3 py-1.5 max-w-[85%]"
        style={{
          background: colors.userBubble,
          color: colors.userBubbleText,
          border: `1px dashed ${colors.userBubbleBorder}`,
          borderRadius: '14px 14px 4px 14px',
          opacity: 0.6,
        }}
      >
        {content}
      </div>
    </motion.div>
  )
}

// ─── Table scroll wrapper — fade edges when horizontally scrollable ───

function TableScrollWrapper({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const [fade, setFade] = useState<string | undefined>(undefined)
  const prevFade = useRef<string | undefined>(undefined)

  const update = useCallback(() => {
    const el = ref.current
    if (!el) return
    const { scrollLeft, scrollWidth, clientWidth } = el
    let next: string | undefined
    if (scrollWidth <= clientWidth + 1) {
      next = undefined
    } else {
      const l = scrollLeft > 1
      const r = scrollLeft + clientWidth < scrollWidth - 1
      next = l && r
        ? 'linear-gradient(to right, transparent, black 24px, black calc(100% - 24px), transparent)'
        : l
          ? 'linear-gradient(to right, transparent, black 24px)'
          : r
            ? 'linear-gradient(to right, black calc(100% - 24px), transparent)'
            : undefined
    }
    if (next !== prevFade.current) {
      prevFade.current = next
      setFade(next)
    }
  }, [])

  useEffect(() => {
    update()
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(update)
    ro.observe(el)
    const table = el.querySelector('table')
    if (table) ro.observe(table)
    return () => ro.disconnect()
  }, [update])

  return (
    <div
      ref={ref}
      onScroll={update}
      style={{
        overflowX: 'auto',
        maskImage: fade,
        WebkitMaskImage: fade,
      }}
    >
      <table>{children}</table>
    </div>
  )
}

// ─── Image card — graceful fallback when src returns 404 ───

function ImageCard({ src, alt, colors }: { src?: string; alt?: string; colors: ReturnType<typeof useColors> }) {
  const [failed, setFailed] = useState(false)
  // Reset failed state when src changes (e.g. during streaming)
  useEffect(() => { setFailed(false) }, [src])
  const label = alt || 'Image'
  const open = () => { if (src) window.clui.openExternal(String(src)) }

  if (failed || !src) {
    return (
      <button
        type="button"
        className="inline-flex items-center gap-1.5 my-1 px-2.5 py-1.5 rounded-md text-[12px] cursor-pointer"
        style={{ background: colors.surfacePrimary, color: colors.accent, border: `1px solid ${colors.toolBorder}` }}
        onClick={open}
        title={src}
      >
        <Globe size={12} />
        Image unavailable{alt ? ` — ${alt}` : ''}
      </button>
    )
  }

  return (
    <button
      type="button"
      className="block my-2 rounded-lg overflow-hidden border text-left cursor-pointer"
      style={{ borderColor: colors.toolBorder, background: colors.surfacePrimary }}
      onClick={open}
      title={src}
    >
      <img
        src={src}
        alt={label}
        className="block w-full max-h-[260px] object-cover"
        loading="lazy"
        onError={() => setFailed(true)}
      />
      {alt && (
        <div className="px-2 py-1 text-[11px]" style={{ color: colors.textTertiary }}>
          {alt}
        </div>
      )}
    </button>
  )
}

// ─── Assistant Message (memoized — only re-renders when content changes) ───

const AssistantMessage = React.memo(function AssistantMessage({
  message,
  skipMotion,
}: {
  message: Message
  skipMotion?: boolean
}) {
  const colors = useColors()

  const markdownComponents = useMemo(() => ({
    table: ({ children }: any) => <TableScrollWrapper>{children}</TableScrollWrapper>,
    a: ({ href, children }: any) => (
      <button
        type="button"
        className="underline decoration-dotted underline-offset-2 cursor-pointer"
        style={{ color: colors.accent }}
        onClick={() => {
          if (href) window.clui.openExternal(String(href))
        }}
      >
        {children}
      </button>
    ),
    img: ({ src, alt }: any) => <ImageCard src={src} alt={alt} colors={colors} />,
  }), [colors])

  const inner = (
    <div className="group/msg relative">
      <div className="text-[13px] leading-[1.6] prose-cloud min-w-0 max-w-[92%]">
        <Markdown remarkPlugins={REMARK_PLUGINS} rehypePlugins={REHYPE_PLUGINS} components={markdownComponents}>
          {message.content}
        </Markdown>
      </div>
      {/* Copy button — always in DOM, shown via CSS :hover (no React state needed).
          Absolute positioning so it never shifts the text layout. */}
      {message.content.trim() && (
        <div className="absolute bottom-0 right-0 opacity-0 group-hover/msg:opacity-100 transition-opacity duration-100">
          <CopyButton text={message.content} />
        </div>
      )}
    </div>
  )

  if (skipMotion) {
    return <div className="py-1">{inner}</div>
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.15 }}
      className="py-1"
    >
      {inner}
    </motion.div>
  )
}, (prev, next) => prev.message.content === next.message.content && prev.skipMotion === next.skipMotion)

// ─── Tool Group (collapsible timeline — Claude Code style) ───

/** Build a short description from tool name + input for the collapsed summary */
function toolSummary(tools: Message[]): string {
  if (tools.length === 0) return ''
  // Use first tool's context for summary
  const first = tools[0]
  const desc = getToolDescription(first.toolName || 'Tool', first.toolInput)
  if (tools.length === 1) return desc
  return `${desc} and ${tools.length - 1} more tool${tools.length > 2 ? 's' : ''}`
}

/** Short human-readable description from tool name + already-parsed input */
function getToolDescriptionFromParsed(name: string, parsed: Record<string, unknown>): string {
  const s = (v: unknown) => (typeof v === 'string' ? v : '')
  switch (name) {
    case 'Read': return `Read ${s(parsed.file_path) || s(parsed.path) || 'file'}`
    case 'Edit': return `Edit ${s(parsed.file_path) || 'file'}`
    case 'Write': return `Write ${s(parsed.file_path) || 'file'}`
    case 'Glob': return `Search files: ${s(parsed.pattern)}`
    case 'Grep': return `Search: ${s(parsed.pattern)}`
    case 'Bash': {
      const cmd = s(parsed.command)
      return cmd.length > 60 ? `${cmd.substring(0, 57)}...` : cmd || 'Bash'
    }
    case 'WebSearch': return `Search: ${s(parsed.query) || s(parsed.search_query)}`
    case 'WebFetch': return `Fetch: ${s(parsed.url)}`
    case 'Agent': return `Agent: ${(s(parsed.prompt) || s(parsed.description)).substring(0, 50)}`
    case 'TodoWrite': {
      const items = Array.isArray(parsed.todos) ? parsed.todos : []
      const done = items.filter((t: any) => t.status === 'completed').length
      return `Update todos (${done}/${items.length} done)`
    }
    case 'TodoRead': return 'Read todos'
    default: return name
  }
}

/** Short human-readable description from tool name + input */
function getToolDescription(name: string, input?: string): string {
  if (!input) return name

  try {
    return getToolDescriptionFromParsed(name, JSON.parse(input))
  } catch {
    // Input is not JSON or is partial — show truncated raw
    const trimmed = input.trim()
    if (trimmed.length > 60) return `${name}: ${trimmed.substring(0, 57)}...`
    return trimmed ? `${name}: ${trimmed}` : name
  }
}

function ToolResultAccordion({ tool }: { tool: Message }) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const colors = useColors()
  const hasResult = !!tool.toolResult
  const isAgent = tool.toolName === 'Agent'
  const isRunning = tool.toolStatus === 'running'

  // Auto-scroll to bottom when content updates (streaming)
  useEffect(() => {
    if (open && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [open, tool.toolResult])

  // On-demand fetch from JSONL if no result yet and tool is completed
  const handleClick = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (hasResult || isRunning) {
      setOpen(!open)
      return
    }
    // Already open — just close
    if (open) { setOpen(false); return }
    // Try to fetch result from JSONL
    if (!tool.toolId) { setOpen(true); return }
    setOpen(true)
    setLoading(true)
    try {
      const tab = useSessionStore.getState().tabs.find((t) =>
        t.messages.some((m) => m.id === tool.id)
      )
      if (tab?.claudeSessionId) {
        const results = await window.clui.getToolResults(tab.claudeSessionId, tab.workingDirectory)
        if (results[tool.toolId]) {
          useSessionStore.setState((s) => ({
            tabs: s.tabs.map((t) => ({
              ...t,
              messages: t.messages.map((m) =>
                m.id === tool.id ? { ...m, toolResult: results[m.toolId!] || m.toolResult } : m
              ),
            })),
          }))
        }
      }
    } catch {}
    setLoading(false)
  }, [hasResult, isRunning, open, tool.toolId, tool.id])

  // Show the badge text
  const label = isRunning && isAgent ? 'Streaming...' : 'Result'

  return (
    <div className="inline-flex flex-col min-w-0" style={{ maxWidth: '100%' }}>
      <button
        onClick={handleClick}
        className="inline-flex items-center gap-0.5 text-[10px] mt-0.5 px-1.5 py-[1px] rounded transition-colors"
        style={{
          background: tool.toolStatus === 'error' ? colors.statusErrorBg : colors.surfaceHover,
          color: tool.toolStatus === 'error' ? colors.statusError : colors.textTertiary,
          cursor: 'pointer',
          border: 'none',
        }}
      >
        {open
          ? <CaretDown size={8} style={{ flexShrink: 0 }} />
          : <CaretRight size={8} style={{ flexShrink: 0 }} />
        }
        {label}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <div
              ref={scrollRef}
              className="text-[11px] leading-[1.5] mt-1 px-2 py-1.5 rounded max-h-[200px] overflow-y-auto prose-cloud"
              style={{
                background: colors.surfacePrimary,
                color: colors.textSecondary,
                border: `1px solid ${colors.toolBorder}`,
              }}
            >
              {loading && !hasResult && (
                <span style={{ color: colors.textTertiary }}>Loading...</span>
              )}
              {hasResult && (
                <Markdown remarkPlugins={REMARK_PLUGINS} rehypePlugins={REHYPE_PLUGINS} components={SAFE_LINK_COMPONENTS}>{tool.toolResult!}</Markdown>
              )}
              {!loading && !hasResult && (
                <span style={{ color: colors.textTertiary }}>No result data available</span>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function ToolGroup({ tools, skipMotion }: { tools: Message[]; skipMotion?: boolean }) {
  const hasRunning = tools.some((t) => t.toolStatus === 'running')
  const [expanded, setExpanded] = useState(false)
  const colors = useColors()

  const isOpen = expanded || hasRunning

  if (isOpen) {
    const inner = (
      <div className="py-1">
        {/* Collapse header — click to close */}
        {!hasRunning && (
          <div
            className="flex items-center gap-1 cursor-pointer mb-1.5"
            onClick={() => setExpanded(false)}
          >
            <CaretDown size={10} style={{ color: colors.textMuted }} />
            <span className="text-[11px]" style={{ color: colors.textMuted }}>
              Used {tools.length} tool{tools.length !== 1 ? 's' : ''}
            </span>
          </div>
        )}

        {/* Timeline */}
        <div className="relative pl-6">
          {/* Vertical line */}
          <div
            className="absolute left-[10px] top-1 bottom-1 w-px"
            style={{ background: colors.timelineLine }}
          />

          <div className="space-y-3">
            {tools.map((tool) => {
              const isRunning = tool.toolStatus === 'running'
              const toolName = tool.toolName || 'Tool'
              // Parse tool input once for both description and detail content
              let parsedInput: Record<string, unknown> | null = null
              if (tool.toolInput) {
                try { parsedInput = JSON.parse(tool.toolInput) } catch { /* partial JSON */ }
              }
              const desc = parsedInput
                ? getToolDescriptionFromParsed(toolName, parsedInput)
                : getToolDescription(toolName, tool.toolInput)

              return (
                <div key={tool.id} className="relative">
                  {/* Timeline node */}
                  <div
                    className="absolute -left-6 top-[1px] w-[20px] h-[20px] rounded-full flex items-center justify-center"
                    style={{
                      background: isRunning ? colors.toolRunningBg : colors.toolBg,
                      border: `1px solid ${isRunning ? colors.toolRunningBorder : colors.toolBorder}`,
                    }}
                  >
                    {isRunning
                      ? <SpinnerGap size={10} className="animate-spin" style={{ color: colors.statusRunning }} />
                      : <ToolIcon name={toolName} size={10} />
                    }
                  </div>

                  {/* Tool description */}
                  <div className="min-w-0">
                    <span
                      className="text-[12px] leading-[1.4] block truncate"
                      style={{ color: isRunning ? colors.textSecondary : colors.textTertiary }}
                    >
                      {desc}
                    </span>

                    {/* Tool detail content for Edit/Write */}
                    {!isRunning && parsedInput && (() => {
                      const monoFont = 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace'
                      if (toolName === 'Edit' && ('old_string' in parsedInput || 'new_string' in parsedInput)) {
                        const oldStr = typeof parsedInput.old_string === 'string' ? parsedInput.old_string : null
                        const newStr = typeof parsedInput.new_string === 'string' ? parsedInput.new_string : null
                        if (oldStr === null && newStr === null) return null
                        return (
                          <div
                            className="mt-1 text-[11px] leading-[1.5] rounded overflow-hidden"
                            style={{ border: `1px solid ${colors.toolBorder}` }}
                            role="group"
                            aria-label="Edit diff"
                          >
                            {oldStr !== null && (
                              <pre
                                className="px-2 py-1 whitespace-pre-wrap break-all overflow-y-auto"
                                aria-label="Removed"
                                style={{
                                  background: colors.diffRemovedBg,
                                  color: colors.textSecondary,
                                  maxHeight: 120,
                                  margin: 0,
                                  fontFamily: monoFont,
                                  fontSize: 10,
                                }}
                              ><span style={{ color: colors.textMuted, userSelect: 'none' }}>- </span>{oldStr.length > 300 ? oldStr.slice(0, 297) + '...' : oldStr}</pre>
                            )}
                            {newStr !== null && (
                              <pre
                                className="px-2 py-1 whitespace-pre-wrap break-all overflow-y-auto"
                                aria-label="Added"
                                style={{
                                  background: colors.diffAddedBg,
                                  color: colors.textSecondary,
                                  maxHeight: 120,
                                  margin: 0,
                                  fontFamily: monoFont,
                                  fontSize: 10,
                                }}
                              ><span style={{ color: colors.textMuted, userSelect: 'none' }}>+ </span>{newStr.length > 300 ? newStr.slice(0, 297) + '...' : newStr}</pre>
                            )}
                          </div>
                        )
                      }
                      if (toolName === 'Write' && typeof parsedInput.content === 'string') {
                        const content = parsedInput.content
                        const snippet = content.length > 200 ? content.slice(0, 197) + '...' : content
                        return (
                          <pre
                            className="mt-1 px-2 py-1 text-[10px] leading-[1.5] rounded whitespace-pre-wrap break-all overflow-y-auto"
                            aria-label="File content"
                            style={{
                              background: colors.surfaceHover,
                              color: colors.textSecondary,
                              maxHeight: 120,
                              margin: 0,
                              marginTop: 4,
                              fontFamily: monoFont,
                              border: `1px solid ${colors.toolBorder}`,
                            }}
                          >{snippet}</pre>
                        )
                      }
                      return null
                    })()}

                    {/* Result accordion (shown both while running for agents, and after completion) */}
                    {isRunning && toolName === 'Agent' ? (
                      <ToolResultAccordion tool={tool} />
                    ) : isRunning ? (
                      <span className="text-[10px] mt-0.5 block" style={{ color: colors.textMuted }}>
                        running...
                      </span>
                    ) : (
                      <ToolResultAccordion tool={tool} />
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    )

    if (skipMotion) return inner

    return (
      <motion.div
        initial={{ opacity: 0, height: 0 }}
        animate={{ opacity: 1, height: 'auto' }}
        exit={{ opacity: 0, height: 0 }}
        transition={{ duration: 0.15 }}
      >
        {inner}
      </motion.div>
    )
  }

  // Collapsed state — summary text + chevron, no container
  const summary = toolSummary(tools)

  const inner = (
    <div
      className="flex items-start gap-1 cursor-pointer py-[2px]"
      onClick={() => setExpanded(true)}
    >
      <CaretRight size={10} className="flex-shrink-0 mt-[2px]" style={{ color: colors.textTertiary }} />
      <span className="text-[11px] leading-[1.4]" style={{ color: colors.textTertiary }}>
        {summary}
      </span>
    </div>
  )

  if (skipMotion) return <div className="py-0.5">{inner}</div>

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.12 }}
      className="py-0.5"
    >
      {inner}
    </motion.div>
  )
}

// ─── System Message ───

const CONTEXT_PREFIX = '__CONTEXT_DATA__'
const CONTEXT_LOADING = '__CONTEXT_LOADING__'
const COST_PREFIX = '__COST_DATA__'
const TODO_PREFIX = '__TODO_DATA__'

function SystemMessage({ message, skipMotion }: { message: Message; skipMotion?: boolean }) {
  const colors = useColors()

  // Todo card
  const isTodo = message.content.startsWith(TODO_PREFIX)
  if (isTodo) {
    try {
      const parsed = JSON.parse(message.content.slice(TODO_PREFIX.length))
      if (!Array.isArray(parsed)) throw new Error('invalid todo payload')
      const tasks = parsed as Array<{ id: string; subject: string; status: string; description?: string }>
      const inner = <TodoCard tasks={tasks} colors={colors} />
      if (skipMotion) return <div className="py-1">{inner}</div>
      return (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className="py-1">
          {inner}
        </motion.div>
      )
    } catch {}
  }

  // Cost card
  const isCost = message.content.startsWith(COST_PREFIX)
  if (isCost) {
    try {
      const data = JSON.parse(message.content.slice(COST_PREFIX.length))
      const inner = <CostCard data={data} colors={colors} />
      if (skipMotion) return <div className="py-1">{inner}</div>
      return (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className="py-1">
          {inner}
        </motion.div>
      )
    } catch {
      const fallback = (
        <div
          className="text-[11px] leading-[1.5] px-2.5 py-1 rounded-lg inline-block whitespace-pre-wrap"
          style={{ background: colors.surfaceHover, color: colors.textTertiary }}
        >
          Cost data unavailable
        </div>
      )
      if (skipMotion) return <div className="py-0.5">{fallback}</div>
      return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.15 }} className="py-0.5">
          {fallback}
        </motion.div>
      )
    }
  }

  // Loading state for /context
  if (message.content === CONTEXT_LOADING) {
    const inner = (
      <div
        className="text-[11px] leading-[1.5] px-2.5 py-1.5 rounded-lg inline-flex items-center gap-2"
        style={{ background: colors.surfaceHover, color: colors.textTertiary }}
      >
        <SpinnerGap size={11} className="animate-spin" />
        Fetching context from CLI...
      </div>
    )
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.15 }}
        className="py-0.5"
      >
        {inner}
      </motion.div>
    )
  }

  // Rich context card
  const isContext = message.content.startsWith(CONTEXT_PREFIX)
  if (isContext) {
    const jsonStr = message.content.slice(CONTEXT_PREFIX.length)
    try {
      const data = JSON.parse(jsonStr)
      const inner = <ContextCard data={data} colors={colors} />
      if (skipMotion) return <div className="py-1">{inner}</div>
      return (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className="py-1"
        >
          {inner}
        </motion.div>
      )
    } catch {
      // Fall through to normal system message
    }
  }

  const isError = message.content.startsWith('Error:') || message.content.includes('unexpectedly')

  const inner = (
    <div
      className="text-[11px] leading-[1.5] px-2.5 py-1 rounded-lg inline-block whitespace-pre-wrap"
      style={{
        background: isError ? colors.statusErrorBg : colors.surfaceHover,
        color: isError ? colors.statusError : colors.textTertiary,
      }}
    >
      {message.content}
    </div>
  )

  if (skipMotion) return <div className="py-0.5">{inner}</div>

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.15 }}
      className="py-0.5"
    >
      {inner}
    </motion.div>
  )
}

// ─── Todo Card ───

interface TodoTaskDisplay {
  id: string
  subject: string
  status: string
  description?: string
}

function TodoCard({ tasks, colors }: { tasks: TodoTaskDisplay[]; colors: ReturnType<typeof useColors> }) {
  const visible = tasks.filter((t) => t.status !== 'deleted')
  const completedCount = visible.filter((t) => t.status === 'completed').length

  return (
    <div
      className="rounded-lg overflow-hidden text-[12px] leading-[1.5]"
      style={{
        background: colors.surfacePrimary,
        border: `1px solid ${colors.toolBorder}`,
        maxWidth: '100%',
      }}
    >
      {/* Header */}
      <div
        className="px-3 py-1.5 flex items-center gap-1.5 text-[11px]"
        style={{ color: colors.textSecondary, borderBottom: `1px solid ${colors.toolBorder}` }}
      >
        <CheckSquare size={11} style={{ color: colors.accent }} />
        <span className="font-medium">Tasks</span>
        <span style={{ color: colors.textTertiary, marginLeft: 'auto' }}>
          {completedCount}/{visible.length}
        </span>
      </div>

      {/* Task list */}
      <div className="px-3 py-2 space-y-[6px]">
        {visible.length === 0 && (
          <span style={{ color: colors.textTertiary, fontSize: 11 }}>No tasks yet</span>
        )}
        {visible.map((task) => (
          <div key={task.id} className="flex items-start gap-2 min-w-0">
            <TodoStatusIcon status={task.status} colors={colors} />
            <span
              className="text-[12px] leading-[1.4] min-w-0 flex-1"
              style={{
                color: task.status === 'completed' ? colors.textTertiary : colors.textSecondary,
                textDecoration: task.status === 'completed' ? 'line-through' : 'none',
                opacity: task.status === 'completed' ? 0.7 : 1,
              }}
            >
              {task.subject}
            </span>
            {task.status === 'in_progress' && (
              <SpinnerGap size={10} className="animate-spin flex-shrink-0 mt-[2px]" style={{ color: colors.statusRunning }} />
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function TodoStatusIcon({ status, colors }: { status: string; colors: ReturnType<typeof useColors> }) {
  switch (status) {
    case 'completed':
      return <CheckCircle size={13} weight="fill" className="flex-shrink-0 mt-[2px]" style={{ color: colors.statusComplete }} />
    case 'in_progress':
      return <Circle size={13} weight="bold" className="flex-shrink-0 mt-[2px]" style={{ color: colors.statusRunning }} />
    case 'pending':
    default:
      return <Circle size={13} className="flex-shrink-0 mt-[2px]" style={{ color: colors.textMuted }} />
  }
}

// ─── Context Card (rich /context display) ───

interface ContextData {
  model: string | null
  maxTokens: number
  usagePercent: number
  totalUsed: number
  categories: Array<{ label: string; tokens: number; percent?: number }>
  memoryFiles: Array<{ path: string; tokens: number }>
  skills: Array<{ name: string; tokens: number }>
  isEstimated?: boolean
}

function formatTokens(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}

function formatTokensWhole(n: number): string {
  if (n >= 1000000) return `${Math.round(n / 1000000)}M`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}

// Each category gets a distinct color and Phosphor icon
const CATEGORY_STYLES: Record<string, { color: string; icon: React.ReactNode }> = {
  'System prompt':      { color: '#e06050', icon: <Cpu size={10} weight="fill" /> },
  'System tools':       { color: '#9ca3af', icon: <Wrench size={10} weight="fill" /> },
  'MCP tools':          { color: '#22d3ee', icon: <Plugs size={10} weight="fill" /> },
  'Custom agents':      { color: '#d97757', icon: <Robot size={10} weight="fill" /> },
  'Memory files':       { color: '#e06050', icon: <Brain size={10} weight="fill" /> },
  'Skills':             { color: '#eab308', icon: <Lightning size={10} weight="fill" /> },
  'Messages':           { color: '#a78bfa', icon: <ChatDots size={10} weight="fill" /> },
  'Free space':         { color: '#6b7280', icon: <CircleDashed size={10} /> },
  'Autocompact buffer': { color: '#9ca3af', icon: <Archive size={10} weight="fill" /> },
  'Compact buffer':     { color: '#9ca3af', icon: <Archive size={10} weight="fill" /> },
}

const PALETTE_FALLBACK = ['#e06050', '#e0a030', '#50b080', '#6090d0', '#d070b0', '#6b7280']

function getCategoryStyle(label: string, index: number): { color: string; icon: React.ReactNode } {
  const match = CATEGORY_STYLES[label]
  if (match) return match
  return { color: PALETTE_FALLBACK[index % PALETTE_FALLBACK.length], icon: <HardDrives size={10} /> }
}

/** Build a block-mosaic gauge like the CLI's /context.
 *  Each category gets proportional cells in its own color. */
const GAUGE_COLS = 20
const GAUGE_ROWS = 4
const TOTAL_CELLS = GAUGE_COLS * GAUGE_ROWS

function buildGaugeCells(categories: ContextData['categories'], maxTokens: number): Array<{ color: string; isFree: boolean }> {
  if (maxTokens <= 0 || categories.length === 0) {
    return Array.from({ length: TOTAL_CELLS }, () => ({ color: '#6b7280', isFree: true }))
  }

  // Largest-remainder allocation for stable rounding
  const allocs = new Array(categories.length).fill(0)
  const remainders = new Array(categories.length).fill(0)
  let totalAlloc = 0

  for (let i = 0; i < categories.length; i++) {
    const exact = (categories[i].tokens / maxTokens) * TOTAL_CELLS
    let base = Math.floor(exact)
    if (categories[i].tokens > 0 && base === 0) base = 1
    allocs[i] = base
    remainders[i] = exact - Math.floor(exact)
    totalAlloc += base
  }

  let remaining = TOTAL_CELLS - totalAlloc
  if (remaining > 0) {
    const order = Array.from({ length: categories.length }, (_, i) => i)
      .sort((a, b) => remainders[b] - remainders[a])
    for (let idx = 0; remaining > 0 && idx < order.length; idx++) {
      allocs[order[idx]]++
      remaining--
    }
  } else if (remaining < 0) {
    // Over-allocated (min-1 adjustments): remove from free space first, then smallest remainders
    const order = Array.from({ length: categories.length }, (_, i) => i)
      .sort((a, b) => {
        const af = categories[a].label === 'Free space' ? 1 : 0
        const bf = categories[b].label === 'Free space' ? 1 : 0
        return af !== bf ? bf - af : remainders[a] - remainders[b]
      })
    for (let idx = 0; remaining < 0 && idx < order.length; idx++) {
      if (allocs[order[idx]] > 0) { allocs[order[idx]]--; remaining++ }
    }
  }

  const cells: Array<{ color: string; isFree: boolean }> = []
  for (let i = 0; i < categories.length; i++) {
    const style = getCategoryStyle(categories[i].label, i)
    const isFree = categories[i].label === 'Free space'
    for (let j = 0; j < allocs[i]; j++) cells.push({ color: style.color, isFree })
  }

  // Guard: pad or trim to exactly TOTAL_CELLS
  while (cells.length < TOTAL_CELLS) cells.push({ color: '#6b7280', isFree: true })
  return cells.slice(0, TOTAL_CELLS)
}

function ContextCard({ data, colors }: { data: ContextData; colors: ReturnType<typeof useColors> }) {
  const gaugeCells = buildGaugeCells(data.categories, data.maxTokens)

  return (
    <div
      className="rounded-lg overflow-hidden text-[11px] leading-[1.5] font-mono"
      style={{
        background: colors.surfacePrimary,
        border: `1px solid ${colors.toolBorder}`,
        maxWidth: '100%',
      }}
    >
      {/* Header */}
      <div
        className="px-3 py-1.5 font-medium text-[11px] flex items-center gap-1.5"
        style={{ color: colors.textSecondary, borderBottom: `1px solid ${colors.toolBorder}` }}
      >
        <span style={{ color: colors.textTertiary }}>{'\u2514'}</span>
        Context Usage
      </div>

      <div className="px-3 pt-2.5 pb-2">
        {/* Gauge + model info side by side */}
        <div className="flex gap-3 items-start">
          {/* Block mosaic gauge */}
          <div
            className="flex-shrink-0"
            style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${GAUGE_COLS}, 1fr)`,
              gap: '1.5px',
              width: GAUGE_COLS * 7,
            }}
          >
            {gaugeCells.map((cell, i) => (
              <div
                key={i}
                style={{
                  width: 5.5,
                  height: 5.5,
                  borderRadius: 1,
                  background: cell.color,
                  opacity: cell.isFree ? 0.2 : 0.85,
                }}
              />
            ))}
          </div>

          {/* Model & token summary */}
          <div className="min-w-0 flex-1 pt-[1px]">
            <div style={{ color: colors.textSecondary }}>
              {data.model || 'unknown'}
              <span style={{ color: colors.textTertiary }}>
                {' \u00B7 '}{formatTokens(data.totalUsed)}/{formatTokensWhole(data.maxTokens)} tokens
              </span>
            </div>
            <div style={{ color: colors.textTertiary }}>
              ({data.usagePercent}%)
            </div>
          </div>
        </div>

        {/* Category breakdown */}
        <div className="mt-2.5 pl-0.5" style={{ color: colors.textTertiary }}>
          <div className="text-[10px] mb-1" style={{ color: colors.textSecondary, fontStyle: 'italic' }}>
            Estimated usage by category
          </div>
          {data.categories.map((cat, idx) => {
            const style = getCategoryStyle(cat.label, idx)
            const pct = cat.percent != null
              ? cat.percent
              : (data.maxTokens > 0 ? (cat.tokens / data.maxTokens) * 100 : 0)
            const pctStr = pct < 0.05 && pct > 0 ? '0.0' : pct.toFixed(1)

            return (
              <div key={idx} className="flex items-center gap-1.5">
                <span className="flex items-center justify-center flex-shrink-0" style={{ color: style.color, width: 12, height: 12 }}>
                  {style.icon}
                </span>
                <span style={{ fontWeight: 500, color: colors.textSecondary }}>{cat.label}:</span>
                <span>{formatTokens(cat.tokens)} tokens</span>
                <span style={{ color: colors.textMuted }}>({pctStr}%)</span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Memory files section */}
      {data.memoryFiles.length > 0 && (
        <div
          className="px-3 py-2"
          style={{ borderTop: `1px solid ${colors.toolBorder}` }}
        >
          <div className="mb-0.5" style={{ color: colors.textSecondary }}>
            Memory files <span style={{ color: colors.textTertiary }}>{'\u00B7'} /memory</span>
          </div>
          <div style={{ color: colors.textTertiary }}>
            {data.memoryFiles.map((mf, i) => (
              <div key={i} className="flex items-baseline gap-1 min-w-0">
                <span style={{ color: colors.textMuted }}>{i === data.memoryFiles.length - 1 ? '\u2514' : '\u251C'}</span>
                <span className="truncate">{mf.path}:</span>
                <span className="flex-shrink-0">{mf.tokens} tokens</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Skills section */}
      {data.skills.length > 0 && (
        <div
          className="px-3 py-2"
          style={{ borderTop: `1px solid ${colors.toolBorder}` }}
        >
          <div className="mb-0.5" style={{ color: colors.textSecondary }}>
            Skills <span style={{ color: colors.textTertiary }}>{'\u00B7'} /skills</span>
          </div>
          <div style={{ color: colors.textTertiary }}>
            {data.skills.map((skill, i) => (
              <div key={skill.name} className="flex items-baseline gap-1">
                <span style={{ color: colors.textMuted }}>{i === data.skills.length - 1 ? '\u2514' : '\u251C'}</span>
                <span>{skill.name}:</span>
                <span>{skill.tokens} tokens</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Estimated data note */}
      {data.isEstimated && (
        <div
          className="px-3 py-1.5 text-[10px] leading-[1.4] italic"
          style={{ borderTop: `1px solid ${colors.toolBorder}`, color: colors.textTertiary }}
        >
          Approximate values. Send a message to get exact token counts from the API.
        </div>
      )}
    </div>
  )
}

// ─── Cost Card ───

interface CostData {
  cost: number
  durationMs: number
  turns: number
  inputTokens: number
  outputTokens: number
  cacheRead: number
  cacheCreate: number
  model: string | null
}

function CostCard({ data, colors }: { data: CostData; colors: ReturnType<typeof useColors> }) {
  const totalTokens = data.inputTokens + data.outputTokens + data.cacheRead + data.cacheCreate
  const durationSec = (data.durationMs / 1000).toFixed(1)
  const costStr = data.cost < 0.01 ? `$${data.cost.toFixed(4)}` : `$${data.cost.toFixed(2)}`

  return (
    <div
      className="rounded-lg overflow-hidden text-[11px] leading-[1.5] font-mono"
      style={{
        background: colors.surfacePrimary,
        border: `1px solid ${colors.toolBorder}`,
        maxWidth: '100%',
      }}
    >
      {/* Header */}
      <div
        className="px-3 py-1.5 font-medium text-[11px] flex items-center gap-1.5"
        style={{ color: colors.textSecondary, borderBottom: `1px solid ${colors.toolBorder}` }}
      >
        <CurrencyDollar size={11} style={{ color: colors.accent }} />
        Cost Summary
      </div>

      <div className="px-3 py-2">
        {/* Big cost number */}
        <div className="flex items-baseline gap-2 mb-2">
          <span className="text-[18px] font-semibold" style={{ color: colors.textPrimary }}>
            {costStr}
          </span>
          {data.model && (
            <span className="text-[10px]" style={{ color: colors.textTertiary }}>
              {data.model}
            </span>
          )}
        </div>

        {/* Stats row */}
        <div className="flex gap-4" style={{ color: colors.textTertiary }}>
          <div className="flex items-center gap-1">
            <Clock size={10} style={{ color: colors.accent }} />
            <span>{durationSec}s</span>
          </div>
          <div className="flex items-center gap-1">
            <ArrowsClockwise size={10} style={{ color: '#a78bfa' }} />
            <span>{data.turns} turn{data.turns !== 1 ? 's' : ''}</span>
          </div>
          <div className="flex items-center gap-1">
            <CoinVertical size={10} style={{ color: '#eab308' }} />
            <span>{formatTokens(totalTokens)} tokens</span>
          </div>
        </div>
      </div>

      {/* Token breakdown */}
      {totalTokens > 0 && (
        <div
          className="px-3 py-2 space-y-[2px]"
          style={{ borderTop: `1px solid ${colors.toolBorder}`, color: colors.textTertiary }}
        >
          {data.inputTokens > 0 && (
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <span className="flex items-center" style={{ color: '#22d3ee', width: 12 }}><CaretRight size={8} /></span>
                Input
              </span>
              <span>{data.inputTokens.toLocaleString()}</span>
            </div>
          )}
          {data.outputTokens > 0 && (
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <span className="flex items-center" style={{ color: '#a78bfa', width: 12 }}><CaretRight size={8} /></span>
                Output
              </span>
              <span>{data.outputTokens.toLocaleString()}</span>
            </div>
          )}
          {data.cacheRead > 0 && (
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <span className="flex items-center" style={{ color: '#9ca3af', width: 12 }}><CaretRight size={8} /></span>
                Cache read
              </span>
              <span>{data.cacheRead.toLocaleString()}</span>
            </div>
          )}
          {data.cacheCreate > 0 && (
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <span className="flex items-center" style={{ color: '#eab308', width: 12 }}><CaretRight size={8} /></span>
                Cache write
              </span>
              <span>{data.cacheCreate.toLocaleString()}</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Tool Icon mapping ───

function ToolIcon({ name, size = 12 }: { name: string; size?: number }) {
  const colors = useColors()
  const ICONS: Record<string, React.ReactNode> = {
    Read: <FileText size={size} />,
    Edit: <PencilSimple size={size} />,
    Write: <FileArrowUp size={size} />,
    Bash: <Terminal size={size} />,
    Glob: <FolderOpen size={size} />,
    Grep: <MagnifyingGlass size={size} />,
    WebSearch: <Globe size={size} />,
    WebFetch: <Globe size={size} />,
    Agent: <Robot size={size} />,
    AskUserQuestion: <Question size={size} />,
    TodoWrite: <CheckSquare size={size} />,
    TodoRead: <CheckSquare size={size} />,
  }

  return (
    <span className="flex items-center" style={{ color: colors.textTertiary }}>
      {ICONS[name] || <Wrench size={size} />}
    </span>
  )
}
