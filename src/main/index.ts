import { app, BrowserWindow, ipcMain, dialog, screen, globalShortcut, Tray, Menu, nativeImage, nativeTheme, shell, systemPreferences } from 'electron'
import { join } from 'path'
import { existsSync, readdirSync, statSync, createReadStream } from 'fs'
import { createInterface } from 'readline'
import { homedir } from 'os'
import { ControlPlane } from './claude/control-plane'
import { ensureSkills, type SkillStatus } from './skills/installer'
import { fetchCatalog, listInstalled, installPlugin, uninstallPlugin } from './marketplace/catalog'
import { log as _log, LOG_FILE, flushLogs } from './logger'
import { getCliEnv } from './cli-env'
import { autoUpdater } from 'electron-updater'
import { IPC } from '../shared/types'
import type { RunOptions, NormalizedEvent, EnrichedError } from '../shared/types'

const DEBUG_MODE = process.env.CLUI_DEBUG === '1'
const SPACES_DEBUG = DEBUG_MODE || process.env.CLUI_SPACES_DEBUG === '1'

function log(msg: string): void {
  _log('main', msg)
}

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let screenshotCounter = 0
let toggleSequence = 0
let forceQuit = false

// Feature flag: enable PTY interactive permissions transport
const INTERACTIVE_PTY = process.env.CLUI_INTERACTIVE_PERMISSIONS_PTY === '1'

const controlPlane = new ControlPlane(INTERACTIVE_PTY)

// Keep native width fixed to avoid renderer animation vs setBounds race.
// The UI itself still launches in compact mode; extra width is transparent/click-through.
const BAR_WIDTH = 1040
const PILL_HEIGHT = 720  // Fixed native window height — extra room for expanded UI + shadow buffers
const PILL_BOTTOM_MARGIN = 24

// ─── Broadcast to renderer ───

function broadcast(channel: string, ...args: unknown[]): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, ...args)
  }
}

function snapshotWindowState(reason: string): void {
  if (!SPACES_DEBUG) return
  if (!mainWindow || mainWindow.isDestroyed()) {
    log(`[spaces] ${reason} window=none`)
    return
  }

  const b = mainWindow.getBounds()
  const cursor = screen.getCursorScreenPoint()
  const display = screen.getDisplayNearestPoint(cursor)
  const visibleOnAll = mainWindow.isVisibleOnAllWorkspaces()
  const wcFocused = mainWindow.webContents.isFocused()

  log(
    `[spaces] ${reason} ` +
    `vis=${mainWindow.isVisible()} focused=${mainWindow.isFocused()} wcFocused=${wcFocused} ` +
    `alwaysOnTop=${mainWindow.isAlwaysOnTop()} allWs=${visibleOnAll} ` +
    `bounds=(${b.x},${b.y},${b.width}x${b.height}) ` +
    `cursor=(${cursor.x},${cursor.y}) display=${display.id} ` +
    `workArea=(${display.workArea.x},${display.workArea.y},${display.workArea.width}x${display.workArea.height})`
  )
}

function scheduleToggleSnapshots(toggleId: number, phase: 'show' | 'hide'): void {
  if (!SPACES_DEBUG) return
  const probes = [0, 100, 400, 1200]
  for (const delay of probes) {
    setTimeout(() => {
      snapshotWindowState(`toggle#${toggleId} ${phase} +${delay}ms`)
    }, delay)
  }
}


// ─── Wire ControlPlane events → renderer ───

controlPlane.on('event', (tabId: string, event: NormalizedEvent) => {
  broadcast('clui:normalized-event', tabId, event)
})

controlPlane.on('tab-status-change', (tabId: string, newStatus: string, oldStatus: string) => {
  broadcast('clui:tab-status-change', tabId, newStatus, oldStatus)
})

controlPlane.on('error', (tabId: string, error: EnrichedError) => {
  broadcast('clui:enriched-error', tabId, error)
})

// ─── Window Creation ───

function createWindow(): void {
  const cursor = screen.getCursorScreenPoint()
  const display = screen.getDisplayNearestPoint(cursor)
  const { width: screenWidth, height: screenHeight } = display.workAreaSize
  const { x: dx, y: dy } = display.workArea

  const x = dx + Math.round((screenWidth - BAR_WIDTH) / 2)
  const y = dy + screenHeight - PILL_HEIGHT - PILL_BOTTOM_MARGIN

  mainWindow = new BrowserWindow({
    width: BAR_WIDTH,
    height: PILL_HEIGHT,
    x,
    y,
    ...(process.platform === 'darwin' ? { type: 'panel' as const } : {}),  // NSPanel — non-activating, joins all spaces
    frame: false,
    transparent: true,
    resizable: false,
    movable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    roundedCorners: true,
    backgroundColor: '#00000000',
    show: false,
    icon: join(__dirname, '../../resources/icon.icns'),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  // Belt-and-suspenders: panel already joins all spaces and floats,
  // but explicit flags ensure correct behavior on older Electron builds.
  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  mainWindow.setAlwaysOnTop(true, 'screen-saver')

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
    // Enable OS-level click-through for transparent regions.
    // { forward: true } ensures mousemove events still reach the renderer
    // so it can toggle click-through off when cursor enters interactive UI.
    mainWindow?.setIgnoreMouseEvents(true, { forward: true })
    if (process.env.ELECTRON_RENDERER_URL) {
      mainWindow?.webContents.openDevTools({ mode: 'detach' })
    }
  })

  app.on('before-quit', () => { forceQuit = true })
  mainWindow.on('close', (e) => {
    if (!forceQuit) {
      e.preventDefault()
      mainWindow?.hide()
    }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function showWindow(source = 'unknown'): void {
  if (!mainWindow) return
  const toggleId = ++toggleSequence

  // Position on the display where the cursor currently is (not always primary)
  const cursor = screen.getCursorScreenPoint()
  const display = screen.getDisplayNearestPoint(cursor)
  const { width: sw, height: sh } = display.workAreaSize
  const { x: dx, y: dy } = display.workArea
  mainWindow.setBounds({
    x: dx + Math.round((sw - BAR_WIDTH) / 2),
    y: dy + sh - PILL_HEIGHT - PILL_BOTTOM_MARGIN,
    width: BAR_WIDTH,
    height: PILL_HEIGHT,
  })

  // Always re-assert space membership — the flag can be lost after hide/show cycles
  // and must be set before show() so the window joins the active Space, not its
  // last-known Space.
  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })

  if (SPACES_DEBUG) {
    log(`[spaces] showWindow#${toggleId} source=${source} move-to-display id=${display.id}`)
    snapshotWindowState(`showWindow#${toggleId} pre-show`)
  }
  // As an accessory app (app.dock.hide), show() + focus gives keyboard
  // without deactivating the active app — hover preserved everywhere.
  mainWindow.show()
  mainWindow.webContents.focus()
  broadcast(IPC.WINDOW_SHOWN)
  if (SPACES_DEBUG) scheduleToggleSnapshots(toggleId, 'show')
}

function toggleWindow(source = 'unknown'): void {
  if (!mainWindow) return
  const toggleId = ++toggleSequence
  if (SPACES_DEBUG) {
    log(`[spaces] toggle#${toggleId} source=${source} start`)
    snapshotWindowState(`toggle#${toggleId} pre`)
  }

  if (mainWindow.isVisible()) {
    mainWindow.hide()
    if (SPACES_DEBUG) scheduleToggleSnapshots(toggleId, 'hide')
  } else {
    showWindow(source)
  }
}

// ─── Resize ───
// Fixed-height mode: ignore renderer resize events to prevent jank.
// The native window stays at PILL_HEIGHT; all expand/collapse happens inside the renderer.

ipcMain.on(IPC.RESIZE_HEIGHT, () => {
  // No-op — fixed height window, no dynamic resize
})

ipcMain.on(IPC.SET_WINDOW_WIDTH, () => {
  // No-op — native width is fixed to keep expand/collapse animation smooth.
})

ipcMain.handle(IPC.ANIMATE_HEIGHT, () => {
  // No-op — kept for API compat, animation handled purely in renderer
})

ipcMain.on(IPC.HIDE_WINDOW, () => {
  mainWindow?.hide()
})

ipcMain.handle(IPC.IS_VISIBLE, () => {
  return mainWindow?.isVisible() ?? false
})

// OS-level click-through toggle — renderer calls this on mousemove
// to enable clicks on interactive UI while passing through transparent areas
ipcMain.on(IPC.SET_IGNORE_MOUSE_EVENTS, (event, ignore: boolean, options?: { forward?: boolean }) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (win && !win.isDestroyed()) {
    win.setIgnoreMouseEvents(ignore, options || {})
  }
})

// ─── IPC Handlers (typed, strict) ───

ipcMain.handle(IPC.START, async () => {
  log('IPC START — fetching static CLI info')
  const { execSync } = require('child_process')

  let version = 'unknown'
  try {
    version = execSync('claude -v', { encoding: 'utf-8', timeout: 5000, env: getCliEnv() }).trim()
  } catch {}

  let auth: { email?: string; subscriptionType?: string; authMethod?: string } = {}
  try {
    const raw = execSync('claude auth status', { encoding: 'utf-8', timeout: 5000, env: getCliEnv() }).trim()
    auth = JSON.parse(raw)
  } catch {}

  let mcpServers: string[] = []
  try {
    const raw = execSync('claude mcp list', { encoding: 'utf-8', timeout: 5000, env: getCliEnv() }).trim()
    if (raw) mcpServers = raw.split('\n').filter(Boolean)
  } catch {}

  return { version, auth, mcpServers, projectPath: process.cwd(), homePath: require('os').homedir() }
})

ipcMain.handle(IPC.CREATE_TAB, () => {
  const tabId = controlPlane.createTab()
  log(`IPC CREATE_TAB → ${tabId}`)
  return { tabId }
})

ipcMain.on(IPC.INIT_SESSION, (_event, tabId: string) => {
  log(`IPC INIT_SESSION: ${tabId}`)
  controlPlane.initSession(tabId)
})

ipcMain.on(IPC.RESET_TAB_SESSION, (_event, tabId: string) => {
  log(`IPC RESET_TAB_SESSION: ${tabId}`)
  controlPlane.resetTabSession(tabId)
})

ipcMain.handle(IPC.PROMPT, async (_event, { tabId, requestId, options }: { tabId: string; requestId: string; options: RunOptions }) => {
  if (DEBUG_MODE) {
    log(`IPC PROMPT: tab=${tabId} req=${requestId} prompt="${options.prompt.substring(0, 100)}"`)
  } else {
    log(`IPC PROMPT: tab=${tabId} req=${requestId}`)
  }

  if (!tabId) {
    throw new Error('No tabId provided — prompt rejected')
  }
  if (!requestId) {
    throw new Error('No requestId provided — prompt rejected')
  }

  try {
    await controlPlane.submitPrompt(tabId, requestId, options)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    log(`PROMPT error: ${msg}`)
    throw err
  }
})

ipcMain.handle(IPC.CANCEL, (_event, requestId: string) => {
  log(`IPC CANCEL: ${requestId}`)
  return controlPlane.cancel(requestId)
})

ipcMain.handle(IPC.STOP_TAB, (_event, tabId: string) => {
  log(`IPC STOP_TAB: ${tabId}`)
  return controlPlane.cancelTab(tabId)
})

ipcMain.handle(IPC.RETRY, async (_event, { tabId, requestId, options }: { tabId: string; requestId: string; options: RunOptions }) => {
  log(`IPC RETRY: tab=${tabId} req=${requestId}`)
  return controlPlane.retry(tabId, requestId, options)
})

ipcMain.handle(IPC.STATUS, () => {
  return controlPlane.getHealth()
})

ipcMain.handle(IPC.TAB_HEALTH, () => {
  return controlPlane.getHealth()
})

ipcMain.handle(IPC.CLOSE_TAB, (_event, tabId: string) => {
  log(`IPC CLOSE_TAB: ${tabId}`)
  controlPlane.closeTab(tabId)
})

ipcMain.on(IPC.SET_PERMISSION_MODE, (_event, mode: string) => {
  if (mode !== 'ask' && mode !== 'auto') {
    log(`IPC SET_PERMISSION_MODE: invalid mode "${mode}" — ignoring`)
    return
  }
  log(`IPC SET_PERMISSION_MODE: ${mode}`)
  controlPlane.setPermissionMode(mode)
})

ipcMain.handle(IPC.RESPOND_PERMISSION, (_event, { tabId, questionId, optionId }: { tabId: string; questionId: string; optionId: string }) => {
  log(`IPC RESPOND_PERMISSION: tab=${tabId} question=${questionId} option=${optionId}`)
  return controlPlane.respondToPermission(tabId, questionId, optionId)
})

/** Encode a project path to match Claude Code CLI's session directory naming.
 *  If the value is already an encoded dir name (starts with '-'), use it as-is. */
function encodeProjectPath(pathOrEncoded: string): string {
  // Already encoded (from LIST_ALL_SESSIONS results)
  if (pathOrEncoded.startsWith('-') && !pathOrEncoded.includes('/')) return pathOrEncoded
  return pathOrEncoded.replace(/[/_]/g, '-')
}

ipcMain.handle(IPC.LIST_SESSIONS, async (_e, projectPath?: string) => {
  log(`IPC LIST_SESSIONS ${projectPath ? `(path=${projectPath})` : ''}`)
  try {
    const cwd = projectPath || process.cwd()
    // Claude stores project sessions at ~/.claude/projects/<encoded-path>/
    // Path encoding: replace '/' and '_' with '-' (matching Claude Code CLI behavior)
    const encodedPath = encodeProjectPath(cwd)
    const sessionsDir = join(homedir(), '.claude', 'projects', encodedPath)
    if (!existsSync(sessionsDir)) {
      log(`LIST_SESSIONS: directory not found: ${sessionsDir}`)
      return []
    }
    const files = readdirSync(sessionsDir).filter((f: string) => f.endsWith('.jsonl'))

    const sessions: Array<{ sessionId: string; slug: string | null; firstMessage: string | null; lastTimestamp: string; size: number; projectPath: string }> = []

    // UUID v4 regex — only consider files named as valid UUIDs
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

    for (const file of files) {
      // The filename (without .jsonl) IS the canonical resume ID for `claude --resume`
      const fileSessionId = file.replace(/\.jsonl$/, '')
      if (!UUID_RE.test(fileSessionId)) continue // skip non-UUID files

      const filePath = join(sessionsDir, file)
      const stat = statSync(filePath)
      if (stat.size < 100) continue // skip trivially small files

      // Read lines to extract metadata and validate transcript schema
      const meta: { validated: boolean; slug: string | null; firstMessage: string | null; lastTimestamp: string | null } = {
        validated: false, slug: null, firstMessage: null, lastTimestamp: null,
      }

      await new Promise<void>((resolve) => {
        const rl = createInterface({ input: createReadStream(filePath) })
        rl.on('line', (line: string) => {
          try {
            const obj = JSON.parse(line)
            // Validate: must have expected Claude transcript fields
            if (!meta.validated && obj.type && obj.uuid && obj.timestamp) {
              meta.validated = true
            }
            if (obj.slug && !meta.slug) meta.slug = obj.slug
            if (obj.timestamp) meta.lastTimestamp = obj.timestamp
            if (obj.type === 'user' && !meta.firstMessage) {
              const content = obj.message?.content
              if (typeof content === 'string') {
                meta.firstMessage = content.substring(0, 100)
              } else if (Array.isArray(content)) {
                const textPart = content.find((p: any) => p.type === 'text')
                meta.firstMessage = textPart?.text?.substring(0, 100) || null
              }
            }
          } catch {}
          // Read all lines to get the last timestamp
        })
        rl.on('close', () => resolve())
      })

      if (meta.validated) {
        sessions.push({
          sessionId: fileSessionId,
          slug: meta.slug,
          firstMessage: meta.firstMessage,
          lastTimestamp: meta.lastTimestamp || stat.mtime.toISOString(),
          size: stat.size,
          projectPath: cwd,
        })
      }
    }

    // Sort by last timestamp, most recent first
    sessions.sort((a, b) => new Date(b.lastTimestamp).getTime() - new Date(a.lastTimestamp).getTime())
    return sessions.slice(0, 20) // Return top 20
  } catch (err) {
    log(`LIST_SESSIONS error: ${err}`)
    return []
  }
})

// List sessions across ALL project directories
ipcMain.handle(IPC.LIST_ALL_SESSIONS, async () => {
  log('IPC LIST_ALL_SESSIONS')
  try {
    const projectsRoot = join(homedir(), '.claude', 'projects')
    if (!existsSync(projectsRoot)) return []

    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    const allSessions: Array<{ sessionId: string; slug: string | null; firstMessage: string | null; lastTimestamp: string; size: number; projectPath: string }> = []

    const projectDirs = readdirSync(projectsRoot).filter((d: string) => {
      try { return statSync(join(projectsRoot, d)).isDirectory() } catch { return false }
    })

    for (const dir of projectDirs) {
      const sessionsDir = join(projectsRoot, dir)
      // The encoded dir name is the canonical project identifier.
      // We store it as-is since decoding is lossy ('/' and '_' both encode to '-').
      const encodedDir = dir

      let files: string[]
      try { files = readdirSync(sessionsDir).filter((f: string) => f.endsWith('.jsonl')) } catch { continue }

      for (const file of files) {
        const fileSessionId = file.replace(/\.jsonl$/, '')
        if (!UUID_RE.test(fileSessionId)) continue

        const filePath = join(sessionsDir, file)
        let stat: ReturnType<typeof statSync>
        try { stat = statSync(filePath) } catch { continue }
        if (stat.size < 100) continue

        const meta: { validated: boolean; slug: string | null; firstMessage: string | null; lastTimestamp: string | null } = {
          validated: false, slug: null, firstMessage: null, lastTimestamp: null,
        }

        await new Promise<void>((resolve) => {
          const rl = createInterface({ input: createReadStream(filePath) })
          rl.on('line', (line: string) => {
            try {
              const obj = JSON.parse(line)
              if (!meta.validated && obj.type && obj.uuid && obj.timestamp) {
                meta.validated = true
              }
              if (obj.slug && !meta.slug) meta.slug = obj.slug
              if (obj.timestamp) meta.lastTimestamp = obj.timestamp
              if (obj.type === 'user' && !meta.firstMessage) {
                const content = obj.message?.content
                if (typeof content === 'string') {
                  meta.firstMessage = content.substring(0, 100)
                } else if (Array.isArray(content)) {
                  const textPart = content.find((p: any) => p.type === 'text')
                  meta.firstMessage = textPart?.text?.substring(0, 100) || null
                }
              }
            } catch {}
          })
          rl.on('close', () => resolve())
        })

        if (meta.validated) {
          allSessions.push({
            sessionId: fileSessionId,
            slug: meta.slug,
            firstMessage: meta.firstMessage,
            lastTimestamp: meta.lastTimestamp || stat.mtime.toISOString(),
            size: stat.size,
            projectPath: encodedDir,
          })
        }
      }
    }

    allSessions.sort((a, b) => new Date(b.lastTimestamp).getTime() - new Date(a.lastTimestamp).getTime())
    return allSessions.slice(0, 30)
  } catch (err) {
    log(`LIST_ALL_SESSIONS error: ${err}`)
    return []
  }
})

// Load conversation history from a session's JSONL file
ipcMain.handle(IPC.LOAD_SESSION, async (_e, arg: { sessionId: string; projectPath?: string } | string) => {
  const sessionId = typeof arg === 'string' ? arg : arg.sessionId
  const projectPath = typeof arg === 'string' ? undefined : arg.projectPath
  log(`IPC LOAD_SESSION ${sessionId}${projectPath ? ` (path=${projectPath})` : ''}`)
  try {
    const cwd = projectPath || process.cwd()
    const encodedPath = encodeProjectPath(cwd)
    const filePath = join(homedir(), '.claude', 'projects', encodedPath, `${sessionId}.jsonl`)
    if (!existsSync(filePath)) return []

    const messages: Array<{ role: string; content: string; toolName?: string; toolId?: string; timestamp: number }> = []
    await new Promise<void>((resolve) => {
      const rl = createInterface({ input: createReadStream(filePath) })
      rl.on('line', (line: string) => {
        try {
          const obj = JSON.parse(line)
          if (obj.type === 'user') {
            const content = obj.message?.content
            let text = ''
            if (typeof content === 'string') {
              text = content
            } else if (Array.isArray(content)) {
              text = content
                .filter((b: any) => b.type === 'text')
                .map((b: any) => b.text)
                .join('\n')
            }
            if (text) {
              messages.push({ role: 'user', content: text, timestamp: new Date(obj.timestamp).getTime() })
            }
          } else if (obj.type === 'assistant') {
            const content = obj.message?.content
            if (Array.isArray(content)) {
              for (const block of content) {
                if (block.type === 'text' && block.text) {
                  messages.push({ role: 'assistant', content: block.text, timestamp: new Date(obj.timestamp).getTime() })
                } else if (block.type === 'tool_use' && block.name) {
                  messages.push({
                    role: 'tool',
                    content: '',
                    toolName: block.name,
                    toolId: block.id || undefined,
                    timestamp: new Date(obj.timestamp).getTime(),
                  })
                }
              }
            }
          }
        } catch {}
      })
      rl.on('close', () => resolve())
    })
    return messages
  } catch (err) {
    log(`LOAD_SESSION error: ${err}`)
    return []
  }
})

// Extract tool results from a session JSONL file
// Returns a map of toolUseId → result text
// Sources: tool_result blocks in user messages + progress events for subagent activity
ipcMain.handle(IPC.GET_TOOL_RESULTS, async (_e, arg: { sessionId: string; projectPath: string }) => {
  const { sessionId, projectPath } = arg
  log(`IPC GET_TOOL_RESULTS ${sessionId}`)
  try {
    const encodedPath = encodeProjectPath(projectPath)
    const filePath = join(homedir(), '.claude', 'projects', encodedPath, `${sessionId}.jsonl`)
    if (!existsSync(filePath)) return {}

    const results: Record<string, string> = {}
    // Track progress events per parentToolUseID (subagent activity)
    const progressByTool: Record<string, string[]> = {}

    await new Promise<void>((resolve) => {
      const rl = createInterface({ input: createReadStream(filePath) })
      rl.on('line', (line: string) => {
        try {
          const obj = JSON.parse(line)

          // Extract tool_result from user messages
          if (obj.type === 'user') {
            const content = obj.message?.content
            if (Array.isArray(content)) {
              for (const block of content) {
                if (block.type === 'tool_result' && block.tool_use_id) {
                  const c = block.content
                  if (typeof c === 'string') {
                    results[block.tool_use_id] = c
                  } else if (Array.isArray(c)) {
                    const text = c
                      .filter((b: any) => b.type === 'text')
                      .map((b: any) => b.text)
                      .join('\n')
                    if (text) results[block.tool_use_id] = text
                  }
                }
              }
            }
          }

          // Extract progress events (subagent activity)
          if (obj.type === 'progress' && obj.parentToolUseID) {
            const ptid = obj.parentToolUseID
            const msg = obj.data?.message
            const content = msg?.message?.content
            if (Array.isArray(content)) {
              for (const block of content) {
                if (block.type === 'text' && block.text) {
                  if (!progressByTool[ptid]) progressByTool[ptid] = []
                  progressByTool[ptid].push(block.text)
                } else if (block.type === 'tool_use' && block.name) {
                  if (!progressByTool[ptid]) progressByTool[ptid] = []
                  const input = block.input || {}
                  let detail = ''
                  if (['Read', 'Edit', 'Write'].includes(block.name)) {
                    detail = `: ${input.file_path || input.path || ''}`
                  } else if (block.name === 'Bash') {
                    detail = `: ${(input.command || '').toString().substring(0, 60)}`
                  } else if (['Grep', 'Glob'].includes(block.name)) {
                    detail = `: ${input.pattern || ''}`
                  }
                  progressByTool[ptid].push(`[${block.name}${detail}]`)
                }
              }
            }
          }
        } catch {}
      })
      rl.on('close', () => resolve())
    })

    // For tool IDs without a tool_result but with progress data, use progress as fallback
    for (const [toolId, parts] of Object.entries(progressByTool)) {
      if (!results[toolId]) {
        results[toolId] = parts.join('\n')
      }
    }

    return results
  } catch (err) {
    log(`GET_TOOL_RESULTS error: ${err}`)
    return {}
  }
})

// ─── Get context window usage by reading real session data from disk ───
// Replicates the CLI's E01() calculator: reads the session JSONL for init/result
// events, reads memory/CLAUDE.md files from disk, estimates tokens via charLength/4
// (same fallback the CLI uses when the countTokens API is unavailable).

ipcMain.handle(IPC.GET_CONTEXT, async (_e, arg: { sessionId: string; projectPath: string; sessionData?: any }) => {
  const { sessionId, projectPath, sessionData } = arg
  log(`IPC GET_CONTEXT session=${sessionId} path=${projectPath}`)

  // Fix #1: Validate sessionId is a UUID to prevent path traversal
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (!UUID_RE.test(sessionId)) {
    log(`GET_CONTEXT: invalid sessionId rejected: ${sessionId}`)
    return null
  }

  try {
    const { readFileSync } = require('fs')
    const cwd = projectPath === '~' ? homedir() : projectPath
    const encodedPath = encodeProjectPath(cwd)
    const projectDir = join(homedir(), '.claude', 'projects', encodedPath)

    // ── 1. Session metadata: prefer in-memory data, fall back to JSONL ──
    let model: string | null = sessionData?.model || null
    let tools: string[] = sessionData?.tools || []
    let skills: string[] = sessionData?.skills || []
    let mcpServers: Array<{ name: string; status: string }> = sessionData?.mcpServers || []
    const version: string | null = sessionData?.version || null
    const usage = sessionData?.usage || {}

    let lastInputTokens = usage.input_tokens || 0
    let lastOutputTokens = usage.output_tokens || 0
    let cacheRead = usage.cache_read_input_tokens || 0
    let cacheCreate = usage.cache_creation_input_tokens || 0

    let messageChars = sessionData?.messageChars || 0

    // If we don't have API usage data (e.g. resumed CLI session without a new message),
    // read the session JSONL to estimate message sizes from actual content
    const hasApiUsage = cacheCreate > 0 || cacheRead > 0 || lastInputTokens > 0
    if (!hasApiUsage) {
      const jsonlPath = join(projectDir, `${sessionId}.jsonl`)
      if (existsSync(jsonlPath)) {
        log('GET_CONTEXT: no API usage, falling back to JSONL message content')
        await new Promise<void>((resolve) => {
          const rl = createInterface({ input: createReadStream(jsonlPath) })
          rl.on('line', (line: string) => {
            try {
              const obj = JSON.parse(line)
              // Count message content chars
              if (obj.type === 'user' || obj.type === 'assistant') {
                const content = obj.message?.content
                if (typeof content === 'string') {
                  messageChars += content.length
                } else if (Array.isArray(content)) {
                  for (const block of content) {
                    if (block.type === 'text' && block.text) messageChars += block.text.length
                    if (block.type === 'tool_use' && block.input) messageChars += JSON.stringify(block.input).length
                    if (block.type === 'tool_result') {
                      const c = block.content
                      if (typeof c === 'string') messageChars += c.length
                      else if (Array.isArray(c)) {
                        for (const b of c) { if (b.type === 'text' && b.text) messageChars += b.text.length }
                      }
                    }
                  }
                }
              }
            } catch {}
          })
          rl.on('close', () => resolve())
        })
      }
    }

    // Separate MCP tools from built-in tools
    const mcpServerCount = mcpServers.filter((s: any) => s.status === 'connected').length
    const totalToolCount = tools.length
    const mcpToolCount = mcpServerCount > 0 ? Math.max(0, totalToolCount - 25) : 0
    const toolCount = totalToolCount - mcpToolCount

    // ── 2. Read CLAUDE.md / memory files from disk (real content sizes) ──
    const memoryFiles: Array<{ path: string; tokens: number }> = []
    let totalMemoryChars = 0

    // Project-level CLAUDE.md
    const claudeMdPaths = [
      join(cwd, 'CLAUDE.md'),
      join(cwd, '.claude', 'CLAUDE.md'),
    ]
    for (const p of claudeMdPaths) {
      if (existsSync(p)) {
        try {
          const content = readFileSync(p, 'utf-8')
          const tokens = Math.ceil(content.length / 4)
          totalMemoryChars += content.length
          memoryFiles.push({ path: p.replace(homedir(), '~'), tokens })
        } catch {}
      }
    }

    // User-level CLAUDE.md
    const userClaudeMd = join(homedir(), '.claude', 'CLAUDE.md')
    if (existsSync(userClaudeMd)) {
      try {
        const content = readFileSync(userClaudeMd, 'utf-8')
        const tokens = Math.ceil(content.length / 4)
        totalMemoryChars += content.length
        memoryFiles.push({ path: '~/.claude/CLAUDE.md', tokens })
      } catch {}
    }

    // Project memory directory (auto-memory files)
    const memoryDir = join(projectDir, 'memory')
    if (existsSync(memoryDir)) {
      try {
        const files = readdirSync(memoryDir).filter((f: string) => f.endsWith('.md'))
        for (const file of files) {
          const filePath = join(memoryDir, file)
          try {
            const content = readFileSync(filePath, 'utf-8')
            const tokens = Math.ceil(content.length / 4)
            totalMemoryChars += content.length
            memoryFiles.push({ path: join('memory', file), tokens })
          } catch {}
        }
      } catch {}
    }

    // ── 3. Read skill content from disk for real token counts ──
    const skillDetails: Array<{ name: string; tokens: number }> = []
    let totalSkillChars = 0

    // Skills live in ~/.claude/skills/<name>/SKILL.md or similar
    const skillsDir = join(homedir(), '.claude', 'skills')
    if (existsSync(skillsDir) && skills.length > 0) {
      // Fix #4: Only scan skills that are active in the current session
      const activeSkillSet = new Set(skills.map((s) => s.toLowerCase()))
      try {
        const skillDirs = readdirSync(skillsDir)
        for (const skillDir of skillDirs) {
          if (!activeSkillSet.has(skillDir.toLowerCase())) continue
          const skillMd = join(skillsDir, skillDir, 'SKILL.md')
          if (existsSync(skillMd)) {
            try {
              const content = readFileSync(skillMd, 'utf-8')
              const tokens = Math.ceil(content.length / 4)
              totalSkillChars += content.length
              skillDetails.push({ name: skillDir, tokens })
            } catch {}
          }
        }
      } catch {}
    }
    // If we found skills from the init event but couldn't read them from disk,
    // estimate using the CLI's gP6() approach: charLen/4 on the name
    for (const s of skills) {
      if (!skillDetails.some((sd) => sd.name === s)) {
        const estimated = Math.max(40, Math.ceil(s.length * 20 / 4)) // name + desc rough estimate
        totalSkillChars += estimated * 4
        skillDetails.push({ name: s, tokens: estimated })
      }
    }

    // ── 4. Use REAL API token counts from the result event ──
    //
    // From the API result event we get:
    //   cache_creation_input_tokens = system context (prompt + tools + memory + skills)
    //                                 cached on first request
    //   cache_read_input_tokens     = same system context, read from cache on subsequent requests
    //   input_tokens                = per-request tokens (messages + new content)
    //
    // The real infrastructure token count = cache_creation OR cache_read (whichever is nonzero)
    // The real message token count = input_tokens
    // Total context = all three combined

    // Context window size — infer from model name (CLI: aX())
    const isExtended = model?.includes('[1m]') || model?.includes('opus-4') || model?.includes('sonnet-4')
    const maxTokens = isExtended ? 1000000 : 200000

    // Memory file tokens (from actual file content, char/4)
    const memoryTokens = Math.ceil(totalMemoryChars / 4)

    // Skill tokens (from actual file content, char/4)
    const skillTokens = Math.ceil(totalSkillChars / 4)

    // Autocompact buffer: CLI uses min(maxOutput, 20000) + 13000 = 33000
    const autocompactBuffer = 33000

    let systemPromptTokens: number
    let builtInToolTokens: number
    let mcpToolTokens: number
    let msgTokens: number
    let totalUsed: number

    if (hasApiUsage) {
      // ── Path A: Real API token counts available ──
      const infraTokens = Math.max(cacheCreate, cacheRead)
      msgTokens = lastInputTokens
      totalUsed = infraTokens + msgTokens

      // Derive system prompt + tools from infrastructure minus known categories
      const systemAndToolTokens = Math.max(0, infraTokens - memoryTokens - skillTokens)

      // Split system prompt vs tools proportionally
      const estSys = 5500
      const estTools = toolCount * 250 + mcpToolCount * 200
      const total = estSys + estTools || 1
      systemPromptTokens = Math.round(systemAndToolTokens * (estSys / total))
      builtInToolTokens = Math.round(systemAndToolTokens * (Math.max(0, estTools - mcpToolCount * 200) / total))
      mcpToolTokens = mcpToolCount > 0 ? Math.round(systemAndToolTokens * (mcpToolCount * 200 / total)) : 0

      log(`GET_CONTEXT: [API] infra=${infraTokens} (cache_create=${cacheCreate}, cache_read=${cacheRead}), msgs=${msgTokens}`)
    } else {
      // ── Path B: No API data — estimate from content sizes (CLI's char/4 fallback) ──
      systemPromptTokens = 5500
      builtInToolTokens = toolCount * 250
      mcpToolTokens = mcpToolCount * 200
      msgTokens = Math.ceil(messageChars / 4)
      totalUsed = systemPromptTokens + builtInToolTokens + mcpToolTokens + memoryTokens + skillTokens + msgTokens

      log(`GET_CONTEXT: [estimated] sysProm=${systemPromptTokens}, tools=${builtInToolTokens}, msgs=${msgTokens} (${messageChars} chars)`)
    }

    // Free space
    const freeTokens = Math.max(0, maxTokens - totalUsed - autocompactBuffer)
    const usagePercent = maxTokens > 0 ? Math.round((totalUsed / maxTokens) * 100) : 0

    // ── 5. Build category array ──
    const pct = (t: number) => maxTokens > 0 ? (t / maxTokens) * 100 : 0

    const categories = [
      { label: 'System prompt', tokens: systemPromptTokens, percent: pct(systemPromptTokens) },
      { label: 'System tools', tokens: builtInToolTokens, percent: pct(builtInToolTokens) },
    ]
    if (mcpToolTokens > 0) {
      categories.push({ label: 'MCP tools', tokens: mcpToolTokens, percent: pct(mcpToolTokens) })
    }
    categories.push(
      { label: 'Memory files', tokens: memoryTokens, percent: pct(memoryTokens) },
      { label: 'Skills', tokens: skillTokens, percent: pct(skillTokens) },
      { label: 'Messages', tokens: msgTokens, percent: pct(msgTokens) },
      { label: 'Free space', tokens: freeTokens, percent: pct(freeTokens) },
      { label: 'Autocompact buffer', tokens: autocompactBuffer, percent: pct(autocompactBuffer) },
    )

    log(`GET_CONTEXT: model=${model}, total=${totalUsed}/${maxTokens} (${usagePercent}%), source=${hasApiUsage ? 'API' : 'estimated'}`)

    return {
      model,
      maxTokens,
      usagePercent,
      totalUsed,
      categories,
      memoryFiles,
      skills: skillDetails,
      inputTokens: lastInputTokens,
      outputTokens: lastOutputTokens,
      cacheRead,
      cacheCreate,
      version,
      isEstimated: !hasApiUsage,
    }
  } catch (err) {
    log(`GET_CONTEXT error: ${err}`)
    return null
  }
})

ipcMain.handle(IPC.SELECT_DIRECTORY, async () => {
  if (!mainWindow) return null
  // macOS: activate app so unparented dialog appears on top (not behind other apps).
  // Unparented avoids modal dimming on the transparent overlay.
  // Activation is fine here — user is actively interacting with Clui.
  if (process.platform === 'darwin') app.focus()
  const options = { properties: ['openDirectory'] as const }
  const result = process.platform === 'darwin'
    ? await dialog.showOpenDialog(options)
    : await dialog.showOpenDialog(mainWindow, options)
  return result.canceled ? null : result.filePaths[0]
})

ipcMain.handle(IPC.OPEN_EXTERNAL, async (_event, url: string) => {
  try {
    // Only allow http(s) links from markdown content.
    if (!/^https?:\/\//i.test(url)) return false
    await shell.openExternal(url)
    return true
  } catch {
    return false
  }
})

ipcMain.handle(IPC.ATTACH_FILES, async () => {
  if (!mainWindow) return null
  // macOS: activate app so unparented dialog appears on top
  if (process.platform === 'darwin') app.focus()
  const options = {
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'All Files', extensions: ['*'] },
      { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'] },
      { name: 'Code', extensions: ['ts', 'tsx', 'js', 'jsx', 'py', 'rs', 'go', 'md', 'json', 'yaml', 'toml'] },
    ],
  }
  const result = process.platform === 'darwin'
    ? await dialog.showOpenDialog(options)
    : await dialog.showOpenDialog(mainWindow, options)
  if (result.canceled || result.filePaths.length === 0) return null

  const { basename, extname } = require('path')
  const { readFileSync, statSync } = require('fs')

  const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'])
  const mimeMap: Record<string, string> = {
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
    '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml',
    '.pdf': 'application/pdf', '.txt': 'text/plain', '.md': 'text/markdown',
    '.json': 'application/json', '.yaml': 'text/yaml', '.toml': 'text/toml',
  }

  return result.filePaths.map((fp: string) => {
    const ext = extname(fp).toLowerCase()
    const mime = mimeMap[ext] || 'application/octet-stream'
    const stat = statSync(fp)
    let dataUrl: string | undefined

    // Generate preview data URL for images (max 2MB to keep IPC fast)
    if (IMAGE_EXTS.has(ext) && stat.size < 2 * 1024 * 1024) {
      try {
        const buf = readFileSync(fp)
        dataUrl = `data:${mime};base64,${buf.toString('base64')}`
      } catch {}
    }

    return {
      id: crypto.randomUUID(),
      type: IMAGE_EXTS.has(ext) ? 'image' : 'file',
      name: basename(fp),
      path: fp,
      mimeType: mime,
      dataUrl,
      size: stat.size,
    }
  })
})

ipcMain.handle(IPC.TAKE_SCREENSHOT, async () => {
  if (!mainWindow) return null

  if (SPACES_DEBUG) snapshotWindowState('screenshot pre-hide')
  mainWindow.hide()
  await new Promise((r) => setTimeout(r, 300))

  try {
    const { execSync } = require('child_process')
    const { join } = require('path')
    const { tmpdir } = require('os')
    const { readFileSync, existsSync } = require('fs')

    const timestamp = Date.now()
    const screenshotPath = join(tmpdir(), `clui-screenshot-${timestamp}.png`)

    execSync(`/usr/sbin/screencapture -i "${screenshotPath}"`, {
      timeout: 30000,
      stdio: 'ignore',
    })

    if (!existsSync(screenshotPath)) {
      return null
    }

    // Return structured attachment with data URL preview
    const buf = readFileSync(screenshotPath)
    return {
      id: crypto.randomUUID(),
      type: 'image',
      name: `screenshot ${++screenshotCounter}.png`,
      path: screenshotPath,
      mimeType: 'image/png',
      dataUrl: `data:image/png;base64,${buf.toString('base64')}`,
      size: buf.length,
    }
  } catch {
    return null
  } finally {
    if (mainWindow) {
      mainWindow.show()
      mainWindow.webContents.focus()
    }
    broadcast(IPC.WINDOW_SHOWN)
    if (SPACES_DEBUG) {
      log('[spaces] screenshot restore show+focus')
      snapshotWindowState('screenshot restore immediate')
      setTimeout(() => snapshotWindowState('screenshot restore +200ms'), 200)
    }
  }
})

let pasteCounter = 0
ipcMain.handle(IPC.PASTE_IMAGE, async (_event, dataUrl: string) => {
  try {
    const { writeFileSync } = require('fs')
    const { join } = require('path')
    const { tmpdir } = require('os')

    // Parse data URL: "data:image/png;base64,..."
    const match = dataUrl.match(/^data:(image\/(\w+));base64,(.+)$/)
    if (!match) return null

    const [, mimeType, ext, base64Data] = match
    const buf = Buffer.from(base64Data, 'base64')
    const timestamp = Date.now()
    const filePath = join(tmpdir(), `clui-paste-${timestamp}.${ext}`)
    writeFileSync(filePath, buf)

    return {
      id: crypto.randomUUID(),
      type: 'image',
      name: `pasted image ${++pasteCounter}.${ext}`,
      path: filePath,
      mimeType,
      dataUrl,
      size: buf.length,
    }
  } catch {
    return null
  }
})

ipcMain.handle(IPC.TRANSCRIBE_AUDIO, async (_event, audioBase64: string) => {
  const { writeFileSync, existsSync, unlinkSync, readFileSync } = require('fs')
  const { execSync } = require('child_process')
  const { join } = require('path')
  const { tmpdir } = require('os')

  const tmpWav = join(tmpdir(), `clui-voice-${Date.now()}.wav`)
  try {
    const buf = Buffer.from(audioBase64, 'base64')
    writeFileSync(tmpWav, buf)

    // Find whisper-cli (whisper-cpp homebrew) or whisper (python)
    const candidates = [
      '/opt/homebrew/bin/whisper-cli',
      '/usr/local/bin/whisper-cli',
      '/opt/homebrew/bin/whisper',
      '/usr/local/bin/whisper',
      join(homedir(), '.local/bin/whisper'),
    ]

    let whisperBin = ''
    for (const c of candidates) {
      if (existsSync(c)) { whisperBin = c; break }
    }

    if (!whisperBin) {
      try {
        whisperBin = execSync('/bin/zsh -lc "whence -p whisper-cli"', { encoding: 'utf-8' }).trim()
      } catch {}
    }
    if (!whisperBin) {
      try {
        whisperBin = execSync('/bin/zsh -lc "whence -p whisper"', { encoding: 'utf-8' }).trim()
      } catch {}
    }

    if (!whisperBin) {
      return {
        error: 'Whisper not found',
        errorType: 'whisper_not_found',
        transcript: null,
      }
    }

    const isWhisperCpp = whisperBin.includes('whisper-cli')

    // Find model file — prefer multilingual (auto-detect language) over .en (English-only)
    const modelCandidates = [
      join(homedir(), '.local/share/whisper/ggml-base.bin'),
      join(homedir(), '.local/share/whisper/ggml-tiny.bin'),
      '/opt/homebrew/share/whisper-cpp/models/ggml-base.bin',
      '/opt/homebrew/share/whisper-cpp/models/ggml-tiny.bin',
      // Fall back to English-only models if multilingual not available
      join(homedir(), '.local/share/whisper/ggml-base.en.bin'),
      join(homedir(), '.local/share/whisper/ggml-tiny.en.bin'),
      '/opt/homebrew/share/whisper-cpp/models/ggml-base.en.bin',
      '/opt/homebrew/share/whisper-cpp/models/ggml-tiny.en.bin',
    ]

    let modelPath = ''
    for (const m of modelCandidates) {
      if (existsSync(m)) { modelPath = m; break }
    }

    // Detect if using an English-only model (.en suffix) — force English if so
    const isEnglishOnly = modelPath.includes('.en.')
    log(`Transcribing with: ${whisperBin} (model: ${modelPath || 'default'}, lang: ${isEnglishOnly ? 'en' : 'auto'})`)

    let output: string
    if (isWhisperCpp) {
      // whisper-cpp: whisper-cli -m model -f file --no-timestamps
      if (!modelPath) {
        return {
          error: 'Whisper model not found',
          errorType: 'model_not_found',
          transcript: null,
        }
      }
      const langFlag = isEnglishOnly ? '-l en' : '-l auto'
      output = execSync(
        `"${whisperBin}" -m "${modelPath}" -f "${tmpWav}" --no-timestamps ${langFlag}`,
        { encoding: 'utf-8', timeout: 30000 }
      )
    } else {
      // Python whisper: auto-detect language unless English-only model
      const langFlag = isEnglishOnly ? '--language en' : ''
      output = execSync(
        `"${whisperBin}" "${tmpWav}" --model tiny ${langFlag} --output_format txt --output_dir "${tmpdir()}"`,
        { encoding: 'utf-8', timeout: 30000 }
      )
      // Python whisper writes .txt file
      const txtPath = tmpWav.replace('.wav', '.txt')
      if (existsSync(txtPath)) {
        const transcript = readFileSync(txtPath, 'utf-8').trim()
        try { unlinkSync(txtPath) } catch {}
        return { error: null, transcript }
      }
      // File not created — Python whisper failed silently
      return {
        error: `Whisper output file not found at ${txtPath}. Check disk space and permissions.`,
        transcript: null,
      }
    }

    // whisper-cpp prints to stdout directly
    // Strip timestamp patterns and known hallucination outputs
    const HALLUCINATIONS = /^\s*(\[BLANK_AUDIO\]|you\.?|thank you\.?|thanks\.?)\s*$/i
    const transcript = output
      .replace(/\[[\d:.]+\s*-->\s*[\d:.]+\]\s*/g, '')
      .trim()

    if (HALLUCINATIONS.test(transcript)) {
      return { error: null, transcript: '' }
    }

    return { error: null, transcript: transcript || '' }
  } catch (err: any) {
    log(`Transcription error: ${err.message}`)
    return {
      error: `Transcription failed: ${err.message}`,
      transcript: null,
    }
  } finally {
    try { unlinkSync(tmpWav) } catch {}
  }
})

ipcMain.handle(IPC.FIX_WHISPER, async () => {
  const { existsSync, mkdirSync } = require('fs')
  const { execSync } = require('child_process')
  const { join } = require('path')
  const { exec } = require('child_process')

  try {
    // Check if whisper binary exists
    const binCandidates = [
      '/opt/homebrew/bin/whisper-cli',
      '/usr/local/bin/whisper-cli',
      '/opt/homebrew/bin/whisper',
      '/usr/local/bin/whisper',
      join(homedir(), '.local/bin/whisper'),
    ]
    let whisperBin = ''
    for (const c of binCandidates) {
      if (existsSync(c)) { whisperBin = c; break }
    }
    if (!whisperBin) {
      try { whisperBin = execSync('/bin/zsh -lc "whence -p whisper-cli"', { encoding: 'utf-8' }).trim() } catch {}
    }
    if (!whisperBin) {
      try { whisperBin = execSync('/bin/zsh -lc "whence -p whisper"', { encoding: 'utf-8' }).trim() } catch {}
    }

    // Install whisper-cpp via brew if missing
    if (!whisperBin) {
      log('FIX_WHISPER: Installing whisper-cpp via brew...')
      await new Promise<void>((resolve, reject) => {
        exec('/bin/zsh -lc "brew install whisper-cpp"', { timeout: 300000 }, (err: any) => {
          if (err) reject(new Error(`brew install failed: ${err.message}`))
          else resolve()
        })
      })
      log('FIX_WHISPER: whisper-cpp installed')
    }

    // Check if model exists
    const modelCandidates = [
      join(homedir(), '.local/share/whisper/ggml-base.bin'),
      join(homedir(), '.local/share/whisper/ggml-tiny.bin'),
      '/opt/homebrew/share/whisper-cpp/models/ggml-base.bin',
      '/opt/homebrew/share/whisper-cpp/models/ggml-tiny.bin',
      join(homedir(), '.local/share/whisper/ggml-base.en.bin'),
      join(homedir(), '.local/share/whisper/ggml-tiny.en.bin'),
      '/opt/homebrew/share/whisper-cpp/models/ggml-base.en.bin',
      '/opt/homebrew/share/whisper-cpp/models/ggml-tiny.en.bin',
    ]
    let modelFound = false
    for (const m of modelCandidates) {
      if (existsSync(m)) { modelFound = true; break }
    }

    // Download tiny model if missing
    if (!modelFound) {
      const modelDir = join(homedir(), '.local/share/whisper')
      mkdirSync(modelDir, { recursive: true })
      const modelDest = join(modelDir, 'ggml-tiny.bin')
      log('FIX_WHISPER: Downloading ggml-tiny.bin...')
      await new Promise<void>((resolve, reject) => {
        exec(
          `curl -L -o "${modelDest}" "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin"`,
          { timeout: 300000 },
          (err: any) => {
            if (err) reject(new Error(`Model download failed: ${err.message}`))
            else resolve()
          }
        )
      })
      log('FIX_WHISPER: Model downloaded')
    }

    return { ok: true }
  } catch (err: any) {
    log(`FIX_WHISPER error: ${err.message}`)
    return { ok: false, error: err.message }
  }
})

ipcMain.handle(IPC.GET_DIAGNOSTICS, () => {
  const { readFileSync, existsSync } = require('fs')
  const health = controlPlane.getHealth()

  let recentLogs = ''
  if (existsSync(LOG_FILE)) {
    try {
      const content = readFileSync(LOG_FILE, 'utf-8')
      const lines = content.split('\n')
      recentLogs = lines.slice(-100).join('\n')
    } catch {}
  }

  return {
    health,
    logPath: LOG_FILE,
    recentLogs,
    platform: process.platform,
    arch: process.arch,
    electronVersion: process.versions.electron,
    nodeVersion: process.versions.node,
    appVersion: app.getVersion(),
    transport: INTERACTIVE_PTY ? 'pty' : 'stream-json',
  }
})

ipcMain.handle(IPC.OPEN_IN_TERMINAL, (_event, arg: string | null | { sessionId?: string | null; projectPath?: string }) => {
  const { execFile } = require('child_process')
  const claudeBin = 'claude'

  // Support both old (string) and new ({ sessionId, projectPath }) calling convention
  let sessionId: string | null = null
  let projectPath: string = process.cwd()
  if (typeof arg === 'string') {
    sessionId = arg
  } else if (arg && typeof arg === 'object') {
    sessionId = arg.sessionId ?? null
    projectPath = arg.projectPath && arg.projectPath !== '~' ? arg.projectPath : process.cwd()
  }

  // Escape for AppleScript: double quotes → backslash-escaped, backslashes doubled
  const projectDir = projectPath.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
  let cmd: string
  if (sessionId) {
    cmd = `cd \\"${projectDir}\\" && ${claudeBin} --resume ${sessionId}`
  } else {
    cmd = `cd \\"${projectDir}\\" && ${claudeBin}`
  }

  const script = `tell application "Terminal"
  activate
  do script "${cmd}"
end tell`

  try {
    execFile('/usr/bin/osascript', ['-e', script], (err: Error | null) => {
      if (err) log(`Failed to open terminal: ${err.message}`)
      else log(`Opened terminal with: ${cmd}`)
    })
    return true
  } catch (err: unknown) {
    log(`Failed to open terminal: ${err}`)
    return false
  }
})

// ─── Marketplace IPC ───

ipcMain.handle(IPC.MARKETPLACE_FETCH, async (_event, { forceRefresh } = {}) => {
  log('IPC MARKETPLACE_FETCH')
  return fetchCatalog(forceRefresh)
})

ipcMain.handle(IPC.MARKETPLACE_INSTALLED, async () => {
  log('IPC MARKETPLACE_INSTALLED')
  return listInstalled()
})

ipcMain.handle(IPC.MARKETPLACE_INSTALL, async (_event, { repo, pluginName, marketplace, sourcePath, isSkillMd }: { repo: string; pluginName: string; marketplace: string; sourcePath?: string; isSkillMd?: boolean }) => {
  log(`IPC MARKETPLACE_INSTALL: ${pluginName} from ${repo} (isSkillMd=${isSkillMd})`)
  return installPlugin(repo, pluginName, marketplace, sourcePath, isSkillMd)
})

ipcMain.handle(IPC.MARKETPLACE_UNINSTALL, async (_event, { pluginName }: { pluginName: string }) => {
  log(`IPC MARKETPLACE_UNINSTALL: ${pluginName}`)
  return uninstallPlugin(pluginName)
})

// ─── Theme Detection ───

ipcMain.handle(IPC.GET_THEME, () => {
  return { isDark: nativeTheme.shouldUseDarkColors }
})

nativeTheme.on('updated', () => {
  broadcast(IPC.THEME_CHANGED, nativeTheme.shouldUseDarkColors)
})

// ─── Permission Preflight ───
// Request all required macOS permissions upfront on first launch so the user
// is never interrupted mid-session by a permission prompt.

async function requestPermissions(): Promise<void> {
  if (process.platform !== 'darwin') return

  // ── Microphone (for voice input via Whisper) ──
  try {
    const micStatus = systemPreferences.getMediaAccessStatus('microphone')
    if (micStatus === 'not-determined') {
      await systemPreferences.askForMediaAccess('microphone')
    }
  } catch (err: any) {
    log(`Permission preflight: microphone check failed — ${err.message}`)
  }

  // ── Accessibility (for global ⌥+Space shortcut) ──
  // globalShortcut works without it on modern macOS; Cmd+Shift+K is always the fallback.
  // Screen Recording: not requested upfront — macOS 15 Sequoia shows an alarming
  // "bypass private window picker" dialog. Let the OS prompt naturally if/when
  // the screenshot feature is actually used.
}

// ─── App Lifecycle ───

app.whenReady().then(async () => {
  // macOS: become an accessory app. Accessory apps can have key windows (keyboard works)
  // without deactivating the currently active app (hover preserved in browsers).
  // This is how Spotlight, Alfred, Raycast work.
  if (process.platform === 'darwin' && app.dock) {
    app.dock.hide()
  }

  // Request permissions upfront so the user is never interrupted mid-session.
  await requestPermissions()

  // Skill provisioning — non-blocking, streams status to renderer
  ensureSkills((status: SkillStatus) => {
    log(`Skill ${status.name}: ${status.state}${status.error ? ` — ${status.error}` : ''}`)
    broadcast(IPC.SKILL_STATUS, status)
  }).catch((err: Error) => log(`Skill provisioning error: ${err.message}`))

  createWindow()
  snapshotWindowState('after createWindow')

  if (SPACES_DEBUG) {
    mainWindow?.on('show', () => snapshotWindowState('event window show'))
    mainWindow?.on('hide', () => snapshotWindowState('event window hide'))
    mainWindow?.on('focus', () => snapshotWindowState('event window focus'))
    mainWindow?.on('blur', () => snapshotWindowState('event window blur'))
    mainWindow?.webContents.on('focus', () => snapshotWindowState('event webContents focus'))
    mainWindow?.webContents.on('blur', () => snapshotWindowState('event webContents blur'))

    app.on('browser-window-focus', () => snapshotWindowState('event app browser-window-focus'))
    app.on('browser-window-blur', () => snapshotWindowState('event app browser-window-blur'))

    screen.on('display-added', (_e, display) => {
      log(`[spaces] event display-added id=${display.id}`)
      snapshotWindowState('event display-added')
    })
    screen.on('display-removed', (_e, display) => {
      log(`[spaces] event display-removed id=${display.id}`)
      snapshotWindowState('event display-removed')
    })
    screen.on('display-metrics-changed', (_e, display, changedMetrics) => {
      log(`[spaces] event display-metrics-changed id=${display.id} changed=${changedMetrics.join(',')}`)
      snapshotWindowState('event display-metrics-changed')
    })
  }


  // Primary: Option+Space (2 keys, doesn't conflict with shell)
  // Fallback: Cmd+Shift+K kept as secondary shortcut
  const registered = globalShortcut.register('Alt+Space', () => toggleWindow('shortcut Alt+Space'))
  if (!registered) {
    log('Alt+Space shortcut registration failed — macOS input sources may claim it')
  }
  globalShortcut.register('CommandOrControl+Shift+K', () => toggleWindow('shortcut Cmd/Ctrl+Shift+K'))

  const trayIconPath = join(__dirname, '../../resources/trayTemplate.png')
  const trayIcon = nativeImage.createFromPath(trayIconPath)
  trayIcon.setTemplateImage(true)
  tray = new Tray(trayIcon)
  tray.setToolTip('Clui — Claude Code UI')
  tray.on('click', () => toggleWindow('tray click'))

  let pendingUpdateVersion: string | null = null

  function rebuildTrayMenu(): void {
    if (!tray) return
    const items: Electron.MenuItemConstructorOptions[] = [
      { label: 'Show Clui', click: () => showWindow('tray menu') },
    ]
    if (pendingUpdateVersion) {
      items.push({
        label: `Restart to update (v${pendingUpdateVersion})`,
        click: () => { forceQuit = true; autoUpdater.quitAndInstall() },
      })
    }
    items.push({ label: 'Quit', click: () => { app.quit() } })
    tray.setContextMenu(Menu.buildFromTemplate(items))
  }

  rebuildTrayMenu()

  // ─── Auto-updater ───
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.logger = { info: (m: string) => log(`[updater] ${m}`), warn: (m: string) => log(`[updater] WARN ${m}`), error: (m: string) => log(`[updater] ERROR ${m}`), debug: (m: string) => log(`[updater] ${m}`) }

  autoUpdater.on('update-available', (info) => {
    log(`[updater] update available: v${info.version}`)
    broadcast(IPC.UPDATE_AVAILABLE, { version: info.version })
  })

  autoUpdater.on('update-downloaded', (info) => {
    log(`[updater] update downloaded: v${info.version}`)
    pendingUpdateVersion = info.version
    rebuildTrayMenu()
    broadcast(IPC.UPDATE_DOWNLOADED, { version: info.version })
  })

  autoUpdater.on('error', (err) => {
    log(`[updater] error: ${err.message}`)
    broadcast(IPC.UPDATE_ERROR, { message: err.message })
  })

  ipcMain.handle(IPC.CHECK_FOR_UPDATE, () => autoUpdater.checkForUpdates())
  ipcMain.handle(IPC.INSTALL_UPDATE, () => {
    forceQuit = true
    autoUpdater.quitAndInstall()
  })

  // Initial check + periodic check every 30 minutes
  autoUpdater.checkForUpdates().catch((err: Error) => log(`[updater] initial check failed: ${err.message}`))
  setInterval(() => {
    autoUpdater.checkForUpdates().catch((err: Error) => log(`[updater] periodic check failed: ${err.message}`))
  }, 30 * 60 * 1000)

  // app 'activate' fires when macOS brings the app to the foreground (e.g. after
  // webContents.focus() triggers applicationDidBecomeActive on some macOS versions).
  // Using showWindow here instead of toggleWindow prevents the re-entry race where
  // a summon immediately hides itself because activate fires mid-show.
  app.on('activate', () => showWindow('app activate'))
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
  controlPlane.shutdown()
  flushLogs()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
