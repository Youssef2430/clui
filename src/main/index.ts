import { app, BrowserWindow, ipcMain, dialog, screen, globalShortcut, Tray, Menu, nativeImage, nativeTheme, shell, systemPreferences, protocol, net } from 'electron'
import { execFile, spawn } from 'child_process'
import { basename, join, resolve, normalize } from 'path'
import { existsSync, readdirSync, statSync, createReadStream, mkdirSync, writeFileSync, chmodSync } from 'fs'
import { readdir } from 'fs/promises'
import { createInterface } from 'readline'
import { homedir, tmpdir } from 'os'
import { ControlPlane } from './claude/control-plane'
import { ensureSkills, type SkillStatus } from './skills/installer'
import { fetchCatalog, listInstalled, installPlugin, uninstallPlugin } from './marketplace/catalog'
import { log as _log, LOG_FILE, flushLogs } from './logger'
import { getCliEnv } from './cli-env'
import { autoUpdater } from 'electron-updater'
import { SearchManager } from './search/search-manager'
import { IPC, OVERLAY_BAR_WIDTH, OVERLAY_PILL_HEIGHT, OVERLAY_PILL_BOTTOM_MARGIN } from '../shared/types'
import type { RunOptions, NormalizedEvent, EnrichedError, BtwOptions, PreferredTerminalId, TerminalId, TerminalInstallation } from '../shared/types'

const DEBUG_MODE = process.env.CLUI_DEBUG === '1'
const SPACES_DEBUG = DEBUG_MODE || process.env.CLUI_SPACES_DEBUG === '1'

function log(msg: string): void {
  _log('main', msg)
}

let mainWindow: BrowserWindow | null = null
let gridWindow: BrowserWindow | null = null
let tray: Tray | null = null
let screenshotCounter = 0
let toggleSequence = 0
let forceQuit = false
let lastWindowBounds: Electron.Rectangle | null = null

// ─── Snap grid overlay HTML (embedded, no separate file needed) ───
const SNAP_GRID_HTML = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:100vw;height:100vh;overflow:hidden;background:transparent}
.wrap{position:fixed;inset:0;opacity:0;transition:opacity 0.14s ease}
.wrap.visible{opacity:1}
.hud{position:absolute;inset:0;pointer-events:none}
.zone-band{
  position:absolute;top:0;bottom:0;left:0;width:0;
  background:linear-gradient(90deg,rgba(255,255,255,0.10),rgba(255,255,255,0.06));
  border-left:1px solid rgba(255,255,255,0.30);
  border-right:1px solid rgba(255,255,255,0.30);
  transition:left 0.11s ease,width 0.11s ease;
}
.line{
  position:absolute;top:0;bottom:0;width:0;
  border-left:1px dashed rgba(255,255,255,0.28);
}
.line.edge{border-left-style:solid;border-left-color:rgba(255,255,255,0.40)}
.line.threshold{border-left-color:rgba(255,255,255,0.34)}
.hline{
  position:absolute;left:0;right:0;height:0;
  border-top:1px dashed rgba(255,255,255,0.16);
}
.deadzone{
  position:absolute;top:0;bottom:0;right:0;width:0;
  background:linear-gradient(90deg,rgba(255,255,255,0.00),rgba(255,255,255,0.05));
}
</style></head><body>
<div class="wrap" id="w">
  <div class="hud">
    <div class="zone-band" id="zoneBand"></div>
    <div class="line edge" id="startLine"></div>
    <div class="line threshold" id="firstThreshold"></div>
    <div class="line threshold" id="secondThreshold"></div>
    <div class="line edge" id="endLine"></div>
    <div class="deadzone" id="deadzone"></div>
    <div id="hl"></div>
  </div>
</div>
<script>
const w=document.getElementById('w');
const band=document.getElementById('zoneBand');
const startLine=document.getElementById('startLine');
const firstThreshold=document.getElementById('firstThreshold');
const secondThreshold=document.getElementById('secondThreshold');
const endLine=document.getElementById('endLine');
const deadzone=document.getElementById('deadzone');
const hlc=document.getElementById('hl');
const ROWS=6;
let activeZone='center';
let barWidth=1040;
let travel=0;
let first=0;
let second=0;
for(let i=1;i<ROWS;i++){
  const d=document.createElement('div');
  d.className='hline';
  d.style.top=(100*i/ROWS)+'%';
  hlc.appendChild(d);
}
function px(n){return Math.max(0,Math.round(n));}
function layout(){
  const width=window.innerWidth;
  travel=Math.max(0,width-barWidth);
  first=travel*0.25;
  second=travel*0.75;
  startLine.style.left='0px';
  firstThreshold.style.left=px(first)+'px';
  secondThreshold.style.left=px(second)+'px';
  endLine.style.left=px(travel)+'px';
  deadzone.style.width=px(width-travel)+'px';
}
function renderZone(){
  if(activeZone==='left'){
    band.style.left='0px';
    band.style.width=px(first)+'px';
    return;
  }
  if(activeZone==='right'){
    band.style.left=px(second)+'px';
    band.style.width=px(travel-second)+'px';
    return;
  }
  band.style.left=px(first)+'px';
  band.style.width=px(second-first)+'px';
}
window.setSnapLayout=function(nextBarWidth){
  if(Number.isFinite(nextBarWidth)){
    barWidth=Math.max(0,Number(nextBarWidth));
  }
  layout();
  renderZone();
};
window.setSnapZone=function(zone){
  if(zone==='left'||zone==='center'||zone==='right'){
    activeZone=zone;
    renderZone();
  }
};
window.addEventListener('resize',()=>{layout();renderZone();});
layout();
renderZone();
requestAnimationFrame(()=>w.classList.add('visible'));
</script></body></html>`

// Feature flag: enable PTY interactive permissions transport
const INTERACTIVE_PTY = process.env.CLUI_INTERACTIVE_PERMISSIONS_PTY === '1'

const controlPlane = new ControlPlane(INTERACTIVE_PTY)

// Keep native width fixed to avoid renderer animation vs setBounds race.
// The UI itself still launches in compact mode; extra width is transparent/click-through.
// Values are imported from shared/types to stay in sync with the renderer.
const BAR_WIDTH = OVERLAY_BAR_WIDTH
const PILL_HEIGHT = OVERLAY_PILL_HEIGHT       // Fixed native window height — extra room for expanded UI + shadow buffers
const PILL_BOTTOM_MARGIN = OVERLAY_PILL_BOTTOM_MARGIN

// ─── Broadcast to renderer ───

function broadcast(channel: string, ...args: unknown[]): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, ...args)
  }
}

// ─── Search ───

const searchManager = new SearchManager((status) => {
  broadcast(IPC.SEARCH_INDEX_STATUS, status)
})

// ─── Terminal detection / launch ───

type PlistValue = string | number | boolean | null | PlistObject | PlistValue[]

interface PlistObject {
  [key: string]: PlistValue
}

type TerminalLaunchStrategy = 'open-script' | 'spawn-alacritty'

interface InstalledTerminal extends TerminalInstallation {
  appPath: string
  execPath?: string
  launchStrategy: TerminalLaunchStrategy
}

const TERMINAL_SCRIPT_EXTENSIONS = new Set(['command', 'tool'])
const TERMINAL_SCRIPT_CONTENT_TYPES = new Set(['com.apple.terminal.shell-script'])
const TERMINAL_DISCOVERY_CACHE_MS = 15_000

function uniquePaths(paths: string[]): string[] {
  return [...new Set(paths)]
}

function stripAppExtension(name: string): string {
  return name.endsWith('.app') ? name.slice(0, -4) : name
}

function getAppLabel(info: PlistObject, appPath: string): string {
  const displayName = typeof info.CFBundleDisplayName === 'string' && info.CFBundleDisplayName.trim().length > 0
    ? info.CFBundleDisplayName
    : typeof info.CFBundleName === 'string' && info.CFBundleName.trim().length > 0
      ? info.CFBundleName
      : stripAppExtension(basename(appPath))

  return displayName.trim()
}

function getAppId(info: PlistObject, appPath: string): TerminalId {
  if (typeof info.CFBundleIdentifier === 'string' && info.CFBundleIdentifier.trim().length > 0) {
    return info.CFBundleIdentifier
  }

  return `app:${stripAppExtension(basename(appPath)).toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
}

async function discoverAppBundles(rootDir: string, depth = 1): Promise<string[]> {
  if (!existsSync(rootDir)) return []

  const entries = await readdir(rootDir, { withFileTypes: true }).catch(() => [])
  const bundles = await Promise.all(entries.map(async (entry) => {
    if (!entry.isDirectory()) return []

    const fullPath = join(rootDir, entry.name)
    if (entry.name.endsWith('.app')) {
      return [fullPath]
    }

    if (depth > 0) {
      return discoverAppBundles(fullPath, depth - 1)
    }

    return []
  }))

  return bundles.flat()
}

function readBundleInfo(appPath: string): Promise<PlistObject | null> {
  const plistPath = join(appPath, 'Contents', 'Info.plist')
  if (!existsSync(plistPath)) return Promise.resolve(null)

  return new Promise((resolve) => {
    execFile('/usr/bin/plutil', ['-convert', 'json', '-o', '-', plistPath], {
      encoding: 'utf8',
      maxBuffer: 2 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'ignore'],
    }, (err, stdout) => {
      if (err) {
        resolve(null)
        return
      }

      try {
        const parsed = JSON.parse(String(stdout))
        resolve(parsed && typeof parsed === 'object' ? parsed as PlistObject : null)
      } catch {
        resolve(null)
      }
    })
  })
}

function getDocumentTypes(info: PlistObject): PlistObject[] {
  if (!Array.isArray(info.CFBundleDocumentTypes)) return []
  return info.CFBundleDocumentTypes.filter((value): value is PlistObject => value != null && typeof value === 'object' && !Array.isArray(value))
}

function getStringArray(value: PlistValue | undefined): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string')
}

function supportsShellScriptDocuments(info: PlistObject): boolean {
  return getDocumentTypes(info).some((documentType) => {
    const extensions = getStringArray(documentType.CFBundleTypeExtensions).map((extension) => extension.toLowerCase())
    if (extensions.some((extension) => TERMINAL_SCRIPT_EXTENSIONS.has(extension))) return true

    const contentTypes = getStringArray(documentType.LSItemContentTypes)
    return contentTypes.some((contentType) => TERMINAL_SCRIPT_CONTENT_TYPES.has(contentType))
  })
}

function getExecutablePath(info: PlistObject, appPath: string): string | null {
  if (typeof info.CFBundleExecutable !== 'string' || info.CFBundleExecutable.trim().length === 0) return null

  const execPath = join(appPath, 'Contents', 'MacOS', info.CFBundleExecutable)
  return existsSync(execPath) ? execPath : null
}

function detectLaunchStrategy(info: PlistObject, execPath: string | null): TerminalLaunchStrategy | null {
  if (supportsShellScriptDocuments(info)) return 'open-script'

  // Some terminal apps do not register shell-script handlers but can still be
  // launched directly with an executable command interface.
  if (execPath && (info.CFBundleIdentifier === 'org.alacritty' || basename(execPath).toLowerCase() === 'alacritty')) {
    return 'spawn-alacritty'
  }

  return null
}

async function buildInstalledTerminal(appPath: string): Promise<InstalledTerminal | null> {
  const info = await readBundleInfo(appPath)
  if (!info) return null

  const execPath = getExecutablePath(info, appPath)
  const launchStrategy = detectLaunchStrategy(info, execPath)
  if (!launchStrategy) return null

  return {
    id: getAppId(info, appPath),
    label: getAppLabel(info, appPath),
    appPath,
    ...(execPath ? { execPath } : {}),
    launchStrategy,
  }
}

let installedTerminalCache: { scannedAt: number; terminals: InstalledTerminal[] } | null = null
let installedTerminalScanPromise: Promise<InstalledTerminal[]> | null = null

async function scanInstalledTerminals(): Promise<InstalledTerminal[]> {
  const appRoots = uniquePaths([
    '/Applications',
    '/System/Applications',
    join(homedir(), 'Applications'),
  ])

  const appPaths = uniquePaths((await Promise.all(appRoots.map((root) => discoverAppBundles(root)))).flat())
  const terminals = (await Promise.all(appPaths.map((appPath) => buildInstalledTerminal(appPath))))
    .flatMap((terminal) => terminal ? [terminal] : [])
    .reduce<InstalledTerminal[]>((unique, terminal) => {
      if (unique.some((candidate) => candidate.id === terminal.id)) return unique
      unique.push(terminal)
      return unique
    }, [])
    .sort((a, b) => a.label.localeCompare(b.label))

  installedTerminalCache = {
    scannedAt: Date.now(),
    terminals,
  }

  return terminals
}

function refreshInstalledTerminals(): Promise<InstalledTerminal[]> {
  if (installedTerminalScanPromise) return installedTerminalScanPromise

  installedTerminalScanPromise = scanInstalledTerminals().finally(() => {
    installedTerminalScanPromise = null
  })

  return installedTerminalScanPromise
}

async function getInstalledTerminals(): Promise<InstalledTerminal[]> {
  if (installedTerminalCache && Date.now() - installedTerminalCache.scannedAt < TERMINAL_DISCOVERY_CACHE_MS) {
    return installedTerminalCache.terminals
  }

  if (installedTerminalCache) {
    void refreshInstalledTerminals()
    return installedTerminalCache.terminals
  }

  return refreshInstalledTerminals()
}

async function findInstalledTerminal(preferredId: PreferredTerminalId | TerminalId | null | undefined): Promise<InstalledTerminal | null> {
  if (!preferredId || preferredId === 'auto') return null
  return (await getInstalledTerminals()).find((terminal) => terminal.id === preferredId) ?? null
}

function quoteForShell(input: string): string {
  return `'${input.replace(/'/g, `'\\''`)}'`
}

function buildClaudeInvocation(sessionId: string | null): string {
  return sessionId ? `claude --resume ${quoteForShell(sessionId)}` : 'claude'
}

function buildClaudeShellCommand(projectPath: string, sessionId: string | null): string {
  return `cd -- ${quoteForShell(projectPath)} && ${buildClaudeInvocation(sessionId)}`
}

function createTerminalLaunchScript(projectPath: string, sessionId: string | null): string {
  const scriptsDir = join(tmpdir(), 'clui-open-in-cli')
  mkdirSync(scriptsDir, { recursive: true })

  const scriptPath = join(
    scriptsDir,
    `launch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.command`,
  )

  writeFileSync(scriptPath, [
    '#!/bin/zsh',
    `cd -- ${quoteForShell(projectPath)} || exit 1`,
    buildClaudeInvocation(sessionId),
    '',
  ].join('\n'))
  chmodSync(scriptPath, 0o755)

  return scriptPath
}

function openScriptInTerminal(scriptPath: string, appPath?: string): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    const args = appPath ? ['-a', appPath, scriptPath] : [scriptPath]
    execFile('/usr/bin/open', args, (err) => {
      if (err) reject(err)
      else resolvePromise()
    })
  })
}

async function launchDefaultTerminal(sessionId: string | null, projectPath: string): Promise<void> {
  const scriptPath = createTerminalLaunchScript(projectPath, sessionId)
  await openScriptInTerminal(scriptPath)
}

async function launchTerminal(terminal: InstalledTerminal, sessionId: string | null, projectPath: string): Promise<void> {
  if (terminal.launchStrategy === 'open-script') {
    const scriptPath = createTerminalLaunchScript(projectPath, sessionId)
    await openScriptInTerminal(scriptPath, terminal.appPath)
    return
  }

  if (terminal.launchStrategy === 'spawn-alacritty') {
    const shellCommand = `${buildClaudeInvocation(sessionId)}; exec "\${SHELL:-/bin/zsh}" -l`
    const child = spawn(terminal.execPath || 'alacritty', [
      '--working-directory',
      projectPath,
      '-e',
      '/bin/zsh',
      '-lc',
      shellCommand,
    ], {
      cwd: projectPath,
      detached: true,
      stdio: 'ignore',
    })

    child.unref()
  }
}

ipcMain.handle(IPC.SEARCH_SESSIONS, async (_e, query: string) => {
  searchManager.ensureReady()
  return searchManager.search(query, 10)
})

ipcMain.on(IPC.SEARCH_BUILD_INDEX, () => {
  searchManager.ensureReady()
})

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

  app.on('before-quit', () => {
    forceQuit = true
    searchManager.dispose()
  })
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
  lastWindowBounds = mainWindow.getBounds()
}

function resetWindowPosition(): void {
  if (!mainWindow) return

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
  lastWindowBounds = mainWindow.getBounds()
}

/** Clamp saved bounds to a valid display work area so the window is never unreachable. */
function clampBoundsToDisplay(bounds: Electron.Rectangle): Electron.Rectangle {
  const displays = screen.getAllDisplays()
  // Find the display whose center is closest to the saved bounds center
  const cx = bounds.x + bounds.width / 2
  const cy = bounds.y + bounds.height / 2
  let best = displays[0]
  let bestDist = Infinity
  for (const d of displays) {
    const dcx = d.workArea.x + d.workArea.width / 2
    const dcy = d.workArea.y + d.workArea.height / 2
    const dist = Math.abs(cx - dcx) + Math.abs(cy - dcy)
    if (dist < bestDist) { bestDist = dist; best = d }
  }
  const wa = best.workArea
  return {
    x: Math.max(wa.x, Math.min(bounds.x, wa.x + wa.width - bounds.width)),
    y: Math.max(wa.y, Math.min(bounds.y, wa.y + wa.height - bounds.height)),
    width: bounds.width,
    height: bounds.height,
  }
}

function showWindow(source = 'unknown'): void {
  if (!mainWindow) return
  const toggleId = ++toggleSequence

  // Always show on the display where the cursor currently is.
  // If the cursor moved to a different display since the last show,
  // reposition the overlay to that display (centered, bottom-pinned).
  const cursor = screen.getCursorScreenPoint()
  const cursorDisplay = screen.getDisplayNearestPoint(cursor)

  if (lastWindowBounds) {
    const savedDisplay = screen.getDisplayMatching(lastWindowBounds)
    if (savedDisplay.id !== cursorDisplay.id) {
      // Cursor is on a different display — reposition to cursor's display
      const { width: sw, height: sh } = cursorDisplay.workAreaSize
      const { x: dx, y: dy } = cursorDisplay.workArea
      lastWindowBounds = {
        x: dx + Math.round((sw - BAR_WIDTH) / 2),
        y: dy + sh - PILL_HEIGHT - PILL_BOTTOM_MARGIN,
        width: BAR_WIDTH,
        height: PILL_HEIGHT,
      }
    }
    // Clamp before applying — display config may have changed (monitor disconnected, scaling changed)
    mainWindow.setBounds(clampBoundsToDisplay(lastWindowBounds))
  }

  // Always re-assert space membership — the flag can be lost after hide/show cycles
  // and must be set before show() so the window joins the active Space, not its
  // last-known Space.
  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })

  if (SPACES_DEBUG) {
    const b = mainWindow.getBounds()
    log(`[spaces] showWindow#${toggleId} source=${source} preserve-bounds=(${b.x},${b.y},${b.width}x${b.height})`)
    snapshotWindowState(`showWindow#${toggleId} pre-show`)
  }
  // As an accessory app (app.dock.hide), show() + focus gives keyboard
  // without deactivating the active app — hover preserved everywhere.
  mainWindow.show()
  if (lastWindowBounds) {
    mainWindow.setBounds(clampBoundsToDisplay(lastWindowBounds))
  }
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

function getOverlayDisplay(): Electron.Display {
  if (mainWindow && !mainWindow.isDestroyed()) {
    return screen.getDisplayMatching(mainWindow.getBounds())
  }
  const cursor = screen.getCursorScreenPoint()
  return screen.getDisplayNearestPoint(cursor)
}

function applySnapGridLayout(): void {
  if (!gridWindow || gridWindow.isDestroyed()) return
  gridWindow.webContents
    .executeJavaScript(`window.setSnapLayout && window.setSnapLayout(${BAR_WIDTH})`)
    .catch(() => {})
}

function syncSnapGridToOverlayDisplay(): void {
  if (!gridWindow || gridWindow.isDestroyed()) return
  const { workArea } = getOverlayDisplay()
  const current = gridWindow.getBounds()
  if (
    current.x !== workArea.x ||
    current.y !== workArea.y ||
    current.width !== workArea.width ||
    current.height !== workArea.height
  ) {
    gridWindow.setBounds(workArea)
    applySnapGridLayout()
  }
}

// Manual window drag — works reliably with frameless + setIgnoreMouseEvents
ipcMain.on(IPC.START_WINDOW_DRAG, (event, deltaX: number, deltaY: number) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (win && !win.isDestroyed()) {
    const current = win.getBounds()
    const proposed = {
      x: Math.round(current.x + deltaX),
      y: Math.round(current.y + deltaY),
      width: current.width,
      height: current.height,
    }
    const display = screen.getDisplayMatching(proposed)
    const wa = display.workArea
    const nextX = Math.max(wa.x, Math.min(proposed.x, wa.x + wa.width - current.width))
    const nextY = Math.max(wa.y, Math.min(proposed.y, wa.y + wa.height - current.height))
    // Vertical is handled in two phases in the renderer: window first (until macOS clamps),
    // then CSS translateY within the window — so deltaY here is always within allowed range
    win.setPosition(nextX, nextY)
    lastWindowBounds = win.getBounds()
    if (gridWindow && !gridWindow.isDestroyed() && gridWindow.isVisible()) {
      syncSnapGridToOverlayDisplay()
    }
  }
})

ipcMain.on(IPC.RESET_WINDOW_POSITION, () => {
  resetWindowPosition()
})

// ─── Snap grid overlay window ───

function getOrCreateGridWindow(): BrowserWindow {
  if (gridWindow && !gridWindow.isDestroyed()) return gridWindow

  const { workArea } = getOverlayDisplay()

  gridWindow = new BrowserWindow({
    x: workArea.x,
    y: workArea.y,
    width: workArea.width,
    height: workArea.height,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    focusable: false,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  })
  gridWindow.setIgnoreMouseEvents(true)
  gridWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  gridWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(SNAP_GRID_HTML)}`)
  gridWindow.webContents.on('did-finish-load', () => {
    applySnapGridLayout()
  })
  return gridWindow
}

ipcMain.on(IPC.SHOW_SNAP_GRID, () => {
  const win = getOrCreateGridWindow()
  syncSnapGridToOverlayDisplay()
  applySnapGridLayout()
  win.show()
})

ipcMain.on(IPC.HIDE_SNAP_GRID, () => {
  if (gridWindow && !gridWindow.isDestroyed()) {
    gridWindow.hide()
  }
})

ipcMain.on(IPC.UPDATE_SNAP_ZONE, (_, zone: 'left' | 'center' | 'right') => {
  if (gridWindow && !gridWindow.isDestroyed() && gridWindow.isVisible()) {
    gridWindow.webContents
      .executeJavaScript(`window.setSnapZone && window.setSnapZone(${JSON.stringify(zone)})`)
      .catch(() => {})
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

ipcMain.handle(IPC.BTW_PROMPT, async (_event, opts: BtwOptions) => {
  log(`IPC BTW_PROMPT: btwId=${opts.btwId}`)

  const BTW_SYSTEM_PROMPT = [
    '<system-reminder>',
    'This is a lightweight side question. Keep your answer concise.',
    'You may use tools if truly needed, but use no more than 3 tool calls total.',
    'Prefer answering from existing knowledge over reaching for tools.',
    '</system-reminder>',
  ].join(' ')

  // Use a temp directory so the btw session isn't saved
  // alongside the user's real project sessions.
  const { mkdtempSync, rmSync } = require('fs')
  const { tmpdir } = require('os')
  const btwDir = mkdtempSync(join(tmpdir(), 'clui-btw-'))

  const cleanupBtwDir = () => {
    try { rmSync(btwDir, { recursive: true, force: true }) } catch {}
    // Also remove the Claude session transcript dir that gets created under
    // ~/.claude/projects/<encoded-btwDir>/ — these are ephemeral and would
    // accumulate indefinitely otherwise.
    try {
      const encodedBtwDir = encodeProjectPath(btwDir)
      const claudeSessionDir = join(homedir(), '.claude', 'projects', encodedBtwDir)
      rmSync(claudeSessionDir, { recursive: true, force: true })
    } catch {}
  }

  controlPlane.startBtwRun(
    opts.btwId,
    {
      prompt: opts.question,
      projectPath: btwDir,
      maxTurns: 5,
      systemPrompt: BTW_SYSTEM_PROMPT,
    },
    (text) => broadcast(IPC.BTW_EVENT, { btwId: opts.btwId, type: 'chunk', text }),
    ()     => { broadcast(IPC.BTW_EVENT, { btwId: opts.btwId, type: 'done' }); cleanupBtwDir() },
    (msg)  => { broadcast(IPC.BTW_EVENT, { btwId: opts.btwId, type: 'error', errorMessage: msg }); cleanupBtwDir() },
  )
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

const COMPACTION_PREFIX = '__COMPACTION_DATA__'
const LOCAL_COMMAND_PREFIX = '__LOCAL_COMMAND_DATA__'

interface LocalCommandHistoryPayload {
  commandName: string
  args?: string
  output?: string
}

type LocalCommandHistoryEntry =
  | { kind: 'caveat' }
  | { kind: 'command'; commandName: string; args?: string }
  | { kind: 'stdout'; output: string }

function extractHistoryTextContent(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .filter((block: any) => block?.type === 'text' && block.text)
      .map((block: any) => block.text)
      .join('\n')
  }
  return ''
}

function parseHistoryTimestamp(value: unknown): number {
  if (typeof value !== 'string' && typeof value !== 'number') return Date.now()
  const timestamp = new Date(value).getTime()
  return Number.isFinite(timestamp) ? timestamp : Date.now()
}

function extractTaggedHistoryValue(text: string, tag: string): string | null {
  const match = text.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, 'i'))
  if (!match) return null
  return match[1].replace(/\r\n?/g, '\n').trim()
}

function normalizeLocalCommandName(commandName: string): string {
  const trimmed = commandName.trim()
  if (!trimmed) return 'command'
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`
}

function parseLocalCommandHistoryEntry(text: string): LocalCommandHistoryEntry | null {
  const trimmed = text.trim()
  if (!trimmed) return null

  if (extractTaggedHistoryValue(trimmed, 'local-command-caveat') !== null) {
    return { kind: 'caveat' }
  }

  const commandName = extractTaggedHistoryValue(trimmed, 'command-name')
  if (commandName !== null) {
    const args = extractTaggedHistoryValue(trimmed, 'command-args')
    return {
      kind: 'command',
      commandName: normalizeLocalCommandName(commandName),
      args: args ? args : undefined,
    }
  }

  const output = extractTaggedHistoryValue(trimmed, 'local-command-stdout')
  if (output !== null) {
    return { kind: 'stdout', output }
  }

  return null
}

function isCompactLocalCommand(commandName: string): boolean {
  return commandName.trim().replace(/^\//, '').toLowerCase() === 'compact'
}

function isCompactLocalCommandOutput(output: string): boolean {
  return /^compacted\b/i.test(output.trim())
}

function isSyntheticCompactionHistoryEntry(obj: any, text: string): boolean {
  if (!text) return false

  if (obj?.isSynthetic === true && text.startsWith('This session is being continued from a previous conversation that ran out of context.')) {
    return true
  }

  return false
}

function buildCompactionHistoryContent(obj: any): string {
  const compactMetadata = obj?.compact_metadata && typeof obj.compact_metadata === 'object'
    ? obj.compact_metadata
    : obj?.data?.compact_metadata && typeof obj.data.compact_metadata === 'object'
      ? obj.data.compact_metadata
      : undefined

  const payload = {
    state: 'completed',
    message: 'Conversation compacted.',
    summary: typeof obj?.summary === 'string'
      ? obj.summary
      : typeof obj?.data?.summary === 'string'
        ? obj.data.summary
        : undefined,
    trigger: typeof obj?.trigger === 'string'
      ? obj.trigger
      : typeof obj?.data?.trigger === 'string'
        ? obj.data.trigger
        : typeof compactMetadata?.trigger === 'string'
          ? compactMetadata.trigger
          : undefined,
  }

  return COMPACTION_PREFIX + JSON.stringify(payload)
}

function buildLocalCommandHistoryContent(payload: LocalCommandHistoryPayload): string {
  return LOCAL_COMMAND_PREFIX + JSON.stringify(payload)
}

function extractSessionFirstMessage(obj: any): string | null {
  const text = extractHistoryTextContent(obj?.message?.content).trim()
  if (!text) return null
  if (isSyntheticCompactionHistoryEntry(obj, text)) return null
  if (parseLocalCommandHistoryEntry(text)) return null
  return text.substring(0, 100)
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
              meta.firstMessage = extractSessionFirstMessage(obj)
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
      try {
        if (d.includes('clui-btw-')) return false // skip btw ephemeral sessions
        return statSync(join(projectsRoot, d)).isDirectory()
      } catch { return false }
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

        const meta: { validated: boolean; slug: string | null; firstMessage: string | null; lastTimestamp: string | null; cwd: string | null } = {
          validated: false, slug: null, firstMessage: null, lastTimestamp: null, cwd: null,
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
              // Extract the real working directory — present in every JSONL entry
              if (obj.cwd && !meta.cwd) meta.cwd = obj.cwd
              if (obj.type === 'user' && !meta.firstMessage) {
                meta.firstMessage = extractSessionFirstMessage(obj)
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
            // Prefer the real cwd from the JSONL; fall back to encoded dir for very old sessions
            projectPath: meta.cwd || encodedDir,
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
    let pendingLocalCommand: (LocalCommandHistoryPayload & { timestamp: number }) | null = null
    let suppressNextCompactStdout = false

    const flushPendingLocalCommand = (timestamp?: number) => {
      if (!pendingLocalCommand) return

      const { timestamp: pendingTimestamp, ...payload } = pendingLocalCommand
      pendingLocalCommand = null
      if (isCompactLocalCommand(payload.commandName)) {
        suppressNextCompactStdout = true
        return
      }

      messages.push({
        role: 'system',
        content: buildLocalCommandHistoryContent(payload),
        timestamp: timestamp ?? pendingTimestamp,
      })
    }

    await new Promise<void>((resolve) => {
      const rl = createInterface({ input: createReadStream(filePath) })
      rl.on('line', (line: string) => {
        try {
          const obj = JSON.parse(line)
          if (obj.type === 'system' && obj.subtype === 'compact_boundary') {
            flushPendingLocalCommand()
            messages.push({
              role: 'system',
              content: buildCompactionHistoryContent(obj),
              timestamp: parseHistoryTimestamp(obj.timestamp),
            })
            return
          }

          if (obj.type === 'user') {
            const text = extractHistoryTextContent(obj.message?.content)
            const timestamp = parseHistoryTimestamp(obj.timestamp)
            const localCommand = parseLocalCommandHistoryEntry(text)

            if (localCommand) {
              if (localCommand.kind === 'caveat') return

              if (localCommand.kind === 'command') {
                flushPendingLocalCommand()
                suppressNextCompactStdout = false
                pendingLocalCommand = {
                  commandName: localCommand.commandName,
                  args: localCommand.args,
                  timestamp,
                }
                return
              }

              if (pendingLocalCommand) {
                pendingLocalCommand = {
                  ...pendingLocalCommand,
                  output: localCommand.output,
                }
                flushPendingLocalCommand(timestamp)
              } else if (suppressNextCompactStdout && isCompactLocalCommandOutput(localCommand.output)) {
                suppressNextCompactStdout = false
              } else if (localCommand.output) {
                messages.push({ role: 'system', content: localCommand.output, timestamp })
              }
              return
            }

            flushPendingLocalCommand()
            if (isSyntheticCompactionHistoryEntry(obj, text)) return
            if (text) {
              messages.push({ role: 'user', content: text, timestamp })
            }
          } else if (obj.type === 'assistant') {
            flushPendingLocalCommand()
            const content = obj.message?.content
            if (Array.isArray(content)) {
              for (const block of content) {
                if (block.type === 'text' && block.text) {
                  messages.push({ role: 'assistant', content: block.text, timestamp: parseHistoryTimestamp(obj.timestamp) })
                } else if (block.type === 'tool_use' && block.name) {
                  messages.push({
                    role: 'tool',
                    content: '',
                    toolName: block.name,
                    toolId: block.id || undefined,
                    timestamp: parseHistoryTimestamp(obj.timestamp),
                  })
                }
              }
            }
          }
        } catch {}
      })
      rl.on('close', () => {
        flushPendingLocalCommand()
        resolve()
      })
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

ipcMain.handle(IPC.LIST_DIR, async (_e, dirPath: string) => {
  try {
    // Normalize and resolve the path to prevent traversal attacks
    const resolved = resolve(normalize(dirPath))
    // Constrain to user's home directory
    const home = homedir()
    if (!resolved.startsWith(home)) return []
    if (!existsSync(resolved)) return []

    const entries = await readdir(resolved, { withFileTypes: true })
    const results: Array<{ name: string; isDirectory: boolean }> = []
    for (const entry of entries) {
      // Skip hidden files/folders
      if (entry.name.startsWith('.')) continue
      results.push({ name: entry.name, isDirectory: entry.isDirectory() })
    }
    // Sort: directories first, then alphabetical
    results.sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
      return a.name.localeCompare(b.name)
    })
    return results
  } catch {
    return []
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

ipcMain.handle(IPC.LIST_INSTALLED_TERMINALS, async () => {
  return (await getInstalledTerminals()).map(({ id, label }) => ({ id, label }))
})

ipcMain.handle(IPC.OPEN_IN_TERMINAL, async (_event, arg: string | null | { sessionId?: string | null; projectPath?: string; terminalId?: PreferredTerminalId | TerminalId | null }) => {

  // Support both old (string) and new ({ sessionId, projectPath }) calling convention
  let sessionId: string | null = null
  let projectPath: string = homedir()
  let terminalId: PreferredTerminalId | TerminalId | null = null
  if (typeof arg === 'string') {
    sessionId = arg
  } else if (arg && typeof arg === 'object') {
    sessionId = arg.sessionId ?? null
    projectPath = arg.projectPath && arg.projectPath !== '~' ? arg.projectPath : homedir()
    terminalId = arg.terminalId ?? null
  }

  const terminal = await findInstalledTerminal(terminalId)
  const logLabel = terminal ? terminal.label : terminalId && terminalId !== 'auto' ? `macOS default (fallback from ${terminalId})` : 'macOS default'

  try {
    if (terminal) {
      await launchTerminal(terminal, sessionId, projectPath)
    } else {
      await launchDefaultTerminal(sessionId, projectPath)
    }
    log(`Opened terminal with ${logLabel}: ${buildClaudeShellCommand(projectPath, sessionId)}`)
    return true
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    log(`Failed to open terminal (${logLabel}): ${message}`)
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

  // Register custom protocol for serving local file thumbnails to the renderer.
  // Usage: <img src="clui-local:///path/to/image.png" />
  protocol.handle('clui-local', (request) => {
    const filePath = decodeURIComponent(new URL(request.url).pathname)
    return net.fetch(`file://${filePath}`)
  })

  // Request permissions upfront so the user is never interrupted mid-session.
  await requestPermissions()

  // Skill provisioning — non-blocking, streams status to renderer
  ensureSkills((status: SkillStatus) => {
    log(`Skill ${status.name}: ${status.state}${status.error ? ` — ${status.error}` : ''}`)
    broadcast(IPC.SKILL_STATUS, status)
  }).catch((err: Error) => log(`Skill provisioning error: ${err.message}`))

  void refreshInstalledTerminals().catch((err) => {
    const message = err instanceof Error ? err.message : String(err)
    log(`Terminal discovery warmup failed: ${message}`)
  })

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
        click: () => { setImmediate(() => { forceQuit = true; autoUpdater.quitAndInstall() }) },
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
    // Defer quitAndInstall so the IPC response is sent before the app quits.
    // Calling it synchronously inside handle() deadlocks: the renderer awaits
    // the response while quitAndInstall() tries to close the window mid-reply.
    setImmediate(() => {
      forceQuit = true
      autoUpdater.quitAndInstall()
    })
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
