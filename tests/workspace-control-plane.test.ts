import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { ControlPlane } from '../src/main/agents/workspace-control-plane'
import type { WorkspaceHost } from '../src/main/agents/workspace-host'
import type { PillAction, PillThread } from '../orchestrator/packages/shared/src/gluiPill'
import { tmpdir } from 'node:os'

class FakeHost extends EventEmitter {
  actions: PillAction[] = []
  start() {}
  shutdown() {}
  async request(action: PillAction) { this.actions.push(action); return undefined }
}
const setup = () => {
  const host = new FakeHost()
  const plane = new ControlPlane(false, host as unknown as WorkspaceHost)
  plane.on('error', () => {})
  return { host, plane }
}
const snapshot = (threadId: string): PillThread => ({ threadId, title: 'Durable thread', provider: 'codex', model: 'test', workspaceRoot: tmpdir(), nativeSessionId: 'native-123', status: 'completed', activeRequestId: null, messages: [{ id: 'm', role: 'assistant', content: 'kept', timestamp: 1 }], permissions: [], questions: [], queuedPrompts: [], lastRunId: 'run-1', hasMoreHistory: false })

test('choosing a folder on an unregistered draft does not crash the main process', () => {
  const { plane } = setup()
  assert.doesNotThrow(() => plane.resetTabSession('renderer-only-draft'))
})
test('prompt IDs deduplicate dispatch and cannot be borrowed by another tab', async () => {
  const { plane, host } = setup()
  const a = plane.createTab('codex'), b = plane.createTab('codex')
  const options = { provider: 'codex' as const, projectPath: tmpdir(), prompt: 'hello' }
  await Promise.all([plane.submitPrompt(a, 'request-1', options), plane.submitPrompt(a, 'request-1', options)])
  await assert.rejects(plane.submitPrompt(b, 'request-1', options), /another tab/)
  assert.equal(host.actions.filter(a => a.type === 'prompt').length, 1)
})
test('handoff keeps the canonical thread and native CLI continuation identity', async () => {
  const { plane, host } = setup()
  const tab = plane.createTab('codex')
  await plane.attach(tab, 'glui:thread-1')
  host.emit('thread', snapshot('thread-1'))
  await plane.setProvider(tab, 'claude')
  assert.deepEqual(host.actions.at(-1), { type: 'select', threadId: 'thread-1', provider: 'claude' })
  assert.equal(plane.getTabStatus(tab)?.providerSessionId, 'glui:thread-1')
  assert.equal(plane.nativeSessionId('glui:thread-1'), 'native-123')
})
test('closing one view keeps the shared thread subscription and durable work alive', async () => {
  const { plane, host } = setup()
  const a = plane.createTab('codex'), b = plane.createTab('codex')
  await plane.attach(a, 'glui:thread-1'); await plane.attach(b, 'glui:thread-1')
  plane.closeTab(a)
  assert.equal(host.actions.filter(a => a.type === 'unwatch' || a.type === 'stop').length, 0)
  plane.closeTab(b)
  assert.deepEqual(host.actions.at(-1), { type: 'unwatch', threadId: 'thread-1' })
})
test('a workspace restart resubscribes open durable threads', async () => {
  const { plane, host } = setup()
  const tab = plane.createTab('codex'); await plane.attach(tab, 'glui:thread-1')
  host.actions.length = 0; host.emit('ready')
  assert.deepEqual(host.actions, [{ type: 'watch', threadId: 'thread-1' }])
})

test('history pages follow the attached thread and survive a failed request', async () => {
  const { plane, host } = setup()
  const tab = plane.createTab('codex')
  await assert.rejects(plane.loadEarlierHistory(tab), /saved conversation/)
  await plane.attach(tab, 'glui:saved-thread')
  const request = host.request.bind(host)
  host.request = async () => { throw new Error('Disconnected') }
  await assert.rejects(plane.loadEarlierHistory(tab), /Disconnected/)
  assert.equal(plane.getTabStatus(tab)?.providerSessionId, 'glui:saved-thread')
  host.request = request
  await plane.loadEarlierHistory(tab)
  assert.deepEqual(host.actions.at(-1), { type: 'load-earlier', threadId: 'saved-thread' })
})

test('reasoning and access selections reach the canonical workspace command', async () => {
  const { plane, host } = setup()
  const tab = plane.createTab('codex')
  await plane.submitPrompt(tab, 'options-request', { projectPath: tmpdir(), prompt: 'hello', model: 'chosen', modelOptions: [{ id: 'reasoningEffort', value: 'xhigh' }], runtimeMode: 'auto-accept-edits' })
  const command = host.actions.find(a => a.type === 'prompt')
  assert.equal(command?.type, 'prompt')
  if (command?.type === 'prompt') { assert.equal(command.model, 'chosen'); assert.equal(command.runtimeMode, 'auto-accept-edits'); assert.deepEqual(command.modelOptions, [{ id: 'reasoningEffort', value: 'xhigh' }]) }
})
