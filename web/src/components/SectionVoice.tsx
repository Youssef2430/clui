import ScrollReveal from './ScrollReveal'

export default function SectionVoice() {
  return (
    <section className="split-section" id="voice">
      <div className="container">
        <div className="split-inner reversed">
          <ScrollReveal className="split-text">
            <div className="section-label">Voice Input</div>
            <h2 className="section-heading">Speak your intent.<br />Claude listens.</h2>
            <p className="section-sub">
              Activate voice mode and dictate naturally. Clui transcribes in real time and sends
              your message the moment you stop speaking. Ideal for long prompts, fast ideas, and
              hands-free workflows.
            </p>
          </ScrollReveal>

          <ScrollReveal delay={0.2}>
            <div className="split-visual">
              <div className="voice-showcase">
                <div className="voice-waveform">
                  {Array.from({ length: 13 }).map((_, i) => (
                    <div key={i} className="voice-wv-bar" />
                  ))}
                </div>
                <div className="voice-label">
                  <div className="voice-label-dot" />
                  Listening&hellip;
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
