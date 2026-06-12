'use client'

import { useEffect, useRef } from 'react'
import ScrollReveal from './ScrollReveal'

export default function SectionSummon() {
  const optRef  = useRef<HTMLDivElement>(null)
  const spaceRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval> | undefined

    function pressKeys() {
      optRef.current?.classList.add('pressed')
      spaceRef.current?.classList.add('pressed')
      setTimeout(() => {
        optRef.current?.classList.remove('pressed')
        spaceRef.current?.classList.remove('pressed')
      }, 380)
    }

    const initialId = setTimeout(() => {
      pressKeys()
      intervalId = setInterval(pressKeys, 3000)
    }, 1500)

    return () => {
      clearTimeout(initialId)
      if (intervalId) clearInterval(intervalId)
    }
  }, [])

  return (
    <section className="split-section" id="summon">
      <div className="container">
        <div className="split-inner">
          <ScrollReveal className="split-text">
            <div className="section-label"><span className="section-index">01</span> The Overlay</div>
            <h2 className="section-heading">Press two keys.<br />Claude <em>appears</em>.</h2>
            <p className="section-sub">
              Option+Space summons Clui above every window, every app, wherever you are.
              Same shortcut sends it away. It leaves no trace — no dock icon, no menu clutter.
            </p>
          </ScrollReveal>

          <ScrollReveal delay={0.2}>
            <div className="split-visual">
              <div className="summon-stage">
                <div className="summon-overlay">
                  <div className="summon-bar">
                    <span className="summon-icon">
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M5 12h14M13 6l6 6-6 6" />
                      </svg>
                    </span>
                    <span className="summon-input">Ask Claude anything<span className="summon-caret" /></span>
                    <span className="summon-return">⏎</span>
                  </div>
                  <div className="summon-suggest">
                    <span className="summon-suggest-dot" />
                    Summoned above every window — no dock icon, no trace
                  </div>
                </div>

                <div className="kbd-showcase">
                  <div className="kbd-row">
                    <div ref={optRef} className="kbd-key key-option">⌥</div>
                    <span className="kbd-plus-lg">+</span>
                    <div ref={spaceRef} className="kbd-key key-space">Space</div>
                  </div>
                  <div className="kbd-hint">Option + Space</div>
                </div>
              </div>
            </div>
          </ScrollReveal>
        </div>
      </div>
    </section>
  )
}
