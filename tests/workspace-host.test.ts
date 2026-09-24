import test, { type TestContext } from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import type { WorkspaceHost } from '../src/main/agents/workspace-host'
import type { PillRequest } from '../orchestrator/packages/shared/src/gluiPill'

function setup(t: TestContext) {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const child = Object.assign(new EventEmitter(), {
    connected: true,
    sent: [] as PillRequest[],
    send(request: PillRequest, callback?: (error: Error | null) => void) {
      this.sent.push(request)
      callback?.(null)
    },
  })
  const require = createRequire(resolve('package.json'))
  const exports: { WorkspaceHost?: new () => WorkspaceHost } = {}
  const source = ts.transpileModule(readFileSync(resolve('src/main/agents/workspace-host.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  runInNewContext(source, {
    exports, process, __dirname: resolve('src/main/agents'), setTimeout, clearTimeout,
    require: (id: string) => {
      if (id === 'electron') return { app: { isPackaged: true } }
      if (id === 'node:child_process') return { spawn: () => child }
      if (id === '../cli-env') return { getCliEnv: () => ({}) }
      return require(id)
    },
  })
  return { child, host: new exports.WorkspaceHost!() }
}

test('a first request survives a slow workspace boot and receives its response', async t => {
  const { host, child } = setup(t)
  let settled = false
  const request = host.request({ type: 'catalog', provider: 'claude' })
  void request.then(() => { settled = true }, () => { settled = true })
  t.mock.timers.tick(120_000)
  await Promise.resolve()
  assert.equal(settled, false)
  child.emit('message', { kind: 'ready' })
  child.emit('message', { kind: 'response', id: child.sent[0].id, value: 'catalog' })
  assert.equal(await request, 'catalog')
})

test('an unresponsive ready workspace retains the normal request deadline', async t => {
  const { host, child } = setup(t)
  host.start()
  child.emit('message', { kind: 'ready' })
  const rejected = assert.rejects(host.request({ type: 'catalog', provider: 'claude' }), /did not acknowledge/)
  t.mock.timers.tick(90_001)
  await rejected
})

test('a workspace that never starts still rejects the pending request', async t => {
  const { host } = setup(t)
  const rejected = assert.rejects(host.request({ type: 'catalog', provider: 'claude' }), /did not acknowledge/)
  t.mock.timers.tick(240_001)
  await rejected
})
