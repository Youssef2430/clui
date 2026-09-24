import type { PillThread } from "../../orchestrator/packages/shared/src/gluiPill"
import type { ProviderId, ProviderInfo } from '../shared/providers'
import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../shared/types'
import type {
  RunOptions,
  NormalizedEvent,
  HealthReport,
  EnrichedError,
  Attachment,
  SessionMeta,
  CatalogPlugin,
  SessionLoadMessage,
  BtwOptions,
  BtwEvent,
  SearchResult,
  SearchIndexStatus,
  PreferredTerminalId,
  TerminalInstallation,
} from '../shared/types'
import type { AgentModelSettings } from '../shared/models'
import type { GlassUpdate } from '../shared/glass'

export interface GLUIAPI {
  getWorkspaceInfo(directory: string): Promise<{ branch: string | null; root: string | null }>
  attachThread(tabId: string, sessionId: string): Promise<void>
  forkThread(tabId: string): Promise<{ tabId: string; sessionId: string; provider: ProviderId; projectPath: string }>
  workspaceHistory(provider?: ProviderId, projectPath?: string): Promise<SessionMeta[]>
  loadEarlierHistory(tabId: string): Promise<void>
  onThreadSnapshot(callback: (tabId: string, snapshot: PillThread) => void): () => void
  // ─── Request-response (renderer → main) ───
  listProviders(): Promise<ProviderInfo[]>
  setProvider(tabId: string, provider: ProviderId): Promise<void>
  respondInput(tabId: string, questionId: string, answers: Record<string, { answers: string[] }>): Promise<boolean>
  start(): Promise<{ providers: ProviderInfo[]; version: string; auth: { email?: string; subscriptionType?: string; authMethod?: string }; mcpServers: string[]; projectPath: string; homePath: string; modelSettings: AgentModelSettings }>
  createTab(provider?: ProviderId): Promise<{ tabId: string }>
  prompt(tabId: string, requestId: string, options: RunOptions): Promise<void>
  cancel(requestId: string): Promise<boolean>
  stopTab(tabId: string): Promise<boolean>
  retry(tabId: string, requestId: string, options: RunOptions): Promise<void>
  status(): Promise<HealthReport>
  tabHealth(): Promise<HealthReport>
  closeTab(tabId: string): Promise<void>
  selectDirectory(): Promise<string | null>
  openExternal(url: string): Promise<boolean>
  openInTerminal(sessionId: string | null, projectPath?: string, terminalId?: PreferredTerminalId | null, provider?: ProviderId): Promise<boolean>
  listInstalledTerminals(): Promise<TerminalInstallation[]>
  attachFiles(): Promise<Attachment[] | null>
  takeScreenshot(): Promise<Attachment | null>
  pasteImage(dataUrl: string): Promise<Attachment | null>
  transcribeAudio(audioBase64: string): Promise<{ error: string | null; errorType?: string; transcript: string | null }>
  fixWhisper(): Promise<{ ok: boolean; error?: string }>
  getDiagnostics(): Promise<any>
  respondPermission(tabId: string, questionId: string, optionId: string): Promise<boolean>
  initSession(tabId: string): void
  resetTabSession(tabId: string): void
  listSessions(projectPath?: string, provider?: ProviderId): Promise<SessionMeta[]>
  listAllSessions(provider?: ProviderId): Promise<SessionMeta[]>
  loadSession(sessionId: string, projectPath?: string, provider?: ProviderId): Promise<SessionLoadMessage[]>
  getToolResults(sessionId: string, projectPath: string, provider?: ProviderId): Promise<Record<string, string>>
  getContext(sessionId: string, projectPath: string, sessionData?: any, provider?: ProviderId): Promise<any>
  getModelSettings(projectPath?: string, provider?: ProviderId): Promise<AgentModelSettings>
  listDir(dirPath: string): Promise<Array<{ name: string; isDirectory: boolean }>>
  fetchMarketplace(forceRefresh?: boolean): Promise<{ plugins: CatalogPlugin[]; error: string | null; targets?: Array<{ id: string; name: string }> }>
  listInstalledPlugins(): Promise<string[]>
  installPlugin(repo: string, pluginName: string, marketplace: string, sourcePath?: string, isSkillMd?: boolean): Promise<{ ok: boolean; error?: string }>
  uninstallPlugin(pluginName: string): Promise<{ ok: boolean; error?: string }>
  setPermissionMode(mode: string): void
  btwPrompt(opts: BtwOptions): Promise<void>
  onBtwEvent(callback: (event: BtwEvent) => void): () => void
  // ─── Search ───
  searchSessions(query: string, provider?: ProviderId): Promise<SearchResult[]>
  triggerSearchIndex(): void
  onSearchIndexStatus(cb: (status: SearchIndexStatus) => void): () => void

  getTheme(): Promise<{ isDark: boolean }>
  updateGlass(update: GlassUpdate): Promise<boolean>
  onThemeChange(callback: (isDark: boolean) => void): () => void

  // ─── Window management ───
  resizeHeight(height: number): void
  setWindowWidth(width: number): void
  animateHeight(from: number, to: number, durationMs: number): Promise<void>
  hideWindow(): void
  isVisible(): Promise<boolean>
  /** OS-level click-through for transparent window regions */
  setIgnoreMouseEvents(ignore: boolean, options?: { forward?: boolean }): void
  /** Manual window drag for frameless windows */
  startWindowDrag(deltaX: number, deltaY: number): void
  /** Reset overlay to its default bottom-center position */
  resetWindowPosition(): void
  /** Show the full-screen snap grid overlay window */
  showSnapGrid(): void
  /** Hide the snap grid overlay window */
  hideSnapGrid(): void
  /** Update which snap zone is highlighted in the grid */
  updateSnapZone(zone: 'left' | 'center' | 'right'): void

  // ─── Event listeners (main → renderer) ───
  onEvent(callback: (tabId: string, event: NormalizedEvent) => void): () => void
  onTabStatusChange(callback: (tabId: string, newStatus: string, oldStatus: string) => void): () => void
  onError(callback: (tabId: string, error: EnrichedError) => void): () => void
  onSkillStatus(callback: (status: { name: string; state: string; error?: string; reason?: string }) => void): () => void
  onWindowShown(callback: () => void): () => void

  // ─── Auto-update ───
  checkForUpdate(): Promise<void>
  installUpdate(): Promise<void>
  onUpdateAvailable(callback: (info: { version: string }) => void): () => void
  onUpdateDownloaded(callback: (info: { version: string }) => void): () => void
}

const api: GLUIAPI = {
  // ─── Request-response ───
  getWorkspaceInfo: (directory) => ipcRenderer.invoke(IPC.WORKSPACE_INFO, directory),
  attachThread: (tabId, sessionId) => ipcRenderer.invoke(IPC.ATTACH_THREAD, { tabId, sessionId }),
  forkThread: (tabId) => ipcRenderer.invoke(IPC.FORK_THREAD, tabId),
  workspaceHistory: (provider, projectPath) => ipcRenderer.invoke(IPC.WORKSPACE_HISTORY, provider, projectPath),
  loadEarlierHistory: (tabId) => ipcRenderer.invoke(IPC.LOAD_EARLIER_HISTORY, tabId),
  onThreadSnapshot: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, tabId: string, snapshot: PillThread) => callback(tabId, snapshot)
    ipcRenderer.on(IPC.THREAD_SNAPSHOT, listener)
    return () => ipcRenderer.removeListener(IPC.THREAD_SNAPSHOT, listener)
  },
  listProviders: () => ipcRenderer.invoke(IPC.LIST_PROVIDERS),
  setProvider: (tabId, provider) => ipcRenderer.invoke(IPC.SET_PROVIDER, { tabId, provider }),
  respondInput: (tabId, questionId, answers) => ipcRenderer.invoke(IPC.RESPOND_INPUT, { tabId, questionId, answers }),
  start: () => ipcRenderer.invoke(IPC.START),
  createTab: (provider) => ipcRenderer.invoke(IPC.CREATE_TAB, provider),
  prompt: (tabId, requestId, options) => ipcRenderer.invoke(IPC.PROMPT, { tabId, requestId, options }),
  cancel: (requestId) => ipcRenderer.invoke(IPC.CANCEL, requestId),
  stopTab: (tabId) => ipcRenderer.invoke(IPC.STOP_TAB, tabId),
  retry: (tabId, requestId, options) => ipcRenderer.invoke(IPC.RETRY, { tabId, requestId, options }),
  status: () => ipcRenderer.invoke(IPC.STATUS),
  tabHealth: () => ipcRenderer.invoke(IPC.TAB_HEALTH),
  closeTab: (tabId) => ipcRenderer.invoke(IPC.CLOSE_TAB, tabId),
  selectDirectory: () => ipcRenderer.invoke(IPC.SELECT_DIRECTORY),
  openExternal: (url) => ipcRenderer.invoke(IPC.OPEN_EXTERNAL, url),
  openInTerminal: (sessionId, projectPath, terminalId, provider) => ipcRenderer.invoke(IPC.OPEN_IN_TERMINAL, { sessionId, projectPath, terminalId, provider }),
  listInstalledTerminals: () => ipcRenderer.invoke(IPC.LIST_INSTALLED_TERMINALS),
  attachFiles: () => ipcRenderer.invoke(IPC.ATTACH_FILES),
  takeScreenshot: () => ipcRenderer.invoke(IPC.TAKE_SCREENSHOT),
  pasteImage: (dataUrl) => ipcRenderer.invoke(IPC.PASTE_IMAGE, dataUrl),
  transcribeAudio: (audioBase64) => ipcRenderer.invoke(IPC.TRANSCRIBE_AUDIO, audioBase64),
  fixWhisper: () => ipcRenderer.invoke(IPC.FIX_WHISPER),
  getDiagnostics: () => ipcRenderer.invoke(IPC.GET_DIAGNOSTICS),
  respondPermission: (tabId, questionId, optionId) =>
    ipcRenderer.invoke(IPC.RESPOND_PERMISSION, { tabId, questionId, optionId }),
  initSession: (tabId) => ipcRenderer.send(IPC.INIT_SESSION, tabId),
  resetTabSession: (tabId) => ipcRenderer.send(IPC.RESET_TAB_SESSION, tabId),
  listSessions: (projectPath?: string, provider?: ProviderId) => ipcRenderer.invoke(IPC.LIST_SESSIONS, projectPath, provider),
  listAllSessions: (provider) => ipcRenderer.invoke(IPC.LIST_ALL_SESSIONS, provider),
  loadSession: (sessionId: string, projectPath?: string, provider?: ProviderId) => ipcRenderer.invoke(IPC.LOAD_SESSION, { sessionId, projectPath, provider }),
  getToolResults: (sessionId: string, projectPath: string, provider?: ProviderId) => ipcRenderer.invoke(IPC.GET_TOOL_RESULTS, { sessionId, projectPath, provider }),
  getContext: (sessionId: string, projectPath: string, sessionData?: any, provider?: ProviderId) => ipcRenderer.invoke(IPC.GET_CONTEXT, { sessionId, projectPath, sessionData, provider }),
  getModelSettings: (projectPath?: string, provider?: ProviderId) => ipcRenderer.invoke(IPC.GET_MODEL_SETTINGS, { projectPath, provider }),
  listDir: (dirPath: string) => ipcRenderer.invoke(IPC.LIST_DIR, dirPath),
  fetchMarketplace: (forceRefresh) => ipcRenderer.invoke(IPC.MARKETPLACE_FETCH, { forceRefresh }),
  listInstalledPlugins: () => ipcRenderer.invoke(IPC.MARKETPLACE_INSTALLED),
  installPlugin: (repo, pluginName, marketplace, sourcePath, isSkillMd) =>
    ipcRenderer.invoke(IPC.MARKETPLACE_INSTALL, { repo, pluginName, marketplace, sourcePath, isSkillMd }),
  uninstallPlugin: (pluginName) =>
    ipcRenderer.invoke(IPC.MARKETPLACE_UNINSTALL, { pluginName }),
  setPermissionMode: (mode) => ipcRenderer.send(IPC.SET_PERMISSION_MODE, mode),
  // Search
  searchSessions: (query: string, provider?: ProviderId) => ipcRenderer.invoke(IPC.SEARCH_SESSIONS, query, provider),
  triggerSearchIndex: () => ipcRenderer.send(IPC.SEARCH_BUILD_INDEX),
  onSearchIndexStatus: (cb: (status: SearchIndexStatus) => void) => {
    const handler = (_e: Electron.IpcRendererEvent, status: SearchIndexStatus) => cb(status)
    ipcRenderer.on(IPC.SEARCH_INDEX_STATUS, handler)
    return () => ipcRenderer.removeListener(IPC.SEARCH_INDEX_STATUS, handler)
  },
  btwPrompt: (opts) => ipcRenderer.invoke(IPC.BTW_PROMPT, opts),
  onBtwEvent: (callback) => {
    const handler = (_e: Electron.IpcRendererEvent, event: BtwEvent) => callback(event)
    ipcRenderer.on(IPC.BTW_EVENT, handler)
    return () => ipcRenderer.removeListener(IPC.BTW_EVENT, handler)
  },
  getTheme: () => ipcRenderer.invoke(IPC.GET_THEME),
  updateGlass: (update) => ipcRenderer.invoke(IPC.UPDATE_GLASS, update),
  onThemeChange: (callback) => {
    const handler = (_e: Electron.IpcRendererEvent, isDark: boolean) => callback(isDark)
    ipcRenderer.on(IPC.THEME_CHANGED, handler)
    return () => ipcRenderer.removeListener(IPC.THEME_CHANGED, handler)
  },

  // ─── Window management ───
  resizeHeight: (height) => ipcRenderer.send(IPC.RESIZE_HEIGHT, height),
  animateHeight: (from, to, durationMs) =>
    ipcRenderer.invoke(IPC.ANIMATE_HEIGHT, { from, to, durationMs }),
  hideWindow: () => ipcRenderer.send(IPC.HIDE_WINDOW),
  isVisible: () => ipcRenderer.invoke(IPC.IS_VISIBLE),
  setIgnoreMouseEvents: (ignore, options) =>
    ipcRenderer.send(IPC.SET_IGNORE_MOUSE_EVENTS, ignore, options || {}),
  startWindowDrag: (deltaX, deltaY) =>
    ipcRenderer.send(IPC.START_WINDOW_DRAG, deltaX, deltaY),
  resetWindowPosition: () => ipcRenderer.send(IPC.RESET_WINDOW_POSITION),
  showSnapGrid: () => ipcRenderer.send(IPC.SHOW_SNAP_GRID),
  hideSnapGrid: () => ipcRenderer.send(IPC.HIDE_SNAP_GRID),
  updateSnapZone: (zone) => ipcRenderer.send(IPC.UPDATE_SNAP_ZONE, zone),
  setWindowWidth: (width) => ipcRenderer.send(IPC.SET_WINDOW_WIDTH, width),

  // ─── Event listeners ───
  onEvent: (callback) => {
    const channels = [
      IPC.TEXT_CHUNK, IPC.TOOL_CALL, IPC.TOOL_CALL_UPDATE,
      IPC.TOOL_CALL_COMPLETE, IPC.TASK_UPDATE, IPC.TASK_COMPLETE,
      IPC.SESSION_DEAD, IPC.SESSION_INIT, IPC.ERROR, IPC.RATE_LIMIT,
    ]
    // Single unified handler — all normalized events come through one channel
    const handler = (_e: Electron.IpcRendererEvent, tabId: string, event: NormalizedEvent) => callback(tabId, event)
    ipcRenderer.on('glui:normalized-event', handler)
    return () => ipcRenderer.removeListener('glui:normalized-event', handler)
  },

  onTabStatusChange: (callback) => {
    const handler = (_e: Electron.IpcRendererEvent, tabId: string, newStatus: string, oldStatus: string) =>
      callback(tabId, newStatus, oldStatus)
    ipcRenderer.on('glui:tab-status-change', handler)
    return () => ipcRenderer.removeListener('glui:tab-status-change', handler)
  },

  onError: (callback) => {
    const handler = (_e: Electron.IpcRendererEvent, tabId: string, error: EnrichedError) =>
      callback(tabId, error)
    ipcRenderer.on('glui:enriched-error', handler)
    return () => ipcRenderer.removeListener('glui:enriched-error', handler)
  },

  onSkillStatus: (callback) => {
    const handler = (_e: Electron.IpcRendererEvent, status: any) => callback(status)
    ipcRenderer.on(IPC.SKILL_STATUS, handler)
    return () => ipcRenderer.removeListener(IPC.SKILL_STATUS, handler)
  },

  onWindowShown: (callback) => {
    const handler = () => callback()
    ipcRenderer.on(IPC.WINDOW_SHOWN, handler)
    return () => ipcRenderer.removeListener(IPC.WINDOW_SHOWN, handler)
  },

  // ─── Auto-update ───
  checkForUpdate: () => ipcRenderer.invoke(IPC.CHECK_FOR_UPDATE),
  installUpdate: () => ipcRenderer.invoke(IPC.INSTALL_UPDATE),
  onUpdateAvailable: (callback) => {
    const handler = (_e: Electron.IpcRendererEvent, info: { version: string }) => callback(info)
    ipcRenderer.on(IPC.UPDATE_AVAILABLE, handler)
    return () => ipcRenderer.removeListener(IPC.UPDATE_AVAILABLE, handler)
  },
  onUpdateDownloaded: (callback) => {
    const handler = (_e: Electron.IpcRendererEvent, info: { version: string }) => callback(info)
    ipcRenderer.on(IPC.UPDATE_DOWNLOADED, handler)
    return () => ipcRenderer.removeListener(IPC.UPDATE_DOWNLOADED, handler)
  },
}

contextBridge.exposeInMainWorld('glui', api)
