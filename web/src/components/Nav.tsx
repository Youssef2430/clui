'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import Image from 'next/image'

export default function Nav() {
  const glassRef = useRef<HTMLDivElement>(null)
  const [theme, setTheme] = useState<'light' | 'dark'>('light')

  // Read initial theme from html attr (set by inline script)
  useEffect(() => {
    const html = document.documentElement
    setTheme((html.getAttribute('data-theme') || 'light') as 'light' | 'dark')

    const observer = new MutationObserver(() => {
      setTheme((html.getAttribute('data-theme') || 'light') as 'light' | 'dark')
    })
    observer.observe(html, { attributes: true, attributeFilter: ['data-theme'] })
    return () => observer.disconnect()
  }, [])

  // Strengthen the glass once the page scrolls
  useEffect(() => {
    const glass = glassRef.current
    if (!glass) return
    const handler = () => {
      glass.classList.toggle('scrolled', window.scrollY > 20)
    }
    handler()
    window.addEventListener('scroll', handler, { passive: true })
    return () => window.removeEventListener('scroll', handler)
  }, [])

  const toggleTheme = useCallback(() => {
    const next = theme === 'dark' ? 'light' : 'dark'
    document.documentElement.setAttribute('data-theme', next)
    try { localStorage.setItem('clui-theme', next) } catch {}
    setTheme(next)
  }, [theme])

  const smoothScroll = (e: React.MouseEvent<HTMLAnchorElement>, id: string) => {
    e.preventDefault()
    document.querySelector(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const isDark = theme === 'dark'

  return (
    <nav className="nav-shell">
      <div className="nav-glass" ref={glassRef}>

        {/* Logo */}
        <a href="#" className="nav-logo">
          <div className="nav-logo-mark">
            <Image src="/icon-100.png" alt="Clui" width={26} height={26} />
          </div>
          <span>Clui</span>
        </a>

        {/* Links + controls */}
        <ul className="nav-cluster">
          {[
            { label: 'Overlay', id: '#summon' },
            { label: 'Permissions', id: '#permissions' },
            { label: 'Skills', id: '#skills' },
            { label: 'Install', id: '#install' },
          ].map(({ label, id }) => (
            <li key={id} style={{ display: 'none' }} className="nav-link-item">
              <a href={id} onClick={(e) => smoothScroll(e, id)} className="nav-link-a">
                {label}
              </a>
            </li>
          ))}
          <li>
            <a
              href="https://github.com/Youssef2430/clui"
              target="_blank"
              rel="noopener"
              className="nav-link-a"
            >
              GitHub ↗
            </a>
          </li>
          <li>
            <button onClick={toggleTheme} aria-label="Toggle theme" className="nav-icon-btn">
              {isDark ? (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--text-mid)" strokeWidth="1.8" strokeLinecap="round">
                  <circle cx="12" cy="12" r="5"/>
                  <line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
                  <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
                  <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
                  <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
                </svg>
              ) : (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--text-mid)" strokeWidth="1.8" strokeLinecap="round">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
                </svg>
              )}
            </button>
          </li>
          <li>
            <a href="#install" onClick={(e) => smoothScroll(e, '#install')} className="nav-cta">
              Download free
            </a>
          </li>
        </ul>
      </div>

      <style>{`
        @media (min-width: 600px) { .nav-link-item { display: list-item !important; } }
      `}</style>
    </nav>
  )
}
