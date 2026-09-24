import { _electron as electron, expect } from '@playwright/test'
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { execFileSync } from 'node:child_process'
import assert from 'node:assert/strict'

const profile = await mkdtemp(join(tmpdir(), 'glui-smoke-'))
console.log(`Isolated profile: ${profile}`)
const project = join(profile, 'project')
await mkdir(project)
await writeFile(join(project, 'README.md'), '# GLUI smoke fixture\n')
execFileSync('git', ['init', '--quiet', project])
execFileSync('git', ['-C', project, 'add', 'README.md'])
execFileSync('git', ['-C', project, '-c', 'user.name=GLUI Test', '-c', 'user.email=test@example.invalid', 'commit', '--quiet', '-m', 'fixture'])
const env = { ...process.env, GLUI_TEST: '1', GLUI_USER_DATA_DIR: profile }
for (const key of Object.keys(env)) if (key.startsWith('T3CODE_')) delete env[key]
delete env.ELECTRON_RUN_AS_NODE
delete env.GLUI_HOME
// Only this disposable test profile uses Chromium's test Keychain. Ad-hoc
// rebuilds otherwise block on macOS authorizing a different binary signature.
const launchArgs = [...(process.env.GLUI_PACKAGED_APP ? [] : ['.']), ...(process.platform === 'darwin' ? ['--use-mock-keychain'] : [])]
const app = await electron.launch({ ...(process.env.GLUI_PACKAGED_APP ? { executablePath: resolve(process.env.GLUI_PACKAGED_APP) } : {}), args: launchArgs, env, timeout: 60000 })
let closed = false
let forkSessionId
try {
  const page = await app.firstWindow()
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.waitForLoadState('domcontentloaded')
  assert.equal(await page.evaluate(() => document.documentElement.dataset.palette), 'glass', 'Liquid Glass is the default theme')
  const nativeGlassEnabled = process.platform === 'darwin' && !await page.evaluate(() => matchMedia('(prefers-reduced-transparency: reduce), (prefers-contrast: more)').matches)
  const inspectGlass = () => app.evaluate(({ app, BrowserWindow }) => {
    const path = process.getBuiltinModule('path')
    const require = process.getBuiltinModule('module').createRequire(path.join(app.getAppPath(), 'package.json'))
    const native = require(path.join(app.getAppPath(), app.isPackaged ? 'pill' : '.', 'resources/native/glui-glass.node'))
    return native.inspect(BrowserWindow.getAllWindows()[0].getNativeWindowHandle())
  })
  if (nativeGlassEnabled) {
    await page.waitForFunction(() => document.documentElement.classList.contains('native-glass'))
    const glass = await inspectGlass()
    assert.equal(glass.separateBackdrop, true, 'Glass cannot sample the foreground compositor')
    assert.equal(glass.orderedBehindParent, true, 'Controls render above the native glass')
    assert.equal(glass.alignedWithParent, true, 'Native glass follows the overlay position')
    assert.equal(glass.ignoresMouseEvents, true, 'Native material cannot intercept clicks')
    assert.ok(glass.visible && glass.surfaceCount > 0)
    console.log('PASS: native glass is isolated, aligned, and behind the foreground controls')
  }
  const info = await page.evaluate(() => window.glui.start())
  assert.equal(info.version, JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')).version)
  const available = info.providers.filter(p => p.installed)
  assert.ok(available.length, 'Install at least one supported agent CLI')
  for (const provider of available) {
    console.log(`Checking ${provider.id} model catalog…`)
    const catalog = await page.evaluate(id => window.glui.getModelSettings(undefined, id), provider.id)
    assert.ok(catalog.options.length, `${provider.id} has a live model catalog`)
    assert.ok(catalog.runtimeModes.includes('auto'), `${provider.id} exposes Auto access`)
  }
  const workspace = await page.evaluate(path => window.glui.getWorkspaceInfo(path), project)
  assert.ok(workspace.branch, 'Git branch is available to the shelf')
  const windows = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().filter(w => w.isVisible()).map(w => ({ width: w.getBounds().width, alwaysOnTop: w.isAlwaysOnTop() })))
  assert.ok(windows.some(w => w.alwaysOnTop), 'Default window remains the floating pill')
  assert.equal(windows.length, 1, 'The advanced workspace stays hidden initially')
  if (nativeGlassEnabled) {
    await page.evaluate(async () => { window.glui.hideWindow(); await window.glui.isVisible() })
    assert.equal((await inspectGlass()).visible, false, 'Hiding GLUI hides the native backing too')
  }
  execFileSync(app.process().spawnfile, launchArgs, { env, timeout: 10000, stdio: 'ignore' })
  if (nativeGlassEnabled) {
    // The second process exits before macOS finishes restoring window order.
    await expect.poll(inspectGlass, { timeout: 10000 }).toMatchObject({
      visible: true, orderedBehindParent: true,
    })
  }
  console.log('PASS: a second launch reuses the existing profile owner')

  if (process.env.GLUI_LIVE_SMOKE === '1') {
    const providers = process.env.GLUI_LIVE_ALL === '1' ? ['codex', 'claude', 'opencode'] : ['codex']
    let session
    for (const provider of providers) {
      assert.ok(available.some(p => p.id === provider), `${provider} must be installed for live smoke`)
      const result = await page.evaluate(async ({ provider, project, model, session }) => {
        const { tabId } = session ? { tabId: session.tabId } : await window.glui.createTab(provider)
        if (session) await window.glui.setProvider(tabId, provider)
        const requestId = crypto.randomUUID()
        const done = new Promise((resolve, reject) => {
          const timeout = setTimeout(() => { unsub(); reject(new Error(`${provider} timed out`)) }, 120000)
          const unsub = window.glui.onThreadSnapshot((id, snapshot) => {
            if (id !== tabId || !snapshot.messages.some(m => m.id === requestId)) return
            if (!['completed', 'failed'].includes(snapshot.status)) return
            clearTimeout(timeout); unsub()
            if (snapshot.status === 'failed') reject(new Error(snapshot.messages.at(-1)?.content || 'Run failed'))
            else resolve(snapshot)
          })
        })
        await window.glui.prompt(tabId, requestId, { provider, ...(model ? { model } : {}), projectPath: project, runtimeMode: 'approval-required', prompt: session ? 'Repeat the exact GLUI_SMOKE marker from the previous assistant, with nothing else. Do not use tools.' : 'Reply exactly GLUI_SMOKE_OK. Do not use tools.' })
        return { tabId, snapshot: await done }
      }, { provider, project, model: process.env[`GLUI_${provider.toUpperCase()}_MODEL`], session })
      assert.match(result.snapshot.messages.filter(m => m.role === 'assistant').at(-1).content, /GLUI_SMOKE_OK/)
      session = { tabId: result.tabId }
      console.log(`PASS: ${provider} completed${providers.indexOf(provider) ? ' with inherited handoff context' : ''}`)
    }
    const fork = await page.evaluate(id => window.glui.forkThread(id), session.tabId)
    assert.ok(fork.sessionId.startsWith('glui:'))
    forkSessionId = fork.sessionId
    const history = await page.evaluate(() => window.glui.workspaceHistory())
    assert.ok(history.some(s => s.sessionId === fork.sessionId))
    console.log('PASS: branch is persisted in canonical history')
  }
  assert.deepEqual(errors, [])
  console.log('PASS: application API, live model catalogs, Auto modes, Git branch, floating window, no renderer errors')
  await app.close()
  closed = true
  const reopened = await electron.launch({ ...(process.env.GLUI_PACKAGED_APP ? { executablePath: resolve(process.env.GLUI_PACKAGED_APP) } : {}), args: launchArgs, env, timeout: 60000 })
  try {
    const restored = await reopened.firstWindow()
    await restored.waitForLoadState('domcontentloaded')
    const history = await restored.evaluate(() => window.glui.workspaceHistory())
    if (forkSessionId) assert.ok(history.some(s => s.sessionId === forkSessionId), 'Branch survives an app restart')
    const models = await restored.evaluate(id => window.glui.getModelSettings(undefined, id), available[0].id)
    assert.ok(models.options.length, 'Workspace reconnects after a restart')
    console.log('PASS: workspace reconnects and canonical history survives restart')
  } finally { await reopened.close() }
} finally { if (!closed) await app.close() }
