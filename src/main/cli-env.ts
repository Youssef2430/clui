import { execFileSync } from 'child_process'
import { homedir } from 'node:os'
import { join } from 'node:path'

let cachedPath: string | null = null

function appendPathEntries(target: string[], seen: Set<string>, rawPath: string | undefined): void {
  if (!rawPath) return
  for (const entry of rawPath.split(':')) {
    const p = entry.trim()
    if (!p || seen.has(p)) continue
    seen.add(p)
    target.push(p)
  }
}

export function getCliPath(): string {
  if (cachedPath) return cachedPath

  const ordered: string[] = []
  const seen = new Set<string>()
  const shellEnv = { ...process.env }
  if (process.env.npm_execpath || process.env.npm_lifecycle_event) {
    shellEnv.PATH = (process.env.PATH ?? '').split(':').filter(entry => !/(?:^|\/)node_modules\/\.bin\/?$/.test(entry)).join(':')
  }

  // Match the user's terminal first. npm injects ancestor node_modules/.bin
  // directories into a development launch; those can contain an obsolete
  // agent which would otherwise shadow the user's current CLI installation.
  const pathCommands = [
    ['/bin/zsh', '-ilc'],
    ['/bin/zsh', '-lc'],
    ['/bin/bash', '-lc'],
  ]

  for (const [shell, mode] of pathCommands) {
    try {
      // Pass the command as an argument so the login shell expands its own
      // PATH, rather than the parent shell substituting the GUI's short PATH.
      const discovered = execFileSync(shell!, [mode!, 'printf %s "$PATH"'], { env: shellEnv, encoding: 'utf-8', timeout: 3000, stdio: ['ignore', 'pipe', 'ignore'] }).trim()
      appendPathEntries(ordered, seen, discovered)
      if (discovered) break
    } catch {
      // Keep trying fallbacks.
    }
  }

  appendPathEntries(ordered, seen, process.env.PATH)
  appendPathEntries(ordered, seen, join(homedir(), '.local', 'bin'))
  appendPathEntries(ordered, seen, '/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin')

  cachedPath = ordered.join(':')
  return cachedPath
}

export function getCliEnv(extraEnv?: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    ...extraEnv,
    PATH: getCliPath(),
  }
  delete env.CLAUDECODE
  return env
}
