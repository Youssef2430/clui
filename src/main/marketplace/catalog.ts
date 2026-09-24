import { net } from 'electron'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { lstat, readlink } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import type { CatalogPlugin } from '../../shared/types'
import { SkillStore } from './skill-store'
import { availableSkillTargets } from './targets'

const SOURCES = ['anthropics/skills', 'vercel-labs/agent-skills', 'vercel-labs/skills', 'anthropics/knowledge-work-plugins', 'anthropics/financial-services-plugins']
export const skillStore = new SkillStore(join(process.env.GLUI_USER_DATA_DIR || process.env.GLUI_HOME || join(homedir(), '.glui'), 'skills'), availableSkillTargets)
let cached: CatalogPlugin[] = []
let cachedAt = 0
let pending: Promise<{ plugins: CatalogPlugin[]; error: string | null }> | null = null

async function fetchText(url: string): Promise<string> {
  const result = await net.fetch(url, { signal: AbortSignal.timeout(25_000), headers: { 'User-Agent': 'GLUI-Skills' } })
  if (!result.ok) throw new Error(`Source returned ${result.status}. Try again shortly.`)
  return result.text()
}
export function parseSkillFrontmatter(content: string): { name: string; description: string } {
  const front = content.match(/^---\s*\r?\n([\s\S]*?)\r?\n---/)
  if (!front) return { name: '', description: '' }
  const value = (key: string) => {
    const match = front[1]!.match(new RegExp(`^${key}:\\s*(.*)$`, 'm'))
    if (!match) return ''
    if (/^[>|][-+]?\s*$/.test(match[1]!)) {
      const after = front[1]!.slice(match.index! + match[0].length)
      return (after.match(/^(?:\r?\n[ \t]+[^\r\n]*)+/)?.[0] ?? '').trim().replace(/\s+/g, ' ')
    }
    return match[1]!.trim().replace(/^["']|["']$/g, '')
  }
  return { name: value('name'), description: value('description') }
}
async function sourceCatalog(repo: string): Promise<CatalogPlugin[]> {
  const commit = JSON.parse(await fetchText(`https://api.github.com/repos/${repo}/commits/HEAD`)) as { sha: string }
  const tree = JSON.parse(await fetchText(`https://api.github.com/repos/${repo}/git/trees/${commit.sha}?recursive=1`)) as { sha: string; truncated?: boolean; tree: Array<{ path: string; type: string }> }
  if (tree.truncated) throw new Error(`${repo}: source directory is too large`)
  const paths = tree.tree.filter(p => p.type === 'blob' && p.path.endsWith('/SKILL.md') && !p.path.split('/').some(segment => ['node_modules', '.git', 'test', 'tests', 'fixtures', '.system'].includes(segment)))
  const result: CatalogPlugin[] = []
  // A small worker pool avoids hundreds of simultaneous requests and keeps the app responsive.
  let index = 0
  await Promise.all(Array.from({ length: 6 }, async () => {
    while (index < paths.length) {
      const path = paths[index++]!.path
      const data = parseSkillFrontmatter(await fetchText(`https://raw.githubusercontent.com/${repo}/${commit.sha}/${path}`))
      if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(data.name) || !data.description) continue
      const sourcePath = path.slice(0, -'/SKILL.md'.length)
      result.push({ id: `${repo}/${sourcePath}`, name: data.name, description: data.description, version: commit.sha.slice(0, 7), revision: commit.sha, author: repo.split('/')[0]!, marketplace: repo, repo, sourcePath, installName: data.name, category: 'Agent Skills', tags: deriveSemanticTags(data.name, data.description, path), isSkillMd: true })
    }
  }))
  return result
}
async function loadCatalog(force?: boolean) {
  if (!force && cached.length && Date.now() - cachedAt < 300_000) return { plugins: cached, error: null }
  const results = await Promise.allSettled(SOURCES.map(sourceCatalog))
  const plugins = results.flatMap(r => r.status === 'fulfilled' ? r.value : [])
  const failed = results.filter(r => r.status === 'rejected').length
  if (plugins.length) { cached = plugins.sort((a, b) => a.name.localeCompare(b.name)); cachedAt = Date.now() }
  return { plugins: cached, error: failed ? `${failed} source${failed === 1 ? '' : 's'} could not be refreshed.${cached.length ? ' Available skills are shown.' : ' Check your connection and try again.'}` : null }
}
export async function fetchCatalog(forceRefresh?: boolean) {
  if (!pending) pending = loadCatalog(forceRefresh).finally(() => { pending = null })
  const [catalog, targets] = await Promise.all([pending, availableSkillTargets()])
  const installed = await skillStore.list()
  const plugins = await Promise.all(catalog.plugins.map(async plugin => {
    const own = installed.find(s => s.id === plugin.id)
    const linked: string[] = []
    for (const link of own?.links ?? []) {
      try { if ((await lstat(link.path)).isSymbolicLink() && resolve(dirname(link.path), await readlink(link.path)) === join(skillStore.root, plugin.installName)) linked.push(link.provider) } catch {}
    }
    return { ...plugin, managed: !!own, installedProviders: linked }
  }))
  return { ...catalog, plugins, targets: targets.map(({ id, name }) => ({ id, name })) }
}
export async function listInstalled(): Promise<string[]> { return (await skillStore.list()).map(s => s.id) }
export async function installPlugin(repo: string, name: string, _marketplace: string, path?: string, isSkillMd?: boolean): Promise<{ ok: boolean; error?: string }> {
  try {
    if (isSkillMd === false) throw new Error('This is an agent-specific plugin. Choose a portable skill from the directory.')
    const selected = cached.find(p => p.repo === repo && p.sourcePath === path && p.installName === name)
    await skillStore.install({ repo, name, path: path || `skills/${name}`, ...(selected?.revision ? { ref: selected.revision } : {}) })
    return { ok: true }
  } catch (error) { return { ok: false, error: error instanceof Error ? error.message : String(error) } }
}
export async function uninstallPlugin(name: string): Promise<{ ok: boolean; error?: string }> {
  try { await skillStore.uninstall(name); return { ok: true } } catch (error) { return { ok: false, error: error instanceof Error ? error.message : String(error) } }
}

const TAG_RULES: Array<{ tag: string; patterns: RegExp }> = [
  { tag: 'Design',       patterns: /\b(figma|ui|ux|design|sketch|prototype|wireframe|layout|css|style|visual)\b/i },
  { tag: 'Product',      patterns: /\b(prd|roadmap|strategy|product|backlog|prioriti[sz]|feature\s*request|user\s*stor)\b/i },
  { tag: 'Research',     patterns: /\b(research|interview|insights?|survey|user\s*study|ethnograph|discover)\b/i },
  { tag: 'Docs',         patterns: /\b(doc(ument)?s?|writing|spec(ification)?|readme|markdown|technical\s*writ|content)\b/i },
  { tag: 'Spreadsheet',  patterns: /\b(sheet|spreadsheet|xlsx?|csv|tabular|pivot|formula)\b/i },
  { tag: 'Slides',       patterns: /\b(slides?|presentation|deck|pptx?|keynote|pitch)\b/i },
  { tag: 'Analysis',     patterns: /\b(analy[sz](is|e|ing)|insight|metric|dashboard|report(ing)?|data\s*viz|statistic)\b/i },
  { tag: 'Finance',      patterns: /\b(financ|accounting|budget|revenue|forecast|valuation|portfolio|investment)\b/i },
  { tag: 'Compliance',   patterns: /\b(risk|audit|policy|compliance|regulat|governance|sox|gdpr|hipaa)\b/i },
  { tag: 'Management',   patterns: /\b(manag|planning|meeting|ops|operations|team|workflow|project\s*plan)\b/i },
  { tag: 'Automation',   patterns: /\b(automat|workflow|pipeline|ci\s*cd|deploy|integrat|orchestrat|script)\b/i },
  { tag: 'Code',         patterns: /\b(code|coding|program|develop|engineer|debug|refactor|test(ing)?|linter?)\b/i },
  { tag: 'Creative',     patterns: /\b(creative|brainstorm|ideation|copywriting|storytelling|narrative)\b/i },
  { tag: 'Sales',        patterns: /\b(sales|crm|prospect|lead|deal|pipeline|outreach|cold\s*(call|email))\b/i },
  { tag: 'Support',      patterns: /\b(support|customer|helpdesk|ticket|troubleshoot|faq|knowledge\s*base)\b/i },
  { tag: 'Security',     patterns: /\b(secur|vulnerabilit|pentest|threat|encrypt|auth(enticat|ori[sz]))\b/i },
  { tag: 'Data',         patterns: /\b(data|database|sql|etl|warehouse|lake|ingest|transform|schema)\b/i },
  { tag: 'AI/ML',        patterns: /\b(ai|ml|machine\s*learn|model|train|inference|llm|prompt|embed)\b/i },
]

function deriveSemanticTags(name: string, description: string, skillPath: string): string[] {
  const text = `${name} ${description} ${skillPath}`.toLowerCase()
  const matched: string[] = []
  for (const rule of TAG_RULES) {
    if (rule.patterns.test(text)) {
      matched.push(rule.tag)
    }
    if (matched.length >= 2) break // Cap at 2 semantic tags
  }
  return matched
}
