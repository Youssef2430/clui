'use client'

import { X, Check } from '@phosphor-icons/react'
import ScrollReveal from './ScrollReveal'

export default function SectionVoice() {
  return (
    <section className="split-section" id="voice">
      <div className="container">
        <div className="split-inner reversed">
          <ScrollReveal className="split-text">
            <div className="section-label"><span className="section-index">04</span> Voice Input</div>
            <h2 className="section-heading">Speak your intent.<br />Claude <em>listens</em>.</h2>
            <p className="section-sub">
              Tap the mic and dictate naturally. Clui transcribes locally, then drops the text
              straight into the prompt — confirm with a tap, or cancel and try again. Ideal for
              long prompts, fast ideas, and hands-free workflows.
            </p>
          </ScrollReveal>

          <ScrollReveal delay={0.2}>
            <div className="split-visual">
              {/* The input pill in its recording state — mirrors InputBar voice controls */}
              <div className="voice-stage">
                <div className="summon-pill app-glass">
                  <div className="voice-waveform">
                    {Array.from({ length: 13 }).map((_, i) => (
                      <div key={i} className="voice-wv-bar" />
                    ))}
                  </div>
                  <button className="summon-circle-btn voice-cancel" title="Cancel"><X size={15} weight="bold" /></button>
                  <button className="summon-send" title="Confirm"><Check size={15} weight="bold" /></button>
                </div>
                <div className="voice-meta">
                  <span className="voice-label"><span className="voice-label-dot" />Recording — ✓ to confirm, ✕ to cancel</span>
                </div>
                <div className="voice-transcript">
                  &ldquo;Refactor the login flow to use refresh tokens and update the middleware to validate expiry on every request.&rdquo;
                </div>
              </div>
            </div>
          </ScrollReveal>
        </div>
      </div>
    </section>
  )
}
