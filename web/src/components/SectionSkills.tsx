import ScrollReveal from './ScrollReveal'

const SKILLS = [
  { name: 'git-flow',    desc: 'Branch, commit & PR workflows',      installed: true },
  { name: 'code-review', desc: 'Inline suggestions & scoring',        installed: true },
  { name: 'deploy',      desc: 'One-command staging & prod push',     installed: true },
  { name: 'test-runner', desc: 'Run & interpret test suites',         installed: true },
  { name: 'docs-writer', desc: 'Auto-generate README & JSDoc',        installed: false },
  { name: 'db-migrate',  desc: 'Schema diffs & safe migrations',      installed: false },
]

export default function SectionSkills() {
  return (
    <section className="split-section" id="skills">
      <div className="container">
        <div className="split-inner">
          <ScrollReveal className="split-text">
            <div className="section-label">Skills Marketplace</div>
            <h2 className="section-heading">Your workflows,<br />packaged as skills.</h2>
            <p className="section-sub">
              Browse the community marketplace or author your own. Git flows, code review prompts,
              deploy scripts, test runners — all accessible as slash commands the moment they&apos;re installed.
            </p>
          </ScrollReveal>

          <ScrollReveal delay={0.2}>
            <div className="split-visual">
              <div className="skills-showcase">
                {SKILLS.map(skill => (
                  <div key={skill.name} className="skill-tile" style={!skill.installed ? { opacity: .45 } : undefined}>
                    <div className="skill-tile-top">
                      <div className="skill-tile-dot" style={!skill.installed ? { background: 'var(--border)' } : undefined} />
                      <div
                        className="skill-tile-badge"
                        style={!skill.installed ? { background: 'transparent', color: 'var(--text-soft)', border: '1px solid var(--border)' } : undefined}
                      >
                        {skill.installed ? 'Installed' : 'Available'}
                      </div>
                    </div>
                    <div className="skill-tile-name" style={!skill.installed ? { color: 'var(--text-mid)' } : undefined}>{skill.name}</div>
                    <div className="skill-tile-desc">{skill.desc}</div>
                  </div>
                ))}
              </div>
            </div>
          </ScrollReveal>
        </div>
      </div>
    </section>
  )
}
