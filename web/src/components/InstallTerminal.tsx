'use client'

import { useEffect, useRef, useCallback } from 'react'
import ScrollReveal from './ScrollReveal'

const LINES = [
  { html: '<span class="term-prompt">~ $</span> <span class="term-cmd">brew tap Youssef2430/clui</span>', delay: 400 },
  { html: '<span class="term-info">==></span> Tapping Youssef2430/clui...', delay: 600 },
  { html: '<span class="term-success">✓</span> <span class="term-info">Tapped 1 cask (Youssef2430/clui/clui)</span>', delay: 900 },
  { html: '', delay: 300 },
  { html: '<span class="term-prompt">~ $</span> <span class="term-cmd">brew install --cask clui</span>', delay: 500 },
  { html: '<span class="term-info">==></span> Downloading Clui.dmg...', delay: 700 },
  { html: '<span class="term-info">######################################## 100.0%</span>', delay: 1200 },
  { html: '<span class="term-info">==></span> Installing Cask clui', delay: 600 },
  { html: '<span class="term-info">==></span> Moving App \'Clui.app\' to \'/Applications/Clui.app\'', delay: 500 },
  { html: '<span class="term-success">✓</span> clui was successfully installed!', delay: 400 },
  { html: '', delay: 300 },
  { html: '<span class="term-prompt">~ $</span> <span class="term-cmd">open -a Clui</span>', delay: 600 },
  { html: '<span class="term-success">✓</span> Clui is running · Press <span class="term-cmd">⌥ Space</span> to summon', delay: 800 },
]

export default function InstallTerminal() {
  const bodyRef    = useRef<HTMLDivElement>(null)
  const restartRef = useRef<HTMLButtonElement>(null)
  const lineEls    = useRef<HTMLDivElement[]>([])
  const timers     = useRef<ReturnType<typeof setTimeout>[]>([])
  const started    = useRef(false)

  const runTerminal = useCallback(() => {
    const body = bodyRef.current
    const restartBtn = restartRef.current
    if (!body) return

    // Clear previous
    timers.current.forEach(clearTimeout)
    timers.current = []
    lineEls.current.forEach(el => el.remove())
    lineEls.current = []
    restartBtn?.classList.remove('visible')
    body.querySelector('.terminal-cursor')?.remove()

    let totalDelay = 0

    LINES.forEach((line, i) => {
      totalDelay += line.delay
      const t = setTimeout(() => {
        body.querySelector('.terminal-cursor')?.remove()

        const div = document.createElement('div')
        div.className = 'terminal-line'

        if (!line.html) {
          div.innerHTML = '&nbsp;'
        } else {
          div.innerHTML = line.html
          if (i < LINES.length - 1 && line.html.includes('term-prompt')) {
            const cursor = document.createElement('span')
            cursor.className = 'terminal-cursor'
            div.appendChild(cursor)
          }
        }

        if (restartBtn) body.insertBefore(div, restartBtn)
        else body.appendChild(div)
        lineEls.current.push(div)

        requestAnimationFrame(() => div.classList.add('visible'))

        if (i === LINES.length - 1) {
          const t2 = setTimeout(() => restartBtn?.classList.add('visible'), 600)
          timers.current.push(t2)
        }
      }, totalDelay)
      timers.current.push(t)
    })
  }, [])

  useEffect(() => {
    const term = bodyRef.current?.closest('.terminal') as HTMLElement | null
    if (!term || started.current) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          started.current = true
          const t = setTimeout(runTerminal, 400)
          timers.current.push(t)
          observer.unobserve(term)
        }
      },
      { threshold: 0.3 }
    )
    observer.observe(term)
    return () => { observer.disconnect(); timers.current.forEach(clearTimeout) }
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
            onClick={runTerminal}
          >
            <svg viewBox="0 0 24 24">
              <polyline points="1 4 1 10 7 10"/>
              <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>
            </svg>
            Replay
          </button>
        </div>
      </div>
    </ScrollReveal>
  )
}
