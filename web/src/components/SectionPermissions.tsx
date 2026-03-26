import ScrollReveal from './ScrollReveal'

export default function SectionPermissions() {
  return (
    <section className="split-section" id="permissions">
      <div className="container">
        <div className="split-inner reversed">
          <ScrollReveal className="split-text">
            <div className="section-label">Permissions</div>
            <h2 className="section-heading">Every action,<br />your approval.</h2>
            <p className="section-sub">
              Clui intercepts every write, delete, and shell command before it touches your system.
              Review it, approve it, or deny it in one click. Set permanent rules per project so
              trusted operations never interrupt you again.
            </p>
          </ScrollReveal>

          <ScrollReveal delay={0.2}>
            <div className="split-visual">
              <div className="perm-card-showcase">
                <div className="perm-card-header">
                  <div className="perm-card-icon-wrap">⚠️</div>
                  <div>
                    <div className="perm-card-title">Permission Required</div>
                    <div className="perm-card-subtitle">Claude wants to write a file</div>
                  </div>
                </div>
                <div className="perm-card-path">
                  <span className="perm-card-path-icon">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                      <polyline points="14 2 14 8 20 8"/>
                    </svg>
                  </span>
                  src/auth.ts
                </div>
                <div className="perm-card-actions">
                  <button className="perm-card-btn perm-card-btn-allow">Allow</button>
                  <button className="perm-card-btn perm-card-btn-deny">Deny</button>
                </div>
                <div className="perm-card-note">Always allow for this project &rarr;</div>
              </div>
            </div>
          </ScrollReveal>
        </div>
      </div>
    </section>
  )
}
