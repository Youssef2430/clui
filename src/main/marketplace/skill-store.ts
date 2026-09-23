import { cp, lstat, mkdir, mkdtemp, readFile, readdir, readlink, rename, rm, symlink, unlink, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const exec = promisify(execFile)
const NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const META = '.glui-install.json'
export interface SkillSource { repo: string; name: string; path: string; ref?: string }
export interface SkillTarget { id: string; name: string; directory: string }
export interface SkillInstallation { id: string; name: string; repo: string; sourcePath: string; revision: string; installedAt: string; links: Array<{ provider: string; path: string }> }
const stat = async (path: string) => { try { return await lstat(path) } catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null; throw e } }
const ownedLink = async (path: string, target: string) => (await stat(path))?.isSymbolicLink() && resolve(dirname(path), await readlink(path)) === resolve(target)

export function validateSkillSource(source: SkillSource) {
  if (!NAME.test(source.name) || source.name.length > 64) throw new Error('Invalid skill name')
  if (!/^[\w.-]+\/[\w.-]+$/.test(source.repo) || source.repo.split('/').some(p => p === '.' || p === '..')) throw new Error('Use a GitHub owner/repository source')
  if (!source.path || isAbsolute(source.path) || source.path.split(/[\\/]/).some(p => !p || p === '.' || p === '..') || source.path.startsWith('-')) throw new Error('Invalid skill source path')
  if (source.ref && !/^[\w./-]+$/.test(source.ref)) throw new Error('Invalid source revision')
}

/** Download complete folders; never run a repository's hooks, scripts, or package installers. */
export async function downloadSkill(source: SkillSource): Promise<{ directory: string; revision: string; cleanup: () => Promise<void> }> {
  validateSkillSource(source)
  const temp = await mkdtemp(join(tmpdir(), 'glui-skill-'))
  const checkout = join(temp, 'repo')
  const git = (args: string[]) => exec('git', ['-c', 'core.hooksPath=/dev/null', ...args], { timeout: 90_000, maxBuffer: 2 * 1024 * 1024, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } })
  try {
    await git(['clone', '--depth', '1', '--filter=blob:none', '--sparse', '--', `https://github.com/${source.repo}.git`, checkout])
    if (source.ref) { await git(['-C', checkout, 'fetch', '--depth', '1', 'origin', source.ref]); await git(['-C', checkout, 'checkout', '--detach', 'FETCH_HEAD']) }
    await git(['-C', checkout, 'sparse-checkout', 'set', '--skip-checks', '--', source.path])
    const { stdout } = await git(['-C', checkout, 'rev-parse', 'HEAD'])
    return { directory: join(checkout, source.path), revision: stdout.trim(), cleanup: () => rm(temp, { recursive: true, force: true }) }
  } catch (error) { await rm(temp, { recursive: true, force: true }); throw error }
}

/** A single copy with per-agent links. Ownership is recorded with the copy, never inferred from a name. */
export class SkillStore {
  private tail: Promise<unknown> = Promise.resolve()
  constructor(readonly root: string, private targets: () => Promise<SkillTarget[]>, private download = downloadSkill) {}
  private serial<T>(work: () => Promise<T>): Promise<T> {
    const next = this.tail.then(work, work); this.tail = next.catch(() => {}); return next
  }
  async list(): Promise<SkillInstallation[]> {
    const entries = await readdir(this.root, { withFileTypes: true }).catch((error: NodeJS.ErrnoException) => { if (error.code === 'ENOENT') return []; throw error })
    const result: SkillInstallation[] = []
    for (const entry of entries) {
      if (!entry.isDirectory() || !NAME.test(entry.name)) continue
      const meta = await this.readMeta(join(this.root, entry.name))
      if (meta) result.push(meta)
    }
    return result
  }
  private async readMeta(path: string): Promise<SkillInstallation | null> {
    try { const meta = JSON.parse(await readFile(join(path, META), 'utf8')) as SkillInstallation; return meta.name === path.split(sep).at(-1) && meta.id === `${meta.repo}/${meta.sourcePath}` && Array.isArray(meta.links) ? meta : null } catch { return null }
  }
  install(source: SkillSource): Promise<SkillInstallation> { return this.serial(async () => {
    validateSkillSource(source)
    const targets = await this.targets()
    if (!targets.length) throw new Error('Install an agent first, then add this skill.')
    const target = join(this.root, source.name), id = `${source.repo}/${source.path}`
    const old = await this.readMeta(target)
    if (await stat(target) && old?.id !== id) throw new Error(`A different skill already owns ${source.name}. Nothing was replaced.`)
    const links = targets.map(t => ({ provider: t.id, path: join(t.directory, source.name) }))
    for (const link of links) {
      if (await stat(link.path) && !await ownedLink(link.path, target)) throw new Error(`${link.provider} already has “${source.name}”. Its existing skill was kept.`)
    }
    const downloaded = await this.download(source)
    await mkdir(this.root, { recursive: true })
    const stage = join(this.root, `.install-${randomUUID()}`), backup = join(this.root, `.backup-${randomUUID()}`)
    const made: string[] = []
    let swapped = false, backedUp = false
    try {
      // Reject links and special files in untrusted repositories before copying anything.
      const inspect = async (path: string): Promise<void> => {
        const info = await lstat(path)
        if (info.isSymbolicLink() || (!info.isFile() && !info.isDirectory())) throw new Error('This skill contains unsupported symbolic links or special files.')
        if (info.isDirectory()) for (const entry of await readdir(path)) await inspect(join(path, entry))
      }
      await inspect(downloaded.directory)
      const content = await readFile(join(downloaded.directory, 'SKILL.md'), 'utf8')
      if (!/^---\s*\r?\n/.test(content) || !/^name:\s*.+/m.test(content) || !/^description:\s*.+/m.test(content)) throw new Error('This folder does not contain a valid SKILL.md.')
      const declaredName = content.match(/^name:\s*["']?([^\r\n"']+)/m)?.[1]?.trim()
      if (declaredName !== source.name) throw new Error(`Skill name “${declaredName}” does not match “${source.name}”.`)
      await cp(downloaded.directory, stage, { recursive: true, errorOnExist: true })
      const metadata: SkillInstallation = { id, name: source.name, repo: source.repo, sourcePath: source.path, revision: downloaded.revision, installedAt: new Date().toISOString(), links: [...(old?.links ?? []).filter(l => !links.some(next => next.path === l.path)), ...links] }
      await writeFile(join(stage, META), JSON.stringify(metadata, null, 2) + '\n')
      if (await stat(target)) { await rename(target, backup); backedUp = true }
      await rename(stage, target); swapped = true
      for (const link of links) {
        await mkdir(dirname(link.path), { recursive: true })
        if (!await ownedLink(link.path, target)) { await symlink(relative(dirname(link.path), target), link.path, 'dir'); made.push(link.path) }
      }
      if (backedUp) await rm(backup, { recursive: true, force: true })
      return metadata
    } catch (error) {
      for (const path of made) if (await ownedLink(path, target)) await unlink(path)
      if (swapped) await rm(target, { recursive: true, force: true })
      if (backedUp) await rename(backup, target)
      throw error
    } finally { await rm(stage, { recursive: true, force: true }); await downloaded.cleanup() }
  }) }
  uninstall(name: string): Promise<void> { return this.serial(async () => {
    if (!NAME.test(name)) throw new Error('Invalid skill name')
    const target = join(this.root, name), meta = await this.readMeta(target)
    if (!meta) throw new Error('This skill is not managed by GLUI. Its files were kept.')
    for (const link of meta.links) if (await ownedLink(link.path, target)) await unlink(link.path)
    await rm(target, { recursive: true, force: true })
  }) }
  /** Newly installed agents receive links next time the directory is opened. Existing files always win. */
  reconcile(): Promise<void> { return this.serial(async () => {
    const targets = await this.targets()
    for (const meta of await this.list()) {
      const target = join(this.root, meta.name)
      for (const provider of targets) {
        const path = join(provider.directory, meta.name)
        if (!await stat(path)) { await mkdir(provider.directory, { recursive: true }); await symlink(relative(provider.directory, target), path, 'dir') }
        if (await ownedLink(path, target) && !meta.links.some(l => l.path === path)) meta.links.push({ provider: provider.id, path })
      }
      const temporary = join(target, `${META}.tmp`)
      await writeFile(temporary, JSON.stringify(meta, null, 2) + '\n'); await rename(temporary, join(target, META))
    }
  }) }
}
