'use client'

import { useEffect, useRef } from 'react'
import { Paperclip, Camera, HeadCircuit, Microphone, ArrowUp } from '@phosphor-icons/react'
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
              {/* Faithful recreation of Clui's floating input pill + stacked circle buttons */}
              <div className="summon-stage">
                <div className="summon-row">
                  <div className="summon-circles">
                    <button className="summon-circle app-glass" title="Skills"><HeadCircuit size={17} /></button>
                    <button className="summon-circle app-glass" title="Screenshot"><Camera size={17} /></button>
                    <button className="summon-circle app-glass" title="Attach"><Paperclip size={17} /></button>
                  </div>
                  <div className="summon-pill app-glass">
                    <span className="summon-pill-text">Ask Claude Code anything…<span className="summon-caret" /></span>
                    <button className="summon-mic" title="Voice"><Microphone size={16} /></button>
                    <button className="summon-send" title="Send"><ArrowUp size={16} weight="bold" /></button>
                  </div>
                </div>

                <div className="kbd-showcase">
                  <div className="kbd-row">
                    <div ref={optRef} className="kbd-key key-option">⌥</div>
                    <span className="kbd-plus-lg">+</span>
                    <div ref={spaceRef} className="kbd-key key-space">Space</div>
                  </div>
                  <div className="kbd-hint">Summon from anywhere · no dock icon, no trace</div>
                </div>
              </div>
            </div>
          </ScrollReveal>
        </div>
      </div>
    </section>
  )
}
