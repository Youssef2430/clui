'use client'

import { HeadCircuit, MagnifyingGlass, Compass, ArrowClockwise, X, GithubLogo } from '@phosphor-icons/react'
import ScrollReveal from './ScrollReveal'

const FILTERS = ['All', 'git', 'review', 'deploy', 'testing']

const PLUGINS = [
  {
    category: 'Workflow',
    tags: ['git'],
    name: 'git-flow',
    desc: 'Branch, commit, and PR workflows as slash commands — no context switching.',
    repo: 'anthropics/skills',
    author: 'anthropic',
    version: '1.2.0',
    installed: false,
  },
  {
    category: 'Quality',
    tags: ['review'],
    name: 'code-review',
    desc: 'Inline review with severity scoring, runs against your working diff.',
    repo: 'clui/skills',
    author: 'youssef',
    version: '0.4.1',
    installed: true,
  },
]

export default function SectionSkills() {
  return (
    <section className="split-section" id="skills">
      <div className="container">
        <div className="split-inner">
          <ScrollReveal className="split-text">
            <div className="section-label"><span className="section-index">03</span> Skills Marketplace</div>
            <h2 className="section-heading">Your workflows,<br />packaged as <em>skills</em>.</h2>
            <p className="section-sub">
              Browse the community marketplace or author your own — without leaving Clui. Git flows,
              code review, deploy scripts, test runners — all accessible as slash commands the moment
              they&apos;re installed.
            </p>
          </ScrollReveal>

          <ScrollReveal delay={0.2}>
            <div className="split-visual">
              {/* Faithful recreation of Clui's in-app MarketplacePanel */}
              <div className="mkt-panel app-glass">
                <div className="mkt-header">
                  <div className="mkt-header-title">
                    <HeadCircuit size={20} />
                    <div>
                      <div className="mkt-title">Skills Marketplace</div>
                      <div className="mkt-subtitle">Install skills and plugins without leaving Clui</div>
                    </div>
                  </div>
                  <div className="mkt-header-actions">
                    <span className="mkt-count">12 results</span>
                    <ArrowClockwise size={14} />
                    <X size={14} />
                  </div>
                </div>

                <div className="mkt-searchrow">
                  <div className="mkt-search">
                    <MagnifyingGlass size={13} />
                    <span>Search skills, tags, authors…</span>
                  </div>
                  <button className="mkt-byo"><Compass size={12} /> Build your own</button>
                </div>

                <div className="mkt-chips">
                  {FILTERS.map((f, i) => (
                    <span key={f} className={`mkt-chip${i === 0 ? ' active' : ''}`}>{f}</span>
                  ))}
                </div>

                <div className="mkt-cards">
                  {PLUGINS.map((p) => (
                    <div key={p.name} className="mkt-card">
                      <div className="mkt-card-head">
                        <div className="mkt-tags">
                          <span className="mkt-tag accent">{p.category}</span>
                          {p.tags.map((t) => <span key={t} className="mkt-tag">{t}</span>)}
                        </div>
                        <div className="mkt-card-actions">
                          <GithubLogo size={14} className="mkt-gh" />
                          <span className={p.installed ? 'mkt-status installed' : 'mkt-status install'}>
                            {p.installed ? 'Installed' : 'Install'}
                          </span>
                        </div>
                      </div>
                      <div className="mkt-card-name">{p.name}</div>
                      <div className="mkt-card-desc">{p.desc}</div>
                      <div className="mkt-card-meta">{p.repo} · by {p.author} · v{p.version}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </ScrollReveal>
        </div>
      </div>
    </section>
  )
}
