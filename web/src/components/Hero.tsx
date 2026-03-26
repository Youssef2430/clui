'use client'

import { useEffect, useRef } from 'react'

export default function Hero() {
  const containerRef = useRef<HTMLDivElement>(null)

  // Stagger-reveal hero elements immediately on mount
  useEffect(() => {
    const els = containerRef.current?.querySelectorAll<HTMLElement>('.reveal')
    els?.forEach((el, i) => {
      setTimeout(() => el.classList.add('visible'), i * 90)
    })
  }, [])

  const smoothScroll = (e: React.MouseEvent<HTMLAnchorElement>, id: string) => {
    e.preventDefault()
    document.querySelector(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div ref={containerRef}>
      <div className="reveal" style={{ marginBottom: 0 }}>
        <div className="hero-badge">
          <div className="hero-badge-dot" />
          macOS — Free &amp; Open Source
        </div>
      </div>

      <h1 className="hero-heading reveal reveal-delay-1">
        The better UI<br />for <em>Claude Code</em>
      </h1>

      <p className="hero-sub reveal reveal-delay-2">
        A calm, floating overlay that stays out of your way until you need it. No API key. No friction.
      </p>

      <div className="reveal reveal-delay-3" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, flexWrap: 'wrap' }}>
        <a href="#install" onClick={(e) => smoothScroll(e, '#install')} className="btn-primary">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M7 1v8M4 6l3 3 3-3M2 11h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Install with Homebrew
        </a>
        <a href="https://github.com/Youssef2430/clui" target="_blank" rel="noopener" className="btn-ghost">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C6.477 2 2 6.477 2 12c0 4.418 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.009-.868-.013-1.703-2.782.604-3.369-1.34-3.369-1.34-.454-1.155-1.11-1.463-1.11-1.463-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0 1 12 6.836c.85.004 1.705.114 2.504.336 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.579.688.481C19.138 20.163 22 16.418 22 12c0-5.523-4.477-10-10-10z"/>
          </svg>
          View on GitHub
        </a>
      </div>

      <p className="hero-meta reveal reveal-delay-4">
        <span>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="12" cy="12" r="10"/>
            <path d="M12 6v6l4 2"/>
          </svg>
          Takes 30 seconds to install
        </span>
        &nbsp;&nbsp;&middot;&nbsp;&nbsp;
        <span>macOS 13+ required</span>
        &nbsp;&nbsp;&middot;&nbsp;&nbsp;
        <span>Requires Claude Code CLI</span>
      </p>
    </div>
  )
}
