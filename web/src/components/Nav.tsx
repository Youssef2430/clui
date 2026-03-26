'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import Image from 'next/image'

export default function Nav() {
  const navRef = useRef<HTMLElement>(null)
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

  // Nav shadow on scroll
  useEffect(() => {
    const nav = navRef.current
    if (!nav) return
    const handler = () => {
      nav.style.boxShadow = window.scrollY > 20 ? '0 1px 8px rgba(0,0,0,.06)' : 'none'
    }
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
    <nav
      ref={navRef}
      style={{
        position: 'sticky', top: 0, zIndex: 100,
        background: 'var(--nav-bg)',
        backdropFilter: 'blur(18px) saturate(1.4)',
        WebkitBackdropFilter: 'blur(18px) saturate(1.4)',
        borderBottom: '1px solid var(--border-soft)',
        transition: 'background .4s ease, border-color .4s ease',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 58, maxWidth: 1080, margin: '0 auto', padding: '0 32px' }}>

        {/* Logo */}
        <a href="#" style={{ display: 'flex', alignItems: 'center', gap: 9, textDecoration: 'none' }}>
          <div className="nav-logo-mark">
            <Image src="/icon-100.png" alt="Clui" width={26} height={26} />
          </div>
          <span style={{ fontFamily: 'var(--sans)', fontSize: 15, fontWeight: 600, color: 'var(--text)', letterSpacing: '-.01em', transition: 'color .4s ease' }}>
            Clui
          </span>
        </a>

        {/* Links */}
        <ul style={{ display: 'flex', alignItems: 'center', gap: 28, listStyle: 'none' }}>
          {[
            { label: 'Overlay', id: '#summon' },
            { label: 'Permissions', id: '#permissions' },
            { label: 'Skills', id: '#skills' },
            { label: 'Install', id: '#install' },
          ].map(({ label, id }) => (
            <li key={id} style={{ display: 'none' }} className="nav-link-item">
              <a
                href={id}
                onClick={(e) => smoothScroll(e, id)}
                style={{ fontFamily: 'var(--sans)', fontSize: 13.5, color: 'var(--text-mid)', textDecoration: 'none', fontWeight: 400, transition: 'color .2s' }}
                onMouseEnter={e => (e.currentTarget.style.color = 'var(--text)')}
                onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-mid)')}
              >
                {label}
              </a>
            </li>
          ))}
          <li>
            <a
              href="https://github.com/Youssef2430/clui"
              target="_blank"
              rel="noopener"
              style={{ fontFamily: 'var(--sans)', fontSize: 13.5, color: 'var(--text-mid)', textDecoration: 'none', transition: 'color .2s' }}
              onMouseEnter={e => (e.currentTarget.style.color = 'var(--text)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-mid)')}
            >
              GitHub ↗
            </a>
          </li>
          <li>
            <button
              onClick={toggleTheme}
              aria-label="Toggle theme"
              style={{
                width: 34, height: 34, borderRadius: '50%',
                border: 'none', background: 'transparent',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', transition: 'opacity .2s, transform .2s',
                opacity: .7,
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.opacity = '1'; (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.1)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.opacity = '.7'; (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)' }}
            >
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
            <a
              href="#install"
              onClick={(e) => smoothScroll(e, '#install')}
              style={{
                fontFamily: 'var(--sans)', fontSize: 13, fontWeight: 500,
                color: 'var(--bg)', background: 'var(--text)',
                padding: '7px 16px', borderRadius: 20,
                textDecoration: 'none', transition: 'background .2s',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--accent)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'var(--text)')}
            >
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
