import assert from 'node:assert/strict'
import test from 'node:test'
import type { ProviderInstanceId } from '../orchestrator/packages/contracts/src/providerInstance'
import { projectPillContext } from '../orchestrator/apps/web/src/gluiPillContext'

const claude = 'claude-local' as ProviderInstanceId
const codex = 'codex-local' as ProviderInstanceId
const resolveAgent = (id: string, model?: string) => ({
  provider: id === claude ? 'claude' as const : 'codex' as const,
  label: model || (id === claude ? 'Claude Code' : 'Codex'),
})
const handoff = {
  type: 'handoff' as const, status: 'completed' as const,
  fromProviderInstanceIds: [claude], toProviderInstanceId: codex,
}

test('handoff retains historical source and target model names and summary', () => {
  const result = projectPillContext({
    ...handoff,
    fromModelSelections: [{ instanceId: claude, model: 'Claude Opus 5' }],
    toModel: 'GPT-6-Luna', summary: 'Continue the implementation.',
  }, resolveAgent)
  assert.deepEqual(result, {
    kind: 'handoff', state: 'completed', summary: 'Continue the implementation.',
    sources: [{ provider: 'claude', label: 'Claude Opus 5' }],
    target: { provider: 'codex', label: 'GPT-6-Luna' },
  })
})

test('older handoffs use provider labels rather than inventing model names', () => {
  const result = projectPillContext(handoff, resolveAgent)
  assert.equal(result.sources?.[0]?.label, 'Claude Code')
  assert.equal(result.target?.label, 'Codex')
})

test('handoffs retain multiple models but collapse repeated selections', () => {
  const result = projectPillContext({ ...handoff, fromModelSelections: [
    { instanceId: claude, model: 'Opus' }, { instanceId: claude, model: 'Opus' }, { instanceId: claude, model: 'Sonnet' },
  ] }, resolveAgent)
  assert.deepEqual(result.sources?.map(agent => agent.label), ['Opus', 'Sonnet'])
})

test('compaction preserves zero token counts and interrupted states', () => {
  const result = projectPillContext({ type: 'compaction', status: 'interrupted', beforeTokenCount: 4000, afterTokenCount: 0 }, resolveAgent)
  assert.deepEqual(result, { kind: 'compaction', state: 'failed', beforeTokens: 4000, afterTokens: 0 })
})

test('pending context work remains running until completion', () => {
  for (const status of ['idle', 'pending', 'running', 'waiting'] as const) {
    assert.equal(projectPillContext({ type: 'compaction', status }, resolveAgent).state, 'running')
  }
  assert.equal(projectPillContext({ ...handoff, status: 'cancelled' }, resolveAgent).state, 'failed')
  assert.equal(projectPillContext({ type: 'compaction', status: 'completed' }, resolveAgent).state, 'completed')
})
