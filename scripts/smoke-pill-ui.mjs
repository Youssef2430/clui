import { _electron as electron, expect } from '@playwright/test'
import assert from 'node:assert/strict'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Exercise the real renderer through its snapshot boundary; no agent prompts or user data.
const profile = await mkdtemp(join(tmpdir(), 'glui-pill-ui-'))
const env = { ...process.env, GLUI_TEST: '1', GLUI_USER_DATA_DIR: profile }
for (const key of Object.keys(env)) if (key.startsWith('T3CODE_')) delete env[key]
delete env.ELECTRON_RUN_AS_NODE
delete env.GLUI_HOME
const app = await electron.launch({ args: ['.', ...(process.platform === 'darwin' ? ['--use-mock-keychain'] : [])], env, timeout: 60000,
  recordVideo: { dir: profile, size: { width: 900, height: 700 } },
})
try {
  const page = await app.firstWindow()
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.waitForLoadState('domcontentloaded')
  await page.getByTitle('New tab', { exact: true }).click()
  await expect(page.getByRole('tab')).toHaveCount(2)
  const health = await page.evaluate(() => window.glui.tabHealth())
  const tabId = health.tabs.at(-1).tabId
  // Keep health reconciliation consistent with the synthetic snapshot stream.
  await app.evaluate(({ ipcMain }, tabId) => {
    globalThis.fixtureHealth = { tabId, status: 'running', alive: true }
    ipcMain.removeHandler('glui:tab-health')
    ipcMain.handle('glui:tab-health', () => ({ tabs: [globalThis.fixtureHealth], queueDepth: 0 }))
  }, tabId)
  await page.getByRole('tab', { selected: true }).click()
  assert.equal(await page.evaluate(() => 'openWorkspace' in window.glui), false)
  await expect(page.getByRole('button', { name: 'Open workspace', exact: true })).toHaveCount(0)

  const snapshot = {
    threadId: 'ui-fixture', title: 'Pill feedback', provider: 'codex', model: 'GPT-6-Luna', workspaceRoot: profile,
    nativeSessionId: null, status: 'running', activeRequestId: 'run-1', lastRunId: 'run-1',
    queuedPrompts: [], permissions: [], questions: [], hasMoreHistory: false,
    messages: [
      { id: 'user-1', role: 'user', content: 'Continue with the same context.', timestamp: 1 },
      { id: 'handoff', role: 'system', content: '', timestamp: 2, contextChange: {
        kind: 'handoff', state: 'completed', sources: [{ provider: 'claude', label: 'Claude Opus 5' }],
        target: { provider: 'codex', label: 'GPT-6-Luna' }, summary: 'Preserved the project decisions and remaining work.',
      } },
      { id: 'assistant', role: 'assistant', content: 'I have the context. Continuing the implementation.', timestamp: 3 },
      { id: 'compaction', role: 'system', content: '', timestamp: 4, contextChange: {
        kind: 'compaction', state: 'completed', beforeTokens: 48000, afterTokens: 12000, summary: 'Kept the decisions, files, and next steps.',
      } },
    ],
  }
  const emit = () => app.evaluate(({ BrowserWindow }, { tabId, snapshot }) => {
    globalThis.fixtureHealth = { tabId, status: snapshot.status, alive: snapshot.status === 'running' || snapshot.status === 'connecting' }
    BrowserWindow.getAllWindows()[0].webContents.send('glui:thread-snapshot', tabId, snapshot)
  }, { tabId, snapshot })
  await emit()
  await expect(page.getByText('Context handoff', { exact: true })).toBeVisible()
  await expect(page.getByText('Claude Opus 5', { exact: true })).toBeVisible()
  await expect(page.getByText('GPT-6-Luna', { exact: true }).first()).toBeVisible()
  await expect(page.getByText('Context compacted', { exact: true })).toBeVisible()
  const summary = page.locator('.context-summary').first()
  await expect(summary).toBeHidden()
  await page.getByLabel('Context handoff. Show summary', { exact: true }).click()
  await expect(summary).toBeVisible()
  await page.getByLabel('Context handoff. Show summary', { exact: true }).click()
  const wave = page.locator('.run-wave > span').first()
  const transform = await wave.evaluate(el => getComputedStyle(el).transform)
  await page.waitForFunction(previous => getComputedStyle(document.querySelector('.run-wave > span')).transform !== previous, transform)
  await page.screenshot({ path: join(profile, 'pill-working.png') })

  // Only this disposable Electron process gets a controlled stop acknowledgement.
  await app.evaluate(({ ipcMain }) => {
    globalThis.stopCalls = 0
    ipcMain.removeHandler('glui:stop-tab')
    ipcMain.handle('glui:stop-tab', () => {
      globalThis.stopCalls++
      return new Promise(resolve => { globalThis.resolveStop = resolve })
    })
  })
  await page.getByRole('button', { name: 'Interrupt current task', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Stopping current task', exact: true })).toBeDisabled()
  await expect(page.getByText('Stopping…', { exact: true })).toBeVisible()
  assert.equal(await app.evaluate(() => globalThis.stopCalls), 1)
  await page.screenshot({ path: join(profile, 'pill-stopping.png') })
  await app.evaluate(() => globalThis.resolveStop(false))
  await expect(page.getByText('Could not interrupt this task. Please try again.', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Interrupt current task', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: 'Interrupt current task', exact: true }).click()
  await app.evaluate(() => globalThis.resolveStop(true))
  await expect(page.getByRole('button', { name: 'Stopping current task', exact: true })).toBeDisabled()
  snapshot.status = 'idle'
  snapshot.activeRequestId = null
  await emit()
  await expect(page.locator('.run-activity')).toHaveCount(0)
  snapshot.status = 'running'
  snapshot.activeRequestId = 'run-2'
  await emit()
  await expect(page.getByRole('button', { name: 'Interrupt current task', exact: true })).toBeEnabled()
  // Exercise source links and the exact metadata-free web lookup reported by the user.
  snapshot.status = 'completed'
  snapshot.activeRequestId = null
  snapshot.messages = [
    { id: 'user-tools', role: 'user', content: 'Check the weather and run the command.', timestamp: 1 },
    { id: 'search-empty', role: 'tool', content: '', timestamp: 2, toolKind: 'web_search', toolName: 'WebSearch', toolInput: '{}', toolStatus: 'completed', toolState: 'completed' },
    { id: 'search-source', role: 'tool', content: '', timestamp: 3, toolKind: 'web_search', toolName: 'WebSearch', toolInput: '{"query":"Toronto weather"}', toolStatus: 'completed', toolState: 'completed', sources: [{ title: 'Toronto forecast', url: 'https://example.com/weather', citationId: 'turn0search0' }] },
    { id: 'command', role: 'tool', content: '', timestamp: 4, toolKind: 'command_execution', toolName: 'Bash', toolInput: '{"command":"printf hello"}', toolResult: 'hello\n**literal output**', toolStatus: 'completed', toolState: 'completed' },
    { id: 'answer-tools', role: 'assistant', content: 'Forecast checked.citeturn0search0 Missing weather source.citeturn0forecast0', timestamp: 5, sources: [] },
  ]
  await app.evaluate(({ ipcMain }) => {
    globalThis.openedSource = null
    globalThis.legacyResultReads = 0
    ipcMain.removeHandler('glui:open-external')
    ipcMain.handle('glui:open-external', (_event, url) => { globalThis.openedSource = url; return true })
    ipcMain.removeHandler('glui:get-tool-results')
    ipcMain.handle('glui:get-tool-results', () => { globalThis.legacyResultReads++; return {} })
  })
  await emit()
  await page.getByText('Web search and 2 more tools', { exact: true }).click()
  await expect(page.getByText('Completed · The agent did not share search results or source links.', { exact: true })).toBeVisible()
  await expect(page.getByText('Search: Toronto weather', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '1 source · Completed', exact: true }).click()
  await page.getByRole('link', { name: 'Toronto forecast', exact: true }).click()
  assert.equal(await app.evaluate(() => globalThis.openedSource), 'https://example.com/weather')
  await page.getByRole('button', { name: 'Output · Completed', exact: true }).click()
  await expect(page.getByLabel('Tool output', { exact: true })).toHaveText('hello\n**literal output**')
  assert.equal(await app.evaluate(() => globalThis.legacyResultReads), 0)
  await expect(page.getByRole('button', { name: 'View citation sources', exact: true })).toHaveCount(2)
  await expect(page.getByText('Source unavailable', { exact: true })).toHaveCount(2)
  // Same message and text, but fresh metadata: memoization must not hide resolved links.
  snapshot.messages.at(-1).sources = snapshot.messages[2].sources
  await emit()
  await expect(page.getByText('Source unavailable', { exact: true })).toHaveCount(1)
  await page.getByRole('button', { name: 'View citation sources', exact: true }).first().click()
  await expect(page.getByRole('group', { name: 'Citation sources', exact: true }).getByRole('link', { name: 'Toronto forecast', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'View citation sources', exact: true }).last().click()
  await expect(page.getByText('The agent did not provide a link for this citation.', { exact: true })).toBeVisible()
  assert.equal(await page.locator('body').innerText().then(text => /[\uE200\uE201\uE202]|No result data available|web_search/.test(text)), false)
  await page.screenshot({ path: join(profile, 'pill-tools-citations.png') })
  console.log('PASS: search details, real source-link destination, literal command output, no legacy result lookup, citation metadata updates, honest missing-source fallback')
  // Return to the activity fixture for reduced-motion and narrow-pill checks.
  snapshot.status = 'running'
  snapshot.activeRequestId = 'run-3'
  snapshot.messages = [
    { id: 'narrow-user', role: 'user', content: 'Continue.', timestamp: 1 },
    { id: 'narrow-handoff', role: 'system', content: '', timestamp: 2, contextChange: { kind: 'handoff', state: 'completed', sources: [{ provider: 'claude', label: 'Claude Opus 5' }], target: { provider: 'codex', label: 'GPT-6-Luna' } } },
  ]
  await emit()
  await page.emulateMedia({ reducedMotion: 'reduce' })
  assert.equal(await wave.evaluate(el => getComputedStyle(el).animationName), 'none')
  await app.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0]
    window.setMinimumSize(360, 300)
    window.setSize(400, 650)
  })
  await expect(page.getByText('Context handoff', { exact: true })).toBeVisible()
  const overflow = await page.evaluate(() => {
    const row = document.querySelector('.context-divider')
    return row.scrollWidth > row.clientWidth
  })
  assert.equal(overflow, false, 'Context dividers wrap within narrow pills')
  assert.deepEqual(errors, [])
  console.log('PASS: compact handoffs/compactions, expandable summaries, animated work, stop acknowledgement/retry, new-run reset, reduced motion, narrow layout, no workspace entry point or renderer errors')
} finally {
  await app.close()
  console.log(`Screenshots and motion recording: ${profile}`)
}
