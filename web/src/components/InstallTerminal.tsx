'use client'

import { useEffect, useRef, useCallback } from 'react'
import ScrollReveal from './ScrollReveal'

/**
 * The install demo. Each command is "typed" character-by-character with a live
 * cursor, then the output lines appear one at a time as if the command ran.
 */
type Step =
  | { kind: 'command'; text: string }
  | { kind: 'output'; html: string; delay?: number }
  | { kind: 'blank' }

const SEQUENCE: Step[] = [
  { kind: 'command', text: 'brew tap Youssef2430/clui' },
  { kind: 'output', html: '<span class="term-info">==></span> Tapping Youssef2430/clui...', delay: 480 },
  { kind: 'output', html: '<span class="term-success">✓</span> <span class="term-info">Tapped 1 cask (Youssef2430/clui/clui)</span>', delay: 560 },
  { kind: 'blank' },
  { kind: 'command', text: 'brew install --cask clui' },
  { kind: 'output', html: '<span class="term-info">==></span> Downloading Clui.dmg...', delay: 520 },
  { kind: 'output', html: '<span class="term-info">######################################## 100.0%</span>', delay: 900 },
  { kind: 'output', html: '<span class="term-info">==></span> Installing Cask clui', delay: 520 },
  { kind: 'output', html: "<span class=\"term-info\">==></span> Moving App 'Clui.app' to '/Applications/Clui.app'", delay: 460 },
  { kind: 'output', html: '<span class="term-success">✓</span> clui was successfully installed!', delay: 420 },
  { kind: 'blank' },
  { kind: 'command', text: 'open -a Clui' },
  { kind: 'output', html: '<span class="term-success">✓</span> Clui is running · Press <span class="term-cmd">⌥ Space</span> to summon', delay: 620 },
]

const PROMPT = '<span class="term-prompt">~ $</span> '
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

export default function InstallTerminal() {
  const bodyRef = useRef<HTMLDivElement>(null)
  const restartRef = useRef<HTMLButtonElement>(null)
  const runIdRef = useRef(0)
  const started = useRef(false)

  const runTerminal = useCallback(async () => {
    const body = bodyRef.current
    const restartBtn = restartRef.current
    if (!body) return

    // Cancel any in-flight run and reset the surface
    const myRun = ++runIdRef.current
    const alive = () => runIdRef.current === myRun && !!bodyRef.current
    body.querySelectorAll('.terminal-line').forEach((el) => el.remove())
    body.querySelector('.terminal-cursor')?.remove()
    restartBtn?.classList.remove('visible')

    const cursor = document.createElement('span')
    cursor.className = 'terminal-cursor'

    const newLine = (): HTMLDivElement => {
      const div = document.createElement('div')
      div.className = 'terminal-line'
      if (restartBtn) body.insertBefore(div, restartBtn)
      else body.appendChild(div)
      requestAnimationFrame(() => div.classList.add('visible'))
      return div
    }

    await sleep(300)

    for (const step of SEQUENCE) {
      if (!alive()) return

      if (step.kind === 'blank') {
        const div = newLine()
        div.innerHTML = '&nbsp;'
        await sleep(220)
        continue
      }

      if (step.kind === 'output') {
        await sleep(step.delay ?? 420)
        if (!alive()) return
        cursor.remove()
        const div = newLine()
        div.innerHTML = step.html
        continue
      }

      // command — render the prompt, then type the text out, cursor trailing
      const div = newLine()
      div.innerHTML = PROMPT
      const cmd = document.createElement('span')
      cmd.className = 'term-cmd'
      div.appendChild(cmd)
      div.appendChild(cursor)
      await sleep(360)
      for (const ch of step.text) {
        if (!alive()) return
        cmd.textContent += ch
        // jittered keystroke cadence so it reads like real typing
        await sleep(34 + Math.random() * 46 + (ch === ' ' ? 30 : 0))
      }
      await sleep(380) // beat before the command "runs"
    }

    if (!alive()) return
    // Leave a ready prompt blinking, then offer a replay
    const ready = newLine()
    ready.innerHTML = PROMPT
    ready.appendChild(cursor)
    await sleep(500)
    if (alive()) restartBtn?.classList.add('visible')
  }, [])

  useEffect(() => {
    const term = bodyRef.current?.closest('.terminal') as HTMLElement | null
    if (!term || started.current) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          started.current = true
          void runTerminal()
          observer.unobserve(term)
        }
      },
      { threshold: 0.3 }
    )
    observer.observe(term)
    return () => {
      observer.disconnect()
      runIdRef.current = -1 // cancel any in-flight run on unmount
    }
  }, [runTerminal])

  return (
    <ScrollReveal delay={0.1}>
      <div className="terminal" id="installTerminal">
        <div className="terminal-bar">
          <div className="terminal-dot terminal-dot-red" />
          <div className="terminal-dot terminal-dot-yellow" />
          <div className="terminal-dot terminal-dot-green" />
          <div className="terminal-title">Terminal — zsh</div>
        </div>
        <div className="terminal-body" ref={bodyRef}>
          <button
            ref={restartRef}
            className="terminal-restart"
            aria-label="Replay animation"
            onClick={() => void runTerminal()}
          >
            <svg viewBox="0 0 24 24">
              <polyline points="1 4 1 10 7 10" />
              <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
            </svg>
            Replay
          </button>
        </div>
      </div>
    </ScrollReveal>
  )
}
