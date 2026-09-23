import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile, realpath, lstat, rm, symlink, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { SkillStore, validateSkillSource, type SkillTarget } from '../src/main/marketplace/skill-store'

const source = { repo: 'example/skills', name: 'test-skill', path: 'skills/test-skill' }
async function fixture(t: { after: (fn: () => Promise<void>) => void }) {
  const home = await mkdtemp(join(tmpdir(), 'glui-skill-test-'))
  t.after(() => rm(home, { recursive: true, force: true }))
  const directory = join(home, 'source')
  await mkdir(join(directory, 'scripts'), { recursive: true })
  await writeFile(join(directory, 'SKILL.md'), '---\nname: test-skill\ndescription: A complete skill\n---\nUse scripts/tool.py.\n')
  await writeFile(join(directory, 'scripts', 'tool.py'), 'print("asset retained")')
  const targets: SkillTarget[] = ['claude', 'codex', 'opencode'].map(id => ({ id, name: id, directory: join(home, id, 'skills') }))
  const store = new SkillStore(join(home, 'glui', 'skills'), async () => targets, async () => ({ directory, revision: 'revision-1', cleanup: async () => {} }))
  return { home, directory, targets, store, path: (id: string) => join(home, id, 'skills', source.name) }
}

test('one complete canonical folder is linked into all available agents; repeat installation is idempotent', async t => {
  const f = await fixture(t)
  await Promise.all([f.store.install(source), f.store.install(source)])
  assert.equal((await f.store.list()).length, 1)
  for (const target of f.targets) {
    const path = f.path(target.id)
    assert.equal((await lstat(path)).isSymbolicLink(), true)
    assert.equal(await realpath(path), await realpath(join(f.store.root, source.name)))
    assert.equal(await readFile(join(path, 'scripts', 'tool.py'), 'utf8'), 'print("asset retained")')
  }
})
test('a collision leaves user files intact and creates no partial install', async t => {
  const f = await fixture(t)
  await mkdir(f.path('codex'), { recursive: true })
  await writeFile(join(f.path('codex'), 'SKILL.md'), 'user-owned')
  await assert.rejects(f.store.install(source), /already has/)
  assert.equal(await readFile(join(f.path('codex'), 'SKILL.md'), 'utf8'), 'user-owned')
  await assert.rejects(lstat(f.path('claude')), { code: 'ENOENT' })
  assert.equal((await f.store.list()).length, 0)
})
test('removal deletes only owned links, preserving replacements made outside GLUI', async t => {
  const f = await fixture(t)
  await f.store.install(source)
  await unlink(f.path('codex')); await mkdir(f.path('codex')); await writeFile(join(f.path('codex'), 'note'), 'keep')
  await f.store.uninstall(source.name)
  assert.equal(await readFile(join(f.path('codex'), 'note'), 'utf8'), 'keep')
  await assert.rejects(lstat(f.path('claude')), { code: 'ENOENT' })
  assert.equal((await f.store.list()).length, 0)
})
test('newly available agents receive existing skills without downloading or replacing other files', async t => {
  const f = await fixture(t)
  const removed = f.targets.pop()!
  await f.store.install(source)
  f.targets.push(removed)
  await f.store.reconcile()
  assert.equal(await realpath(f.path('opencode')), await realpath(join(f.store.root, source.name)))
  assert.equal((await f.store.list())[0]!.links.length, 3)
})
test('unsafe source paths and repository symlinks cannot escape the skill store', async t => {
  const f = await fixture(t)
  assert.throws(() => validateSkillSource({ ...source, path: '../outside' }), /Invalid/)
  assert.throws(() => validateSkillSource({ ...source, name: '../outside' }), /Invalid/)
  await symlink('/etc/passwd', join(f.directory, 'outside'))
  await assert.rejects(f.store.install(source), /symbolic links/)
  assert.equal((await f.store.list()).length, 0)
})
test('failed update leaves the existing version and all links usable', async t => {
  const f = await fixture(t)
  await f.store.install(source)
  await writeFile(join(f.directory, 'SKILL.md'), 'broken skill')
  await assert.rejects(f.store.install(source), /valid SKILL/)
  assert.match(await readFile(join(f.path('claude'), 'SKILL.md'), 'utf8'), /complete skill/)
  await assert.rejects(f.store.install({ ...source, repo: 'another/skills' }), /different skill/)
})
