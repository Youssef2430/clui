import { SKILLS } from './manifest'
import { skillStore } from '../marketplace/catalog'

export type SkillState = 'pending' | 'downloading' | 'validating' | 'installed' | 'failed' | 'skipped'
export interface SkillStatus { name: string; state: SkillState; error?: string; reason?: 'up-to-date' | 'user-managed' }

/** Same canonical store as the directory; provisioning never blocks Electron's main loop. */
export async function ensureSkills(onStatus: (status: SkillStatus) => void = () => {}): Promise<void> {
  await skillStore.reconcile().catch(() => {})
  const installed = await skillStore.list()
  for (const entry of SKILLS) {
    if (installed.some(s => s.name === entry.name)) { onStatus({ name: entry.name, state: 'skipped', reason: 'up-to-date' }); continue }
    if (entry.source.type !== 'github') continue
    onStatus({ name: entry.name, state: 'downloading' })
    try {
      await skillStore.install({ name: entry.name, repo: entry.source.repo, path: entry.source.path, ref: entry.source.commitSha })
      onStatus({ name: entry.name, state: 'installed' })
    } catch (error) { onStatus({ name: entry.name, state: 'failed', error: error instanceof Error ? error.message : String(error) }) }
  }
}
