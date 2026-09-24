import { EventEmitter } from 'node:events'
import { RunManager as ClaudeRunManager } from '../claude/run-manager'
import { NativeRun } from './native-run'
import type { EnrichedError, RunOptions } from '../../shared/types'

/** Provider boundary: orchestration only sees normalized events and run lifecycle. */
export class AgentRunManager extends EventEmitter {
  private claude = new ClaudeRunManager()
  private runs = new Map<string, NativeRun>()
  private finished = new Map<string, NativeRun>()
  constructor() {
    super()
    for (const event of ['normalized', 'exit', 'error', 'raw']) this.claude.on(event, (...args) => this.emit(event, ...args))
  }
  startRun(id: string, options: RunOptions): { pid: number | null } {
    if (!options.provider || options.provider === 'claude') return this.claude.startRun(id, options)
    const run = new NativeRun(options)
    this.runs.set(id, run)
    run.on('event', event => this.emit('normalized', id, event))
    run.once('exit', (code, signal, session) => {
      this.runs.delete(id); this.finished.set(id, run)
      if (this.finished.size > 30) this.finished.delete(this.finished.keys().next().value!)
      this.emit('exit', id, code, signal, session)
      run.removeAllListeners()
    })
    queueMicrotask(() => { void run.start() })
    return { pid: run.pid }
  }
  cancel(id: string) { const run = this.runs.get(id); if (run) { void run.cancel(); return true }; return this.claude.cancel(id) }
  isRunning(id: string) { return this.runs.has(id) || this.claude.isRunning(id) }
  writeToStdin(id: string, value: any) { return this.claude.writeToStdin(id, value) }
  async respond(id: string, question: string, answer: unknown) { return this.runs.get(id)?.respond(question, answer) ?? false }
  getClaudeInfo() { return this.claude.getClaudeInfo() }
  getEnrichedError(id: string, code: number | null): EnrichedError {
    const run = this.runs.get(id) || this.finished.get(id)
    if (!run) return this.claude.getEnrichedError(id, code)
    return { message: `${run.options.provider} run ended${code ? ` (${code})` : ''}`, stderrTail: run.stderr, exitCode: code, elapsedMs: Date.now() - run.startedAt, toolCallCount: run.toolCallCount, sawPermissionRequest: run.sawPermissionRequest }
  }
}
