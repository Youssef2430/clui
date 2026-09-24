import { copyWithWebCitations } from '../lib/webCitations'
import type { PillThread } from "../../../orchestrator/packages/shared/src/gluiPill"
import { PROVIDERS, isProviderId, type ProviderId, type ProviderInfo } from '../../shared/providers'
import { create } from 'zustand'
import type { TabStatus, NormalizedEvent, EnrichedError, Message, TabState, Attachment, CatalogPlugin, PluginStatus, TodoTask, SearchIndexStatus } from '../../shared/types'
import { EMPTY_MODEL_SETTINGS, type AgentModelSettings } from '../../shared/models'
import { useThemeStore } from '../theme'
import notificationSrc from '../../../resources/notification.mp3'

// ─── Model settings helpers ───

export {
  findModelOption,
  getModelCommandValues,
  getModelLabel,
} from '../../shared/models'

// ─── Persisted permission mode ───

const PERMISSION_MODE_KEY = 'glui-permission-mode'

function loadPermissionMode(): 'ask' | 'auto' {
  try {
    const v = localStorage.getItem(PERMISSION_MODE_KEY)
    if (v === 'ask' || v === 'auto') return v
  } catch {}
  return 'ask'
}

function savePermissionMode(mode: 'ask' | 'auto'): void {
  try { localStorage.setItem(PERMISSION_MODE_KEY, mode) } catch {}
}

// ─── Store ───

interface StaticInfo {
  version: string
  email: string | null
  subscriptionType: string | null
  projectPath: string
  homePath: string
}

interface State {
  providers: ProviderInfo[]
  applyThreadSnapshot: (tabId: string, snapshot: PillThread) => void
  loadEarlierHistory: (tabId: string) => Promise<void>
  forkThread: () => Promise<void>
  refreshProviders: () => Promise<void>
  setProvider: (provider: ProviderId) => Promise<void>
  respondInput: (tabId: string, questionId: string, answers: Record<string, { answers: string[] }>) => Promise<void>
  tabs: TabState[]
  activeTabId: string
  /** Global expand/collapse — user-controlled, not per-tab */
  isExpanded: boolean
  /** Global info fetched on startup (not per-session) */
  staticInfo: StaticInfo | null
  /** Model choices discovered from the user's Claude settings */
  modelSettings: AgentModelSettings
  /** User's preferred model override (null = use default) */
  preferredModel: string | null
  /** Global permission mode: 'ask' shows cards, 'auto' auto-approves all tool calls */
  permissionMode: 'ask' | 'auto'

  // BTW side question state
  btwState: {
    btwId: string
    question: string
    responseText: string
    status: 'loading' | 'streaming' | 'done' | 'error'
    errorMessage?: string
  } | null

  // Marketplace state
  marketplaceOpen: boolean
  marketplaceTargets: Array<{ id: string; name: string }>
  marketplacePluginErrors: Record<string, string>
  marketplaceCatalog: CatalogPlugin[]
  marketplaceLoading: boolean
  marketplaceError: string | null
  marketplaceInstalledNames: string[]
  marketplacePluginStates: Record<string, PluginStatus>
  marketplaceSearch: string
  marketplaceFilter: string

  // Copy feedback state (shows "Copied" indicator on the message copied via shortcut)
  copiedMessageId: string | null

  // Search state
  searchPanelOpen: boolean
  searchIndexStatus: SearchIndexStatus

  // Actions
  initStaticInfo: () => Promise<void>
  refreshModelSettings: (projectPath?: string) => Promise<void>
  setPreferredModel: (model: string | null) => void
  setModelOption: (id: string, value: string | boolean) => void
  setRuntimeMode: (mode: NonNullable<TabState["runtimeMode"]>) => void
  modelSettingsError: string | null
  modelSettingsLoading: boolean
  setPermissionMode: (mode: 'ask' | 'auto') => void
  createTab: (provider?: ProviderId) => Promise<string>
  selectTab: (tabId: string) => void
  closeTab: (tabId: string) => void
  clearTab: () => void
  toggleExpanded: () => void
  toggleMarketplace: () => void
  closeMarketplace: () => void
  loadMarketplace: (forceRefresh?: boolean) => Promise<void>
  setMarketplaceSearch: (query: string) => void
  setMarketplaceFilter: (filter: string) => void
  installMarketplacePlugin: (plugin: CatalogPlugin) => Promise<void>
  uninstallMarketplacePlugin: (plugin: CatalogPlugin) => Promise<void>
  buildYourOwn: () => void
  nextTab: () => void
  prevTab: () => void
  createTabInSameFolder: () => Promise<string>
  stopActiveRun: () => void
  copyLastResponse: () => void
  /** Open/close the history picker from outside HistoryPicker component */
  historyPickerOpen: boolean
  toggleHistoryPicker: () => void
  closeHistoryPicker: () => void
  /** Search panel */
  toggleSearchPanel: () => void
  closeSearchPanel: () => void
  setSearchIndexStatus: (status: SearchIndexStatus) => void
  resumeSession: (sessionId: string, title?: string, projectPath?: string, provider?: ProviderId) => Promise<string>
  addSystemMessage: (content: string, tabId?: string) => void
  sendMessage: (prompt: string, projectPath?: string) => void
  respondPermission: (tabId: string, questionId: string, optionId: string) => Promise<void>
  addDirectory: (dir: string) => void
  removeDirectory: (dir: string) => void
  setBaseDirectory: (dir: string) => void
  addAttachments: (attachments: Attachment[]) => void
  removeAttachment: (attachmentId: string) => void
  clearAttachments: () => void
  // BTW actions
  submitBtw: (question: string) => void
  appendBtwChunk: (btwId: string, text: string) => void
  setBtwDone: (btwId: string) => void
  setBtwError: (btwId: string, message: string) => void
  dismissBtw: () => void
  handleNormalizedEvent: (tabId: string, event: NormalizedEvent) => void
  handleStatusChange: (tabId: string, newStatus: string, oldStatus: string) => void
  handleError: (tabId: string, error: EnrichedError) => void
}

let msgCounter = 0
const nextMsgId = () => `msg-${++msgCounter}`

// ─── Notification sound (plays when task completes while window is hidden) ───
const notificationAudio = new Audio(notificationSrc)
notificationAudio.volume = 1.0

async function playNotificationIfHidden(): Promise<void> {
  if (!useThemeStore.getState().soundEnabled) return
  try {
    const visible = await window.glui.isVisible()
    if (!visible) {
      notificationAudio.currentTime = 0
      notificationAudio.play().catch(() => {})
    }
  } catch {}
}

// ─── Todo/Task helpers ───

const TODO_PREFIX = '__TODO_DATA__'
const COMPACTION_PREFIX = '__COMPACTION_DATA__'

type CompactionNoticeState = 'running' | 'completed' | 'failed'

interface CompactionNoticePayload {
  state: CompactionNoticeState
  message: string
  summary?: string
  trigger?: string
  compactedMessages?: number
}

function tryParseJson(s?: string): Record<string, unknown> | null {
  if (!s) return null
  try { return JSON.parse(s) } catch { return null }
}

/** Parse TodoWrite input into a flat todo list. Each call contains the full state. */
function parseTodoWriteInput(input: Record<string, unknown>): Record<string, TodoTask> {
  const todos: Record<string, TodoTask> = {}
  const items = Array.isArray(input.todos) ? input.todos : []
  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    if (!item || typeof item !== 'object') continue
    const id = String(item.id ?? i + 1)
    const VALID_STATUSES = new Set(['pending', 'in_progress', 'completed', 'deleted'])
    const rawStatus = typeof item.status === 'string' ? item.status : ''
    const status: TodoTask['status'] = VALID_STATUSES.has(rawStatus)
      ? (rawStatus as TodoTask['status'])
      : 'pending'
    todos[id] = {
      id,
      subject: String(item.content || item.subject || item.title || ''),
      description: item.description ? String(item.description) : undefined,
      status,
    }
  }
  return todos
}

function buildTodoContent(todos: Record<string, TodoTask>): string {
  return TODO_PREFIX + JSON.stringify(Object.values(todos))
}

function buildCompactionContent(payload: CompactionNoticePayload): string {
  return COMPACTION_PREFIX + JSON.stringify(payload)
}

function upsertCompactionNotice(tab: TabState, payload: CompactionNoticePayload): void {
  const content = buildCompactionContent(payload)

  if (tab.compactionMessageId) {
    tab.messages = tab.messages.map((m) => (
      m.id === tab.compactionMessageId
        ? { ...m, content, timestamp: Date.now() }
        : m
    ))
    return
  }

  const msg: Message = {
    id: nextMsgId(),
    role: 'system',
    content,
    timestamp: Date.now(),
  }
  tab.messages = [...tab.messages, msg]
  tab.compactionMessageId = msg.id
}

function finalizeCompactionNotice(tab: TabState, payload: Omit<CompactionNoticePayload, 'state'> & { state?: CompactionNoticeState }): void {
  if (!tab.compactionMessageId && !payload.summary && !payload.message) return
  upsertCompactionNotice(tab, {
    ...payload,
    state: payload.state || 'completed',
  })
  tab.compactionMessageId = null
}

function makeLocalTab(provider: ProviderId = loadDefaultProvider()): TabState {
  return {
    id: crypto.randomUUID(),
    provider,
    preferredModel: null,
    providerSessionId: null,
    status: 'idle',
    activeRequestId: null,
    hasUnread: false,
    currentActivity: '',
    permissionQueue: [],
    inputRequests: [],
    permissionDenied: null,
    attachments: [],
    messages: [],
    hasMoreHistory: false,
    historyLoading: false,
    historyError: null,
    title: 'New Tab',
    lastResult: null,
    sessionModel: null,
    sessionTools: [],
    sessionMcpServers: [],
    sessionSkills: [],
    sessionVersion: null,
    queuedPrompts: [],
    workingDirectory: '~',
    hasChosenDirectory: false,
    additionalDirs: [],
    todos: {},
    todoMessageId: null,
    isCompacting: false,
    compactionMessageId: null,
  }
}

async function ensureBackendTabRegistered(tabId: string): Promise<string> {
  const existingRegistration = backendTabRegistrations.get(tabId)
  if (existingRegistration) {
    return existingRegistration
  }

  const registration = (async () => {
    const currentTab = useSessionStore.getState().tabs.find((tab) => tab.id === tabId)
    if (!currentTab) {
      return tabId
    }

    try {
      const health = await window.glui.tabHealth()
      if (health?.tabs?.some((tab) => tab.tabId === tabId)) {
        return tabId
      }
    } catch {
      // If a run is already active, prefer the current tab ID over creating a
      // second backend tab during a transient health-check failure.
      if (currentTab.activeRequestId || currentTab.status === 'running' || currentTab.status === 'connecting') {
        return tabId
      }
    }

    const { tabId: backendTabId } = await window.glui.createTab(currentTab.provider)
    useSessionStore.setState((s) => ({
      tabs: s.tabs.map((t) => (
        t.id === tabId
          ? {
              ...t,
              id: backendTabId,
              activeRequestId: null,
              currentActivity: '',
              status: 'idle',
            }
          : t
      )),
      activeTabId: s.activeTabId === tabId ? backendTabId : s.activeTabId,
    }))
    return backendTabId
  })()

  backendTabRegistrations.set(tabId, registration)
  return registration.finally(() => {
    if (backendTabRegistrations.get(tabId) === registration) {
      backendTabRegistrations.delete(tabId)
    }
  })
}

const backendTabRegistrations = new Map<string, Promise<string>>()

function loadDefaultProvider(): ProviderId {
  try { const value = localStorage.getItem('glui-default-provider'); if (isProviderId(value)) return value } catch {}
  return 'claude'
}

let startupInfo: ReturnType<typeof window.glui.start> | undefined
const initialTab = makeLocalTab()

export const useSessionStore = create<State>((set, get) => ({
  providers: [],
  refreshProviders: async () => { set({ providers: await window.glui.listProviders() }) },
  applyThreadSnapshot: (tabId, snapshot) => {
    const previous = get().tabs.find(t => t.id === tabId)
    if (previous?.status === 'running' && snapshot.status === 'completed') void playNotificationIfHidden()
    const oldMessages = new Map(previous?.messages.map(message => [message.id, message]))
    const messages = snapshot.messages.map(message => {
      const old = oldMessages.get(message.id)
      const next = { ...message, attachments: message.attachments ?? old?.attachments }
      return old && Object.keys(next).every(key => key === 'attachments' || key === 'contextChange' || key === 'sources'
        ? JSON.stringify(old[key]) === JSON.stringify(next[key])
        : old[key as keyof Message] === next[key as keyof Message]) ? old : next
    })
    set(s => ({ tabs: s.tabs.map(t => t.id === tabId ? {
      ...t, provider: snapshot.provider, providerSessionId: `glui:${snapshot.threadId}`,
      title: snapshot.title, sessionModel: snapshot.model, modelOptions: t.modelOptions ?? snapshot.modelOptions, runtimeMode: t.runtimeMode ?? snapshot.runtimeMode, status: snapshot.status,
      workingDirectory: snapshot.workspaceRoot || t.workingDirectory,
      activeRequestId: snapshot.activeRequestId, messages, hasMoreHistory: snapshot.hasMoreHistory,
      permissionQueue: snapshot.permissions, inputRequests: snapshot.questions,
      queuedPrompts: snapshot.queuedPrompts, currentActivity: snapshot.status === 'running' ? 'Working…' : snapshot.status === 'connecting' ? 'Starting…' : '',
      hasUnread: t.id !== s.activeTabId && snapshot.status === 'completed' ? true : t.hasUnread,
    } : t) }))
  },
  loadEarlierHistory: async (tabId) => {
    const tab = get().tabs.find(t => t.id === tabId)
    if (!tab?.providerSessionId?.startsWith('glui:') || !tab.hasMoreHistory || tab.historyLoading) return
    const sessionId = tab.providerSessionId
    const update = (fields: Pick<TabState, 'historyLoading' | 'historyError'>) => {
      set(s => ({ tabs: s.tabs.map(t => t.id === tabId && t.providerSessionId === sessionId ? { ...t, ...fields } : t) }))
    }
    update({ historyLoading: true, historyError: null })
    try {
      await window.glui.loadEarlierHistory(tabId)
      update({ historyLoading: false, historyError: null })
    } catch (error) {
      update({ historyLoading: false, historyError: error instanceof Error ? error.message : String(error) })
    }
  },
  forkThread: async () => {
    const current = get().tabs.find(t => t.id === get().activeTabId)
    if (!current) return
    const branch = await window.glui.forkThread(current.id)
    set(s => ({ tabs: [...s.tabs, { ...makeLocalTab(branch.provider), id: branch.tabId, providerSessionId: branch.sessionId, workingDirectory: branch.projectPath, hasChosenDirectory: true, title: 'Branch' }], activeTabId: branch.tabId, isExpanded: true }))
    await window.glui.attachThread(branch.tabId, branch.sessionId)
  },
  setProvider: async (provider) => {
    const current = get().tabs.find(t => t.id === get().activeTabId)
    if (!current || current.provider === provider) return
    if (current.status === 'running' || current.status === 'connecting') return
    const id = await ensureBackendTabRegistered(current.id)
    await window.glui.setProvider(id, provider)
    set(s => ({ tabs: s.tabs.map(t => t.id === id ? { ...t, provider, preferredModel: null, sessionModel: null, modelOptions: undefined, runtimeMode: undefined } : t), modelSettings: EMPTY_MODEL_SETTINGS }))
    try { localStorage.setItem('glui-default-provider', provider) } catch {}
    void get().refreshModelSettings(current.workingDirectory === '~' ? undefined : current.workingDirectory)
  },
  respondInput: async (tabId, questionId, answers) => {
    const accepted = await window.glui.respondInput(tabId, questionId, answers)
    if (!accepted) throw new Error('This question is no longer active')
    set(s => ({ tabs: s.tabs.map(t => t.id === tabId ? { ...t, inputRequests: t.inputRequests.filter(q => q.questionId !== questionId) } : t) }))
  },
  tabs: [initialTab],
  activeTabId: initialTab.id,
  isExpanded: false,
  staticInfo: null,
  preferredModel: null,
  permissionMode: loadPermissionMode(),
  btwState: null,

  // History picker
  historyPickerOpen: false,

  // Copy feedback
  copiedMessageId: null,

  // Search
  searchPanelOpen: false,
  searchIndexStatus: { state: 'idle' } as SearchIndexStatus,

  // Model settings
  modelSettings: EMPTY_MODEL_SETTINGS,
  modelSettingsError: null,
  modelSettingsLoading: false,

  // Marketplace
  marketplaceOpen: false,
  marketplaceCatalog: [],
  marketplaceTargets: [],
  marketplacePluginErrors: {},
  marketplaceLoading: false,
  marketplaceError: null,
  marketplaceInstalledNames: [],
  marketplacePluginStates: {},
  marketplaceSearch: '',
  marketplaceFilter: 'All',

  initStaticInfo: async () => {
    try {
      const result = await (startupInfo ||= window.glui.start())
      set({
        providers: result.providers || [],
        staticInfo: {
          version: result.version || 'unknown',
          email: result.auth?.email || null,
          subscriptionType: result.auth?.subscriptionType || null,
          projectPath: result.projectPath || '~',
          homePath: result.homePath || '~',
        },
        modelSettings: get().tabs.find(t => t.id === get().activeTabId)?.provider === 'claude' ? result.modelSettings || EMPTY_MODEL_SETTINGS : get().modelSettings,
      })
      const active = get().tabs.find(t => t.id === get().activeTabId)
      if (active && !result.providers?.find(p => p.id === active.provider)?.installed) {
        const available = result.providers?.find(p => p.installed)
        if (available) await get().setProvider(available.id)
      }
      // Sync persisted permission mode to the main process
      const mode = get().permissionMode
      if (mode !== 'ask') {
        window.glui.setPermissionMode(mode)
      }
    } catch {}
  },

  refreshModelSettings: async (projectPath) => {
    const tab = get().tabs.find(t => t.id === get().activeTabId)
    if (!tab) return
    set({ modelSettingsLoading: true, modelSettingsError: null })
    try {
      const modelSettings = await window.glui.getModelSettings(projectPath, tab.provider)
      const active = get().tabs.find(t => t.id === get().activeTabId)
      if (active?.id === tab.id && active.provider === tab.provider && active.workingDirectory === tab.workingDirectory) set({ modelSettings: modelSettings || EMPTY_MODEL_SETTINGS, modelSettingsLoading: false })
    } catch (error) { if (get().activeTabId === tab.id) set({ modelSettingsLoading: false, modelSettingsError: String(error) }) }
  },
  setPreferredModel: (model) => {
    set(s => ({ tabs: s.tabs.map(t => t.id === s.activeTabId ? { ...t, preferredModel: model, modelOptions: [] } : t) }))
  },

  setModelOption: (id, value) => {
    set(s => ({ tabs: s.tabs.map(t => t.id === s.activeTabId ? { ...t, modelOptions: [...(t.modelOptions ?? []).filter(o => o.id !== id), { id, value }] } : t) }))
  },
  setRuntimeMode: (runtimeMode) => {
    set(s => ({ tabs: s.tabs.map(t => t.id === s.activeTabId ? { ...t, runtimeMode } : t) }))
  },
  setPermissionMode: (mode) => {
    set({ permissionMode: mode })
    savePermissionMode(mode)
    window.glui.setPermissionMode(mode)
  },

  createTab: async (provider = loadDefaultProvider()) => {
    const homeDir = get().staticInfo?.homePath || '~'
    try {
      const { tabId } = await window.glui.createTab(provider)
      const tab: TabState = {
        ...makeLocalTab(provider),
        id: tabId,
        workingDirectory: homeDir,
      }
      set((s) => ({
        tabs: [...s.tabs, tab],
        activeTabId: tab.id,
      }))
      return tabId
    } catch {
      const tab = makeLocalTab(provider)
      tab.workingDirectory = homeDir
      set((s) => ({
        tabs: [...s.tabs, tab],
        activeTabId: tab.id,
      }))
      return tab.id
    }
  },

  selectTab: (tabId) => {
    const s = get()
    if (tabId === s.activeTabId) {
      // Clicking the already-active tab: toggle global expand/collapse
      const willExpand = !s.isExpanded
      set((prev) => ({
        isExpanded: willExpand,
        marketplaceOpen: false,
        searchPanelOpen: false,
        // Expanding = reading: clear unread flag
        tabs: willExpand
          ? prev.tabs.map((t) => t.id === tabId ? { ...t, hasUnread: false } : t)
          : prev.tabs,
      }))
    } else {
      // Switching to a different tab: mark as read
      set((prev) => ({
        activeTabId: tabId,
        marketplaceOpen: false,
        searchPanelOpen: false,
        tabs: prev.tabs.map((t) =>
          t.id === tabId ? { ...t, hasUnread: false } : t
        ),
      }))
    }
  },

  toggleExpanded: () => {
    const { activeTabId, isExpanded } = get()
    const willExpand = !isExpanded
    set((s) => ({
      isExpanded: willExpand,
      marketplaceOpen: false,
      searchPanelOpen: false,
      // Expanding = reading: clear unread flag for the active tab
      tabs: willExpand
        ? s.tabs.map((t) => t.id === activeTabId ? { ...t, hasUnread: false } : t)
        : s.tabs,
    }))
  },

  toggleMarketplace: () => {
    const s = get()
    if (s.marketplaceOpen) {
      set({ marketplaceOpen: false })
    } else {
      set({ isExpanded: false, marketplaceOpen: true, searchPanelOpen: false })
      get().loadMarketplace()
    }
  },

  closeMarketplace: () => {
    set({ marketplaceOpen: false })
  },

  loadMarketplace: async (forceRefresh) => {
    set({ marketplaceLoading: true, marketplaceError: null })
    try {
      const [catalog, installed] = await Promise.all([
        window.glui.fetchMarketplace(forceRefresh),
        window.glui.listInstalledPlugins(),
      ])
      if (catalog.error && catalog.plugins.length === 0) {
        set({ marketplaceError: catalog.error, marketplaceLoading: false })
        return
      }
      const installedSet = new Set(installed.map((n) => n.toLowerCase()))
      const pluginStates: Record<string, PluginStatus> = {}
      for (const p of catalog.plugins) {
        const isInstalled = installedSet.has(p.id.toLowerCase())
        pluginStates[p.id] = isInstalled ? 'installed' : 'not_installed'
      }
      set({
        marketplaceCatalog: catalog.plugins,
        marketplaceTargets: catalog.targets ?? [],
        marketplaceInstalledNames: installed,
        marketplacePluginStates: pluginStates,
        marketplaceError: catalog.error ?? null,
        marketplaceLoading: false,
      })
    } catch (err: unknown) {
      set({
        marketplaceError: err instanceof Error ? err.message : String(err),
        marketplaceLoading: false,
      })
    }
  },

  setMarketplaceSearch: (query) => {
    set({ marketplaceSearch: query })
  },

  setMarketplaceFilter: (filter) => {
    set({ marketplaceFilter: filter })
  },

  installMarketplacePlugin: async (plugin) => {
    set(s => ({ marketplacePluginStates: { ...s.marketplacePluginStates, [plugin.id]: 'installing' }, marketplacePluginErrors: { ...s.marketplacePluginErrors, [plugin.id]: '' } }))
    try {
      const result = await window.glui.installPlugin(plugin.repo, plugin.installName, plugin.marketplace, plugin.sourcePath, plugin.isSkillMd)
      if (!result.ok) throw new Error(result.error || 'Installation failed')
      const catalog = await window.glui.fetchMarketplace()
      set(s => ({ marketplaceCatalog: catalog.plugins, marketplacePluginStates: { ...s.marketplacePluginStates, [plugin.id]: 'installed' }, marketplaceInstalledNames: [...new Set([...s.marketplaceInstalledNames, plugin.id])] }))
    } catch (error) { set(s => ({ marketplacePluginStates: { ...s.marketplacePluginStates, [plugin.id]: plugin.managed ? 'installed' : 'failed' }, marketplacePluginErrors: { ...s.marketplacePluginErrors, [plugin.id]: error instanceof Error ? error.message : String(error) } })) }
  },
  uninstallMarketplacePlugin: async (plugin) => {
    set(s => ({ marketplacePluginStates: { ...s.marketplacePluginStates, [plugin.id]: 'removing' }, marketplacePluginErrors: { ...s.marketplacePluginErrors, [plugin.id]: '' } }))
    try {
      const result = await window.glui.uninstallPlugin(plugin.installName)
      if (!result.ok) throw new Error(result.error || 'Removal failed')
      set(s => ({ marketplaceCatalog: s.marketplaceCatalog.map(p => p.id === plugin.id ? { ...p, managed: false, installedProviders: [] } : p), marketplacePluginStates: { ...s.marketplacePluginStates, [plugin.id]: 'not_installed' }, marketplaceInstalledNames: s.marketplaceInstalledNames.filter(n => n !== plugin.id) }))
    } catch (error) { set(s => ({ marketplacePluginStates: { ...s.marketplacePluginStates, [plugin.id]: 'installed' }, marketplacePluginErrors: { ...s.marketplacePluginErrors, [plugin.id]: error instanceof Error ? error.message : String(error) } })) }
  },

  buildYourOwn: () => {
    set({ marketplaceOpen: false, isExpanded: true })
    // Small delay to let the UI transition
    setTimeout(() => {
      get().sendMessage('Help me create a portable agent skill with SKILL.md that works in Claude Code, Codex, and OpenCode')
    }, 100)
  },

  nextTab: () => {
    const { tabs, activeTabId } = get()
    if (tabs.length <= 1) return
    const idx = tabs.findIndex((t) => t.id === activeTabId)
    const next = tabs[(idx + 1) % tabs.length]
    set((s) => ({
      activeTabId: next.id,
      marketplaceOpen: false,
      searchPanelOpen: false,
      tabs: s.tabs.map((t) => t.id === next.id ? { ...t, hasUnread: false } : t),
    }))
  },

  prevTab: () => {
    const { tabs, activeTabId } = get()
    if (tabs.length <= 1) return
    const idx = tabs.findIndex((t) => t.id === activeTabId)
    const prev = tabs[(idx - 1 + tabs.length) % tabs.length]
    set((s) => ({
      activeTabId: prev.id,
      marketplaceOpen: false,
      searchPanelOpen: false,
      tabs: s.tabs.map((t) => t.id === prev.id ? { ...t, hasUnread: false } : t),
    }))
  },

  createTabInSameFolder: async () => {
    const { tabs, activeTabId } = get()
    const currentTab = tabs.find((t) => t.id === activeTabId)
    const dir = currentTab?.workingDirectory || get().staticInfo?.homePath || '~'
    try {
      const { tabId } = await window.glui.createTab(currentTab?.provider)
      const tab: TabState = {
        ...makeLocalTab(currentTab?.provider),
        id: tabId,
        workingDirectory: dir,
        hasChosenDirectory: currentTab?.hasChosenDirectory ?? false,
      }
      set((s) => ({
        tabs: [...s.tabs, tab],
        activeTabId: tab.id,
      }))
      return tabId
    } catch {
      const tab = makeLocalTab(currentTab?.provider)
      tab.workingDirectory = dir
      tab.hasChosenDirectory = currentTab?.hasChosenDirectory ?? false
      set((s) => ({
        tabs: [...s.tabs, tab],
        activeTabId: tab.id,
      }))
      return tab.id
    }
  },

  stopActiveRun: () => {
    const { activeTabId, tabs } = get()
    const tab = tabs.find((t) => t.id === activeTabId)
    if (!tab) return
    if (tab.status === 'running' || tab.status === 'connecting') {
      window.glui.stopTab(activeTabId).catch(() => {})
    }
  },

  copyLastResponse: () => {
    const { activeTabId, tabs } = get()
    const tab = tabs.find((t) => t.id === activeTabId)
    if (!tab) return
    // Find the last assistant message (non-tool)
    for (let i = tab.messages.length - 1; i >= 0; i--) {
      const msg = tab.messages[i]
      if (msg.role === 'assistant' && !msg.toolName) {
        navigator.clipboard.writeText(copyWithWebCitations(msg.content, msg.sources)).catch(() => {})
        // Show "Copied" feedback on the message's CopyButton
        set({ copiedMessageId: msg.id })
        setTimeout(() => {
          // Only clear if it's still the same message (avoid races)
          if (get().copiedMessageId === msg.id) {
            set({ copiedMessageId: null })
          }
        }, 1500)
        return
      }
    }
  },

  toggleHistoryPicker: () => {
    set((s) => ({ historyPickerOpen: !s.historyPickerOpen, searchPanelOpen: false }))
  },

  closeHistoryPicker: () => {
    set({ historyPickerOpen: false })
  },

  toggleSearchPanel: () => {
    const s = get()
    if (s.searchPanelOpen) {
      set({ searchPanelOpen: false })
    } else {
      set({ isExpanded: false, searchPanelOpen: true, marketplaceOpen: false, historyPickerOpen: false })
      // Lazy-trigger indexing on first open
      if (get().tabs.find(t => t.id === get().activeTabId)?.provider === 'claude') window.glui.triggerSearchIndex()
    }
  },

  closeSearchPanel: () => set({ searchPanelOpen: false }),

  setSearchIndexStatus: (status: SearchIndexStatus) => set({ searchIndexStatus: status }),

  closeTab: (tabId) => {
    window.glui.closeTab(tabId).catch(() => {})

    const s = get()
    const remaining = s.tabs.filter((t) => t.id !== tabId)

    if (s.activeTabId === tabId) {
      if (remaining.length === 0) {
        const newTab = makeLocalTab()
        newTab.workingDirectory = get().staticInfo?.homePath || '~'
        set({ tabs: [newTab], activeTabId: newTab.id })
        void ensureBackendTabRegistered(newTab.id).catch(() => {})
        return
      }
      const closedIndex = s.tabs.findIndex((t) => t.id === tabId)
      const newActive = remaining[Math.min(closedIndex, remaining.length - 1)]
      set({ tabs: remaining, activeTabId: newActive.id })
    } else {
      set({ tabs: remaining })
    }
  },

  clearTab: () => {
    const { activeTabId } = get()
    const current = get().tabs.find(t => t.id === activeTabId)
    if (current?.status === 'running' || current?.status === 'connecting') return
    window.glui.resetTabSession(activeTabId)
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === activeTabId
          ? {
              ...t,
              messages: [],
              hasMoreHistory: false,
              historyLoading: false,
              historyError: null,
              providerSessionId: null,
              inputRequests: [],
              lastResult: null,
              currentActivity: '',
              permissionQueue: [],
              permissionDenied: null,
              queuedPrompts: [],
              todos: {},
              todoMessageId: null,
              isCompacting: false,
              compactionMessageId: null,
            }
          : t
      ),
    }))
  },

  resumeSession: async (sessionId, title, projectPath, provider = 'claude') => {
    const isEncoded = projectPath?.startsWith('-') && !projectPath.includes('/')
    const lookupDir = projectPath || get().staticInfo?.homePath || '~'
    const workingDir = isEncoded ? get().staticInfo?.homePath || '~' : lookupDir
    const { tabId } = await window.glui.createTab(provider)
    const pending: TabState = {
      ...makeLocalTab(provider), id: tabId, providerSessionId: sessionId,
      title: title || 'Resumed session', workingDirectory: workingDir,
      hasChosenDirectory: !isEncoded && !!projectPath, status: 'connecting', currentActivity: 'Loading history…',
    }
    // Select the loading conversation immediately. Input stays disabled until its
    // transcript is ready, so a fast follow-up cannot be sent to the previous tab.
    set(s => ({ tabs: [...s.tabs, pending], activeTabId: tabId, isExpanded: true }))
    try {
      if (sessionId.startsWith('glui:')) {
        await window.glui.attachThread(tabId, sessionId)
        return tabId
      }
      const history = await window.glui.loadSession(sessionId, lookupDir, provider)
      const messages: Message[] = history.map(m => ({ id: nextMsgId(), role: m.role as Message['role'], content: m.content,
        toolName: m.toolName, toolId: m.toolId, toolResult: m.toolName ? m.content : undefined, toolStatus: m.toolName ? 'completed' : undefined, timestamp: m.timestamp }))
      if (isEncoded) messages.push({ id: nextMsgId(), role: 'system', content: 'The original project folder could not be found. Choose the correct folder before continuing.', timestamp: Date.now() })
      set(s => ({ tabs: s.tabs.map(t => t.id === tabId ? { ...t, messages, status: 'idle', currentActivity: '' } : t) }))
      if (provider === 'claude') {
        void window.glui.getToolResults(sessionId, lookupDir, provider).then(results => set(s => ({ tabs: s.tabs.map(t => t.id === tabId ? { ...t, messages: t.messages.map(m => m.toolId && results[m.toolId] ? { ...m, toolResult: results[m.toolId] } : m) } : t) }))).catch(() => {})
      }
    } catch (error) {
      get().handleError(tabId, { message: `Unable to load history: ${String(error)}`, stderrTail: [], exitCode: null, elapsedMs: 0, toolCallCount: 0 })
    }
    return tabId
  },

  addSystemMessage: (content, tabId = get().activeTabId) => {
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === tabId
          ? {
              ...t,
              messages: [
                ...t.messages,
                { id: nextMsgId(), role: 'system' as const, content, timestamp: Date.now() },
              ],
            }
          : t
      ),
    }))
  },

  // ─── Permission response ───

  respondPermission: (tabId, questionId, optionId) => {
    // Only dismiss an approval after the owning backend acknowledges it.
    return window.glui.respondPermission(tabId, questionId, optionId).then(accepted => {
      if (!accepted) throw new Error("This permission request is no longer active")

    // Remove answered item from queue; show next tool's activity or clear
    set((s) => ({
      tabs: s.tabs.map((t) => {
        if (t.id !== tabId) return t
        const remaining = t.permissionQueue.filter((p) => p.questionId !== questionId)
        return {
          ...t,
          permissionQueue: remaining,
          currentActivity: remaining.length > 0
            ? `Waiting for permission: ${remaining[0].toolTitle}`
            : 'Working...',
        }
      }),
    }))
    })
  },

  // ─── Directory management ───

  addDirectory: (dir) => {
    const { activeTabId } = get()
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === activeTabId
          ? {
              ...t,
              additionalDirs: t.additionalDirs.includes(dir)
                ? t.additionalDirs
                : [...t.additionalDirs, dir],
            }
          : t
      ),
    }))
  },

  removeDirectory: (dir) => {
    const { activeTabId } = get()
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === activeTabId
          ? { ...t, additionalDirs: t.additionalDirs.filter((d) => d !== dir) }
          : t
      ),
    }))
  },

  setBaseDirectory: (dir) => {
    const { activeTabId } = get()
    const current = get().tabs.find(t => t.id === activeTabId)
    if (current?.status === 'running' || current?.status === 'connecting') return
    window.glui.resetTabSession(activeTabId)
    void get().refreshModelSettings(dir)
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === activeTabId
          ? {
              ...makeLocalTab(t.provider),
              id: t.id, preferredModel: t.preferredModel, modelOptions: t.modelOptions, runtimeMode: t.runtimeMode,
              workingDirectory: dir,
              hasChosenDirectory: true,
              providerSessionId: null,
              additionalDirs: [],
            }
          : t
      ),
    }))
  },

  // ─── Attachment management ───

  addAttachments: (attachments) => {
    const { activeTabId } = get()
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === activeTabId
          ? { ...t, attachments: [...t.attachments, ...attachments] }
          : t
      ),
    }))
  },

  removeAttachment: (attachmentId) => {
    const { activeTabId } = get()
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === activeTabId
          ? { ...t, attachments: t.attachments.filter((a) => a.id !== attachmentId) }
          : t
      ),
    }))
  },

  clearAttachments: () => {
    const { activeTabId } = get()
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === activeTabId ? { ...t, attachments: [] } : t
      ),
    }))
  },

  // ─── BTW Side Question ───

  submitBtw: (question) => {
    const { activeTabId, tabs } = get()
    const tab = tabs.find((t) => t.id === activeTabId)
    if (!tab) return

    const btwId = crypto.randomUUID()
    set({ btwState: { btwId, question, responseText: '', status: 'loading' } })

    window.glui.btwPrompt({
      btwId,
      question,
      projectPath: tab.workingDirectory,
      provider: tab.provider,
      model: tab.preferredModel || tab.sessionModel || undefined,
          modelOptions: tab.modelOptions,
          runtimeMode: tab.runtimeMode,
    }).catch(() => {
      set((s) => s.btwState?.btwId === btwId
        ? { btwState: { ...s.btwState!, status: 'error' as const, errorMessage: 'Failed to start' } }
        : {}
      )
    })
  },

  appendBtwChunk: (btwId, text) => {
    set((s) => {
      if (!s.btwState || s.btwState.btwId !== btwId) return {}
      return {
        btwState: {
          ...s.btwState,
          responseText: s.btwState.responseText + text,
          status: 'streaming' as const,
        },
      }
    })
  },

  setBtwDone: (btwId) => {
    set((s) => {
      if (!s.btwState || s.btwState.btwId !== btwId) return {}
      return { btwState: { ...s.btwState, status: 'done' as const } }
    })
  },

  setBtwError: (btwId, message) => {
    set((s) => {
      if (!s.btwState || s.btwState.btwId !== btwId) return {}
      return { btwState: { ...s.btwState, status: 'error' as const, errorMessage: message } }
    })
  },

  dismissBtw: () => {
    set({ btwState: null })
  },

  // ─── Send ───

  sendMessage: (prompt, projectPath) => {
    void (async () => {
      let errorTabId: string | null = null

      try {
        const initialState = get()
        const initialTab = initialState.tabs.find((t) => t.id === initialState.activeTabId)
        if (!initialTab) return

        errorTabId = initialTab.id

        // Guard: don't send while connecting (warmup in progress)
        if (initialTab.status === 'connecting') return

        const tabId = await ensureBackendTabRegistered(initialTab.id)
        errorTabId = tabId

        if (!get().staticInfo) await get().initStaticInfo()
        const { tabs, staticInfo } = get()
        const tab = tabs.find((t) => t.id === tabId)
        if (!tab) return

        // Use explicitly chosen directory, otherwise fall back to user home
        const resolvedPath = projectPath || (tab.hasChosenDirectory ? tab.workingDirectory : (staticInfo?.homePath || tab.workingDirectory || '~'))
        const isBusy = tab.status === 'running'
        const requestId = crypto.randomUUID()

        // Build full prompt with attachment context
        let fullPrompt = prompt
        if (tab.attachments.length > 0) {
          const attachmentCtx = tab.attachments
            .map((a) => `[Attached ${a.type}: ${a.path}]`)
            .join('\n')
          fullPrompt = `${attachmentCtx}\n\n${prompt}`
        }

        const title = tab.messages.length === 0
          ? (prompt.length > 30 ? prompt.substring(0, 27) + '...' : prompt)
          : tab.title

        // Optimistic update: clear attachments
        // If busy, add to queuedPrompts (shown at bottom); otherwise add to messages and set connecting
        set((s) => ({
          tabs: s.tabs.map((t) => {
            if (t.id !== tabId) return t
            const withEffectiveBase = t.hasChosenDirectory
              ? t
              : {
                  ...t,
                  // Once the user sends the first message, lock in the effective
                  // base directory (home by default) so the footer no longer shows "—".
                  hasChosenDirectory: true,
                  workingDirectory: resolvedPath,
                }
            if (isBusy) {
              return {
                ...withEffectiveBase,
                title,
                attachments: [],
                queuedPrompts: [
                  ...withEffectiveBase.queuedPrompts,
                  { prompt, attachments: tab.attachments.length > 0 ? [...tab.attachments] : undefined },
                ],
              }
            }
            return {
              ...withEffectiveBase,
              status: 'connecting' as TabStatus,
              activeRequestId: requestId,
              currentActivity: 'Starting...',
              title,
              attachments: [],
              messages: [
                ...withEffectiveBase.messages,
                {
                  id: requestId,
                  role: 'user' as const,
                  content: prompt,
                  timestamp: Date.now(),
                  attachments: tab.attachments.length > 0 ? [...tab.attachments] : undefined,
                },
              ],
            }
          }),
        }))

        // Send to backend — ControlPlane will queue if a run is active
        await window.glui.prompt(tabId, requestId, {
          prompt: fullPrompt,
          projectPath: resolvedPath,
          sessionId: tab.providerSessionId || undefined,
          provider: tab.provider,
          attachments: tab.attachments,
          model: tab.preferredModel || tab.sessionModel || undefined,
          modelOptions: tab.modelOptions,
          runtimeMode: tab.runtimeMode,
          addDirs: tab.additionalDirs.length > 0 ? tab.additionalDirs : undefined,
        })
      } catch (err) {
        if (!errorTabId) return

        const message = err instanceof Error ? err.message : String(err)
        get().handleError(errorTabId, {
          message,
          stderrTail: [],
          exitCode: null,
          elapsedMs: 0,
          toolCallCount: 0,
        })
      }
    })()
  },

  // ─── Event handlers ───

  handleNormalizedEvent: (tabId, event) => {
    set((s) => {
      const { activeTabId } = s
      const tabs = s.tabs.map((tab) => {
        if (tab.id !== tabId) return tab
        const updated = { ...tab }

        switch (event.type) {
          case 'user_input':
            updated.inputRequests = [...updated.inputRequests.filter(q => q.questionId !== event.questionId), event]
            updated.currentActivity = 'Waiting for your answer'
            break
          case 'tool_result':
            updated.messages = updated.messages.map(m => m.toolId === event.toolId ? { ...m, toolResult: event.result, toolStatus: event.isError ? 'error' : 'completed' } : m)
            break
          case 'session_init':
            updated.providerSessionId = event.sessionId
            updated.sessionModel = event.model
            updated.sessionTools = event.tools
            updated.sessionMcpServers = event.mcpServers
            updated.sessionSkills = event.skills
            updated.sessionVersion = event.version
            // Don't change status/activity for warmup inits — they're invisible
            if (!event.isWarmup) {
              updated.status = 'running'
              if (updated.isCompacting) {
                updated.currentActivity = updated.currentActivity || 'Compacting conversation...'
              } else {
                updated.currentActivity = 'Thinking...'
                updated.todos = {}
                updated.todoMessageId = null
                // Move the first queued prompt into the timeline (it's now being processed)
                if (updated.queuedPrompts.length > 0) {
                  const [nextQueued, ...rest] = updated.queuedPrompts
                  updated.queuedPrompts = rest
                  updated.messages = [
                    ...updated.messages,
                    {
                      id: nextMsgId(),
                      role: 'user' as const,
                      content: nextQueued.prompt,
                      timestamp: Date.now(),
                      attachments: nextQueued.attachments,
                    },
                  ]
                }
              }
            }
            break

          case 'status_update': {
            updated.currentActivity = event.message || 'Working...'
            if (event.isCompaction) {
              updated.isCompacting = true
              upsertCompactionNotice(updated, {
                state: 'running',
                message: event.message || 'Compacting conversation...',
              })
            }
            break
          }

          case 'compact_boundary':
            updated.isCompacting = false
            updated.currentActivity = updated.status === 'running' ? 'Thinking...' : updated.currentActivity
            finalizeCompactionNotice(updated, {
              message: 'Conversation compacted.',
              summary: event.summary,
              trigger: event.trigger,
              compactedMessages: event.compactedMessages,
            })
            break

          case 'text_chunk': {
            // Subagent text → accumulate as toolResult on the parent tool message
            if (event.parentToolUseId) {
              const parentTool = updated.messages.find(
                (m) => m.role === 'tool' && m.toolId === event.parentToolUseId
              )
              if (parentTool) {
                parentTool.toolResult = (parentTool.toolResult || '') + event.text
              }
              break
            }
            updated.currentActivity = 'Writing...'
            const lastMsg = updated.messages[updated.messages.length - 1]
            if (lastMsg?.role === 'assistant' && !lastMsg.toolName) {
              updated.messages = [
                ...updated.messages.slice(0, -1),
                { ...lastMsg, content: lastMsg.content + event.text },
              ]
            } else {
              updated.messages = [
                ...updated.messages,
                { id: nextMsgId(), role: 'assistant', content: event.text, timestamp: Date.now() },
              ]
            }
            break
          }

          case 'tool_call':
            // Skip subagent tool calls — they're internal to the agent
            if (event.parentToolUseId) break
            updated.currentActivity = `Running ${event.toolName}...`
            updated.messages = [
              ...updated.messages,
              {
                id: nextMsgId(),
                role: 'tool',
                content: '',
                toolName: event.toolName,
                toolId: event.toolId,
                toolInput: '',
                toolStatus: 'running',
                timestamp: Date.now(),
              },
            ]
            break

          case 'tool_call_update': {
            // Skip subagent tool call updates
            if (event.parentToolUseId) break
            const msgs = [...updated.messages]
            const lastTool = msgs.find(m => m.toolId === event.toolId) || [...msgs].reverse().find((m) => m.role === 'tool' && m.toolStatus === 'running')
            if (lastTool) {
              lastTool.toolInput = event.replace ? event.partialInput : (lastTool.toolInput || '') + event.partialInput
            }
            updated.messages = msgs
            break
          }

          case 'tool_call_complete': {
            // Skip subagent tool call completions
            if (event.parentToolUseId) break
            const msgs2 = [...updated.messages]
            const runningTool = [...msgs2].reverse().find((m) => m.role === 'tool' && m.toolStatus === 'running')
            if (runningTool) {
              runningTool.toolStatus = 'completed'
            }
            updated.messages = msgs2

            // Intercept TodoWrite completions to build live todo state
            if (runningTool && runningTool.toolName === 'TodoWrite') {
              const input = tryParseJson(runningTool.toolInput)
              if (input) {
                updated.todos = parseTodoWriteInput(input)
              }

              // Inject, update, or remove the TodoCard based on visible tasks
              const visibleTasks = Object.values(updated.todos).filter((t) => t.status !== 'deleted')
              if (visibleTasks.length > 0) {
                const todoContent = buildTodoContent(updated.todos)
                if (updated.todoMessageId) {
                  updated.messages = updated.messages.map((m) =>
                    m.id === updated.todoMessageId ? { ...m, content: todoContent } : m
                  )
                } else {
                  const newMsg: Message = {
                    id: nextMsgId(),
                    role: 'system',
                    content: todoContent,
                    timestamp: Date.now(),
                  }
                  updated.messages = [...updated.messages, newMsg]
                  updated.todoMessageId = newMsg.id
                }
              } else if (updated.todoMessageId) {
                // No visible tasks remain — remove stale TodoCard
                updated.messages = updated.messages.filter((m) => m.id !== updated.todoMessageId)
                updated.todoMessageId = null
              }
            }
            break
          }

          case 'task_update': {
            // ── Text fallback ──
            // text_chunk events (from stream_event deltas) are the primary render path.
            // If they didn't arrive for this run (timing, partial stream, etc.), the
            // assembled assistant event still has the full text — extract it here.
            // "This run" = everything after the last user message.
            if (event.message?.content) {
              const lastUserIdx = (() => {
                for (let i = updated.messages.length - 1; i >= 0; i--) {
                  if (updated.messages[i].role === 'user') return i
                }
                return -1
              })()
              const hasStreamedText = updated.messages
                .slice(lastUserIdx + 1)
                .some((m) => m.role === 'assistant' && !m.toolName)

              if (!hasStreamedText) {
                const textContent = event.message.content
                  .filter((b) => b.type === 'text' && b.text)
                  .map((b) => b.text!)
                  .join('')
                if (textContent) {
                  updated.messages = [
                    ...updated.messages,
                    { id: nextMsgId(), role: 'assistant' as const, content: textContent, timestamp: Date.now() },
                  ]
                }
              }

              // ── Tool card deduplication ──
              for (const block of event.message.content) {
                if (block.type === 'tool_use' && block.name) {
                  const exists = updated.messages.find(
                    (m) => m.role === 'tool' && m.toolName === block.name && !m.content
                  )
                  if (!exists) {
                    updated.messages = [
                      ...updated.messages,
                      {
                        id: nextMsgId(),
                        role: 'tool',
                        content: '',
                        toolName: block.name,
                        toolId: block.id,
                        toolInput: JSON.stringify(block.input, null, 2),
                        toolStatus: 'completed',
                        timestamp: Date.now(),
                      },
                    ]
                  } else if (block.id && !exists.toolId) {
                    // Backfill toolId if the streaming path created it without one
                    exists.toolId = block.id
                  }
                }
              }
            }
            break
          }

          case 'task_complete':
            updated.status = 'completed'
            updated.activeRequestId = null
            updated.currentActivity = ''
            updated.permissionQueue = []
            updated.inputRequests = []
            updated.isCompacting = false
            updated.lastResult = {
              totalCostUsd: event.costUsd,
              durationMs: event.durationMs,
              numTurns: event.numTurns,
              usage: event.usage,
              sessionId: event.sessionId,
            }
            if (updated.compactionMessageId) {
              finalizeCompactionNotice(updated, {
                message: 'Conversation compacted.',
              })
            }
            // ── Final text fallback ──
            // If neither text_chunks nor task_update text produced an assistant message,
            // use event.result (the CLI's assembled final output) as last resort.
            if (event.result) {
              const lastUserIdx2 = (() => {
                for (let i = updated.messages.length - 1; i >= 0; i--) {
                  if (updated.messages[i].role === 'user') return i
                }
                return -1
              })()
              const hasAnyText = updated.messages
                .slice(lastUserIdx2 + 1)
                .some((m) => m.role === 'assistant' && !m.toolName)
              if (!hasAnyText) {
                updated.messages = [
                  ...updated.messages,
                  { id: nextMsgId(), role: 'assistant' as const, content: event.result, timestamp: Date.now() },
                ]
              }
            }
            // Mark as unread unless the user is actively viewing this tab
            // (active tab with card expanded). A collapsed active tab still
            // counts as "unread" — the user hasn't seen the response yet.
            if (tabId !== activeTabId || !s.isExpanded) {
              updated.hasUnread = true
            }
            // Show fallback card when tools were denied by permission settings
            if (event.permissionDenials && event.permissionDenials.length > 0) {
              updated.permissionDenied = { tools: event.permissionDenials }
            } else {
              updated.permissionDenied = null
            }
            // Play notification sound if window is hidden
            playNotificationIfHidden()
            break

          case 'error':
            updated.status = 'failed'
            updated.activeRequestId = null
            updated.currentActivity = ''
            updated.permissionQueue = []
            updated.inputRequests = []
            updated.permissionDenied = null
            updated.isCompacting = false
            if (updated.compactionMessageId) {
              finalizeCompactionNotice(updated, {
                state: 'failed',
                message: 'Compaction interrupted.',
              })
            }
            updated.messages = [
              ...updated.messages,
              { id: nextMsgId(), role: 'system', content: `Error: ${event.message}`, timestamp: Date.now() },
            ]
            break

          case 'session_dead':
            updated.status = 'dead'
            updated.activeRequestId = null
            updated.currentActivity = ''
            updated.permissionQueue = []
            updated.inputRequests = []
            updated.permissionDenied = null
            updated.isCompacting = false
            if (updated.compactionMessageId) {
              finalizeCompactionNotice(updated, {
                state: 'failed',
                message: 'Compaction interrupted.',
              })
            }
            updated.messages = [
              ...updated.messages,
              {
                id: nextMsgId(),
                role: 'system',
                content: `Session ended unexpectedly (exit ${event.exitCode})`,
                timestamp: Date.now(),
              },
            ]
            break

          case 'permission_request': {
            const newReq: import('../../shared/types').PermissionRequest = {
              questionId: event.questionId,
              toolTitle: event.toolName,
              toolDescription: event.toolDescription,
              toolInput: event.toolInput,
              options: event.options.map((o) => ({
                optionId: o.id,
                kind: o.kind,
                label: o.label,
              })),
            }
            updated.permissionQueue = [...updated.permissionQueue, newReq]
            updated.currentActivity = `Waiting for permission: ${event.toolName}`
            break
          }

          case 'agent_progress': {
            // Find the parent tool message by toolId and append progress
            const parentMsg = updated.messages.find(
              (m) => m.role === 'tool' && m.toolId === event.toolUseId
            )
            if (parentMsg) {
              parentMsg.toolResult = (parentMsg.toolResult || '') + event.content + '\n'
            }
            break
          }

          case 'rate_limit':
            if (event.status !== 'allowed') {
              updated.messages = [
                ...updated.messages,
                {
                  id: nextMsgId(),
                  role: 'system',
                  content: `Rate limited (${event.rateLimitType}). Resets at ${new Date(event.resetsAt).toLocaleTimeString()}.`,
                  timestamp: Date.now(),
                },
              ]
            }
            break
        }

        return updated
      })

      return { tabs }
    })

    // After task_complete, fetch tool results from the session JSONL file
    if (event.type === 'task_complete') {
      const tab = get().tabs.find((t) => t.id === tabId)
      if (tab?.providerSessionId) {
        const toolMsgs = tab.messages.filter((m) => m.role === 'tool' && m.toolId && !m.toolResult)
        if (toolMsgs.length > 0) {
          window.glui.getToolResults(tab.providerSessionId, tab.workingDirectory, tab.provider).then((results) => {
            if (!results || Object.keys(results).length === 0) return
            set((s) => ({
              tabs: s.tabs.map((t) => {
                if (t.id !== tabId) return t
                const updatedMsgs = t.messages.map((m) => {
                  if (m.role === 'tool' && m.toolId && results[m.toolId] && !m.toolResult) {
                    return { ...m, toolResult: results[m.toolId] }
                  }
                  return m
                })

                return { ...t, messages: updatedMsgs }
              }),
            }))
          }).catch(() => {})
        }
      }
    }
  },

  handleStatusChange: (tabId, newStatus) => {
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === tabId
          ? (() => {
              const updated = {
                ...t,
                status: newStatus as TabStatus,
                // Clear activity when transitioning to idle (e.g., after warmup init)
                ...(['idle', 'completed', 'failed', 'dead'].includes(newStatus) ? { activeRequestId: null, currentActivity: '', permissionQueue: [], inputRequests: [] } : {}),
                ...(newStatus === 'idle' ? { permissionDenied: null, queuedPrompts: [], messages: t.messages.map(m => m.toolStatus === 'running' ? { ...m, toolStatus: 'error' as const } : m) } : {}),
              }

              if ((newStatus === 'failed' || newStatus === 'dead') && updated.compactionMessageId) {
                updated.isCompacting = false
                finalizeCompactionNotice(updated, {
                  state: 'failed',
                  message: 'Compaction interrupted.',
                })
              } else if ((newStatus === 'completed' || newStatus === 'idle') && updated.compactionMessageId) {
                updated.isCompacting = false
                finalizeCompactionNotice(updated, {
                  message: 'Conversation compacted.',
                })
              }

              return updated
            })()
          : t
      ),
    }))
  },

  handleError: (tabId, error) => {
    set((s) => ({
      tabs: s.tabs.map((t) => {
        if (t.id !== tabId) return t

        // Deduplicate: skip if the last message is already an error for this failure
        const lastMsg = t.messages[t.messages.length - 1]
        const alreadyHasError = lastMsg?.role === 'system' && lastMsg.content.startsWith('Error:')
        const updated = { ...t }

        if (updated.compactionMessageId) {
          updated.isCompacting = false
          finalizeCompactionNotice(updated, {
            state: 'failed',
            message: 'Compaction interrupted.',
          })
        }

        return {
          ...updated,
          status: 'failed' as TabStatus,
          activeRequestId: null,
          currentActivity: '',
          isCompacting: false,
          permissionQueue: [],
          inputRequests: [],
          queuedPrompts: [],
          messages: alreadyHasError
            ? updated.messages
            : [
                ...updated.messages,
                {
                  id: nextMsgId(),
                  role: 'system' as const,
                  content: `Error: ${error.message}${error.stderrTail.length > 0 ? '\n\n' + error.stderrTail.slice(-5).join('\n') : ''}`,
                  timestamp: Date.now(),
                },
              ],
        }
      }),
    }))
  },
}))
