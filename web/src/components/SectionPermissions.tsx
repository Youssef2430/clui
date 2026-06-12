'use client'

import { ShieldWarning, Terminal } from '@phosphor-icons/react'
import ScrollReveal from './ScrollReveal'

export default function SectionPermissions() {
  return (
    <section className="split-section" id="permissions">
      <div className="container">
        <div className="split-inner reversed">
          <ScrollReveal className="split-text">
            <div className="section-label"><span className="section-index">02</span> Permissions</div>
            <h2 className="section-heading">Every action,<br /><em>your</em> approval.</h2>
            <p className="section-sub">
              Clui intercepts every write, delete, and shell command before it touches your system.
              Review it, approve it, or deny it in one click. Set permanent rules per project so
              trusted operations never interrupt you again.
            </p>
          </ScrollReveal>

          <ScrollReveal delay={0.2}>
            <div className="split-visual">
              {/* Faithful recreation of Clui's in-app PermissionCard */}
              <div className="perm-card app-glass">
                <div className="perm-card-header">
                  <ShieldWarning size={12} weight="fill" />
                  <span>Permission Required</span>
                </div>
                <div className="perm-card-body">
                  <div className="perm-card-tool">
                    <Terminal size={14} />
                    <span className="perm-card-tool-name">Bash</span>
                  </div>
                  <p className="perm-card-desc">Run a shell command in your project directory</p>
                  <pre className="perm-card-code">git push origin main --force-with-lease</pre>
                  <div className="perm-card-actions">
                    <button className="perm-pill perm-pill-allow">Allow</button>
                    <button className="perm-pill perm-pill-allow-session">Allow for session</button>
                    <button className="perm-pill perm-pill-deny">Deny</button>
                  </div>
                </div>
              </div>
            </div>
          </ScrollReveal>
        </div>
      </div>
    </section>
  )
}
