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
