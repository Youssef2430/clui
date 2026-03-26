import ScrollReveal from './ScrollReveal'

export default function Callout() {
  return (
    <section style={{ padding: '96px 0' }}>
      <div className="container">
        <ScrollReveal>
          <div className="callout-inner">
            <div className="callout-eyebrow">Free &amp; Open Source</div>
            <h2 className="callout-heading">Your terminal just got a window.</h2>
            <p className="callout-sub">
              No subscription. No API key. No drama.<br />
              Just a quieter way to work with Claude.
            </p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
              <a href="#install" className="btn-primary">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M7 1v8M4 6l3 3 3-3M2 11h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                Install free
              </a>
              <a href="https://github.com/Youssef2430/clui" target="_blank" rel="noopener" className="btn-ghost">
                Star on GitHub ↗
              </a>
            </div>
          </div>
        </ScrollReveal>
      </div>
    </section>
  )
}
