import ScrollReveal from './ScrollReveal'

const FEATURES = [
  {
    icon: (
      <svg viewBox="0 0 24 24"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M8 4v16"/><path d="M2 9h6"/></svg>
    ),
    name: 'Multi-tab sessions',
    desc: 'Run independent Claude conversations in parallel. Switch contexts instantly without losing any thread or history.',
  },
  {
    icon: (
      <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>
    ),
    name: 'Dual theme',
    desc: 'Light and dark modes crafted with the same care. Follows your system setting automatically, or pin your preference.',
  },
  {
    icon: (
      <svg viewBox="0 0 24 24"><polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/></svg>
    ),
    name: 'Auto-updater',
    desc: 'Updates ship silently in the background. You always have the latest without ever thinking about it.',
  },
  {
    icon: (
      <svg viewBox="0 0 24 24"><line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="16" y2="12"/><line x1="4" y1="18" x2="7" y2="18"/><path d="M17 15l2 2 4-4"/></svg>
    ),
    name: 'Slash commands',
    desc: 'Type / to surface your full skill library. Run complex workflows with a single keystroke.',
  },
  {
    icon: (
      <svg viewBox="0 0 24 24"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
    ),
    name: 'File & screenshot attach',
    desc: 'Drag-drop files or capture a screen region directly into any message. Claude sees exactly what you see.',
  },
  {
    icon: (
      <svg viewBox="0 0 24 24"><path d="M9 12l2 2 4-4"/><path d="M21 12c0 4.97-4.03 9-9 9s-9-4.03-9-9 4.03-9 9-9c1.5 0 2.91.37 4.16 1.02"/></svg>
    ),
    name: 'No API key needed',
    desc: 'Clui uses your existing Claude Code CLI authentication. If Claude Code works, Clui works — immediately.',
  },
]

export default function FeaturesList() {
  return (
    <section className="features-list-section" id="features">
      <div className="container">
        <ScrollReveal className="features-list-header">
          <div className="section-label">Everything else</div>
          <h2 className="section-heading">Built to go the distance.</h2>
          <p className="section-sub" style={{ maxWidth: 460 }}>Every detail has earned its place. Nothing shipped until it felt right.</p>
        </ScrollReveal>

        <div className="features-list">
          {FEATURES.map((f, i) => (
            <ScrollReveal key={f.name} delay={(i % 3 + 1) * 0.1} className="feature-row">
              <div className="feature-row-icon">{f.icon}</div>
              <div className="feature-row-name">{f.name}</div>
              <div className="feature-row-desc">{f.desc}</div>
            </ScrollReveal>
          ))}
        </div>
      </div>
    </section>
  )
}
