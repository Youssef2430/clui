/** Native material QA: isolated profile, fixture content, actual WindowServer captures over the current desktop.
 * Run after `npm run build:overlay`: node scripts/capture-glass.mjs
 * No prompts are submitted and no user preferences are changed.
 */
import { _electron as electron } from '@playwright/test'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'
import tailwind from '@tailwindcss/vite'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import assert from 'node:assert/strict'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const output = join(root, 'design/glass-review')
await mkdir(output, { recursive: true })
const server = await createServer({ configFile: false, root: join(root, 'src/renderer'), plugins: [react(), tailwind()], server: { host: '127.0.0.1', port: 5199, strictPort: true } })
await server.listen()
const profile = await mkdtemp(join(tmpdir(), 'glui-glass-qa-'))
const env = { ...process.env, GLUI_TEST: '1', GLUI_USER_DATA_DIR: profile, ELECTRON_RENDERER_URL: 'http://127.0.0.1:5199' }
delete env.ELECTRON_RUN_AS_NODE
delete env.GLUI_HOME
for (const key of Object.keys(env)) if (key.startsWith('T3CODE_')) delete env[key]
let app
const captures = []
const errors = []
try {
  app = await electron.launch({ args: [root, '--use-mock-keychain'], env })
  const page = await app.firstWindow()
  page.setDefaultTimeout(8000)
  page.on('pageerror', error => errors.push(error.message))
  await page.waitForSelector('.glui-composer')
  await page.waitForFunction(() => document.documentElement.classList.contains('native-glass'))
  await app.evaluate(({ BrowserWindow }) => {
    globalThis.reviewMain = BrowserWindow.getAllWindows()[0]
    globalThis.reviewMain.webContents.closeDevTools()
    globalThis.reviewMain.setFocusable(false)
    globalThis.reviewMain.setBounds({ x: 116, y: 78, width: 1280, height: 860 })
  })
  await page.evaluate(async () => {
    window.reviewTheme = (await import('/theme.ts')).useThemeStore
    window.reviewStore = (await import('/stores/sessionStore.ts')).useSessionStore
    window.reviewSize = (await import('/panel-size.ts')).usePanelSize
    // Stable UI fixtures; only this disposable renderer's store is changed.
    const descriptor = { id: 'reasoning-effort', label: 'Reasoning effort', type: 'select', currentValue: 'medium', options: [
      { id: 'low', label: 'Low', description: 'Quick answers for straightforward tasks.' },
      { id: 'medium', label: 'Medium', description: 'A balance of speed and depth.', isDefault: true },
      { id: 'high', label: 'High', description: 'More time for complex problems.' },
    ] }
    const modelSettings = { defaultModel: 'sonnet', options: [
      { id: 'sonnet', label: 'Sonnet', detail: 'Balanced speed and capability', descriptors: [descriptor] },
      { id: 'opus', label: 'Opus', detail: 'For the most demanding work', descriptors: [descriptor] },
      { id: 'haiku', label: 'Haiku', detail: 'Fast and lightweight', descriptors: [descriptor] },
    ], runtimeModes: ['approval-required', 'auto', 'full-access'] }
    await window.reviewStore.getState().initStaticInfo()
    window.reviewModelSettings = modelSettings
    window.reviewStore.setState({ refreshModelSettings: async () => window.reviewStore.setState({ modelSettings, modelSettingsLoading: false, modelSettingsError: null }), modelSettings, modelSettingsLoading: false, modelSettingsError: null })
    window.reviewTab = { ...window.reviewStore.getState().tabs[0], title: 'Material study', provider: 'claude', preferredModel: 'sonnet', status: 'idle', hasChosenDirectory: true, workingDirectory: '/workspace/studio', messages: [], modelOptions: [], runtimeMode: 'approval-required' }
    window.reviewMessages = [
      { id: 'fixture-user', role: 'user', content: 'Make this feel lighter, without losing focus.', timestamp: Date.now() - 120000 },
      { id: 'fixture-assistant', role: 'assistant', content: 'A little more clarity, a little less chrome.\n\nThe glass now picks up the colors of your desktop, with a soft highlight along the edges.\n\n**Your work stays in focus.** The conversation sits above the material, and the composer is always close at hand.\n\nTry a different size or appearance — the controls move with you.', timestamp: Date.now() - 60000 },
    ]
    window.reviewStore.setState({ tabs: [window.reviewTab], isExpanded: false })
    window.reviewTheme.getState().setBrandPalette('glass')
  })
  await page.waitForTimeout(800)
  const capture = async name => {
    await app.evaluate(() => globalThis.reviewMain.moveTop())
    await page.waitForTimeout(650)
    const layout = await page.evaluate(() => {
      const selectors = '.glass-surface,.glui-popover,[aria-label="Resize panel"]'
      const surfaces = [...document.querySelectorAll(selectors)].map(el => {
        const r = el.getBoundingClientRect(), style = getComputedStyle(el)
        return { name: el.className, x: r.x, y: r.y, width: r.width, height: r.height, visible: style.visibility !== 'hidden' && Number(style.opacity) > 0 }
      }).filter(r => r.visible && r.width > 0 && r.height > 0)
      const shelf = document.querySelector('.composer-shelf')
      return { surfaces, viewport: { width: innerWidth, height: innerHeight }, shelfOverflow: shelf.scrollWidth > shelf.clientWidth + 1, native: document.documentElement.classList.contains('native-glass') }
    })
    assert.ok(layout.native)
    assert.equal(layout.shelfOverflow, false, `${name}: shelf overflows`)
    for (const surface of layout.surfaces) {
      assert.ok(surface.x >= -1 && surface.y >= -1 && surface.x + surface.width <= layout.viewport.width + 1 && surface.y + surface.height <= layout.viewport.height + 1, `${name}: surface outside viewport: ${JSON.stringify(surface)}`)
    }
    const bounds = await app.evaluate(() => globalThis.reviewMain.getBounds())
    const left = Math.max(0, Math.floor(Math.min(...layout.surfaces.map(r => r.x))) - 24)
    const top = Math.max(0, Math.floor(Math.min(...layout.surfaces.map(r => r.y))) - 24)
    const right = Math.min(bounds.width, Math.ceil(Math.max(...layout.surfaces.map(r => r.x + r.width))) + 24)
    const bottom = Math.min(bounds.height, Math.ceil(Math.max(...layout.surfaces.map(r => r.y + r.height))) + 24)
    const region = [bounds.x + left, bounds.y + top, right - left, bottom - top]
    execFileSync('/usr/sbin/screencapture', ['-x', `-R${region.join(',')}`, join(output, `${name}.png`)])
    captures.push({ name, region, ...layout })
    console.log(`PASS ${name}`)
  }
  const state = async (theme, size, expanded, thread = false) => {
    // Clicking the composer dismisses settings and picker portals normally.
    await page.locator('.glui-composer').dispatchEvent('mousedown')
    await page.evaluate(({ theme, size, expanded, thread }) => {
      window.reviewTheme.getState().setThemeMode(theme)
      window.reviewSize.getState().setSize(size, false)
      window.reviewStore.setState({ modelSettings: window.reviewModelSettings, modelSettingsLoading: false, isExpanded: expanded, tabs: [{ ...window.reviewTab, messages: thread ? window.reviewMessages : [] }] })
    }, { theme, size, expanded, thread })
    await page.waitForTimeout(500)
  }
  const sizes = [{ name: 'compact', width: 400, height: 260 }, { name: 'standard', width: 560, height: 380 }, { name: 'wide', width: 800, height: 480 }]
  for (const theme of ['light', 'dark']) {
    for (const size of sizes) {
      await state(theme, size, false)
      await capture(`${theme}-${size.name}-closed`)
      await state(theme, size, true)
      await capture(`${theme}-${size.name}-open`)
      await state(theme, size, true, true)
      await capture(`${theme}-${size.name}-thread`)
    }
    await state(theme, sizes[1], true, true)
    await page.getByTitle('Settings', { exact: true }).click()
    await capture(`${theme}-settings`)
    for (const menu of ['model', 'effort', 'access', 'folder']) {
      await state(theme, sizes[1], true, true)
      await page.locator(`.composer-control-${menu}`).click()
      await capture(`${theme}-${menu}-picker`)
    }
    await state(theme, sizes[1], true, true)
    const terminal = page.getByRole('button', { name: 'Open in CLI', exact: true })
    assert.equal(await terminal.innerText(), '', 'Terminal launch is an icon, not a labeled button')
    await terminal.dispatchEvent('contextmenu')
    await page.getByRole('dialog', { name: 'Choose terminal app' }).waitFor()
    await capture(`${theme}-terminal-picker`)
    await state(theme, sizes[0], false)
    await app.evaluate(() => globalThis.reviewMain.setBounds({ x: 336, y: 480, width: 840, height: 450 }))
    await page.getByTitle('Settings', { exact: true }).click()
    await capture(`${theme}-short-window-settings`)
    await app.evaluate(() => globalThis.reviewMain.setBounds({ x: 116, y: 78, width: 1280, height: 860 }))
  }
  assert.deepEqual(errors, [])
  await writeFile(join(output, 'manifest.json'), JSON.stringify({ captureMethod: 'macOS screencapture / WindowServer, native glass included', content: 'Isolated renderer fixtures over the current desktop', captures, errors }, null, 2))
  console.log(`${captures.length} native screenshots saved to ${output}`)
} finally {
  if (app) await app.evaluate(({ app }) => app.quit()).catch(() => {})
  await server.close()
}
