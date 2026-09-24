import assert from 'node:assert/strict'
import test from 'node:test'
import type { OrchestrationV2TurnItem } from '../orchestrator/packages/contracts/src/orchestrationV2'
import { projectPillTool } from '../orchestrator/apps/web/src/gluiPillTools'
import { readWebSources } from '../orchestrator/packages/shared/src/webSearchSources'
import { citationSource, copyWithWebCitations, remarkWebCitations, citationRefs } from '../src/renderer/lib/webCitations'

// IDs/timestamps are irrelevant to tool presentation; provide only the consumed fields.
const project = (fields: Record<string, unknown>) => projectPillTool({ id: 'tool', title: null, status: 'completed', ...fields } as OrchestrationV2TurnItem)!
test('search projection retains queries and actual source links', () => {
  const result = project({ type: 'web_search', patterns: ['weather in Toronto'], results: [{ title: 'Weather', url: 'https://example.com/weather', citationId: 'turn0search0' }] })
  assert.equal(result.toolName, 'WebSearch')
  assert.deepEqual(JSON.parse(result.toolInput!), { query: 'weather in Toronto' })
  assert.equal(result.sources?.[0]?.citationId, 'turn0search0')
  assert.equal(result.toolKind, 'web_search')
})
test('the weather response with no source metadata stays explicitly empty', () => {
  const result = project({ type: 'web_search' })
  assert.equal(result.toolName, 'WebSearch')
  assert.equal(result.toolResult, undefined)
  assert.equal(result.sources, undefined)
  assert.equal(result.toolStatus, 'completed')
})
test('command output, errors, waiting tools, and interruption retain their states', () => {
  const result = project({ type: 'command_execution', input: 'printf hello', output: 'hello', exitCode: 0 })
  assert.equal(result.toolName, 'Bash')
  assert.equal(result.toolResult, 'hello')
  assert.deepEqual(JSON.parse(result.toolInput!), { command: 'printf hello' })
  assert.equal(project({ type: 'command_execution', input: 'false', exitCode: 1 }).toolStatus, 'error')
  assert.equal(project({ type: 'dynamic_tool', status: 'waiting', input: {} }).toolStatus, 'running')
  assert.equal(project({ type: 'web_search', status: 'interrupted' }).toolStatus, 'error')
})
test('edits, file searches and subagents retain useful details', () => {
  assert.deepEqual(JSON.parse(project({ type: 'file_change', fileName: 'a.ts', oldStr: 'before', newStr: 'after' }).toolInput!), { file_path: 'a.ts', old_string: 'before', new_string: 'after' })
  assert.equal(project({ type: 'file_search', pattern: 'hello', results: [{ fileName: 'a.ts', line: 12, preview: 'hello' }] }).toolResult, 'a.ts:12\nhello')
  assert.equal(project({ type: 'subagent', prompt: 'Investigate', result: null, progress: 'Checking files' }).toolResult, 'Checking files')
  assert.equal(project({ type: 'dynamic_tool', toolName: 'mcp__server__search', input: {}, output: { content: [{ type: 'text', text: 'Found it' }] } }).toolResult, 'Found it')
})
test('untyped source results accept only safe explicit URLs and reference IDs', () => {
  assert.deepEqual(readWebSources([null, 'text', { url: 'javascript:alert(1)' }, { url: 'file:///private/file' }, { url: 'https://user:pass@example.com/' }]), [])
  assert.deepEqual(readWebSources([{ url: 'https://example.com', ref_id: 'turn0search0', title: 'Example' }]), [{ url: 'https://example.com/', citationId: 'turn0search0', title: 'Example' }])
})
test('citation references resolve by exact ID and never by result order', () => {
  const sources = [{ url: 'https://example.com/', citationId: 'turn1search0', title: 'Example' }]
  assert.equal(citationSource('turn0search0', sources), undefined)
  assert.equal(citationSource('turn1search0', sources)?.url, 'https://example.com/')
  assert.equal(citationSource('turn1search0', [...sources, { url: 'https://different.example/', citationId: 'turn1search0' }]), undefined)
  assert.equal(copyWithWebCitations('Answer.citeturn1search0turn0forecast0', sources), 'Answer. [Example](<https://example.com/>) [Source link not provided]')
  assert.equal(copyWithWebCitations('`citeturn1search0`', sources), '`citeturn1search0`')
})
test('Markdown citations preserve prose and literal code while hiding incomplete streaming markers', () => {
  const tree = { type: 'root', children: [{ type: 'paragraph', children: [
    { type: 'text', value: 'Answer.citeturn0search0turn0search1 More.citeturn1' },
    { type: 'inlineCode', value: 'citeturn0search0' },
  ] }] }
  remarkWebCitations()(tree)
  const children = tree.children[0].children
  assert.equal(children[0].value, 'Answer.')
  assert.deepEqual(citationRefs((children[1] as { url?: string }).url), ['turn0search0', 'turn0search1'])
  assert.equal(children[2].value, ' More.')
  assert.equal(children[3].value, 'citeturn0search0')
})
