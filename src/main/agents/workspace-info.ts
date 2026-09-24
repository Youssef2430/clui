import { execFile } from 'node:child_process'
import { homedir } from 'node:os'
import { promisify } from 'node:util'
import { getCliEnv } from '../cli-env'
const exec = promisify(execFile)
export async function getWorkspaceInfo(directory: string): Promise<{ branch: string | null; root: string | null }> {
  if (typeof directory !== 'string') throw new Error('A working directory is required')
  const cwd = directory === '~' ? homedir() : directory
  try {
    const { stdout } = await exec('git', ['-C', cwd, 'rev-parse', '--show-toplevel', '--abbrev-ref', 'HEAD'], { env: getCliEnv(), timeout: 5000 })
    const [root, ref] = stdout.trim().split('\n')
    return { root, branch: ref === 'HEAD' ? 'Detached' : ref || null }
  } catch { return { branch: null, root: null } }
}
