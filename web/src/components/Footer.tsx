'use client'

import Image from 'next/image'

export default function Footer() {
  return (
    <footer style={{ padding: '40px 0', position: 'relative', zIndex: 1 }}>
      <div className="container">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap' }}>

          <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
            <a href="#" style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none' }}>
              <div className="footer-logo-mark">
                <Image src="/icon-100.png" alt="Clui" width={22} height={22} />
              </div>
              <span className="footer-brand-text">Clui</span>
            </a>
            <span className="footer-copy">&copy; 2026 &middot; macOS only &middot; MIT License</span>
          </div>

          <ul style={{ display: 'flex', gap: 20, listStyle: 'none' }}>
            {[
              { label: 'GitHub',   href: 'https://github.com/Youssef2430/clui' },
              { label: 'Releases', href: 'https://github.com/Youssef2430/clui/releases' },
              { label: 'Issues',   href: 'https://github.com/Youssef2430/clui/issues' },
            ].map(({ label, href }) => (
              <li key={label}>
                <a
                  href={href}
                  target="_blank"
                  rel="noopener"
                  style={{ fontFamily: 'var(--sans)', fontSize: 12.5, color: 'var(--text-soft)', textDecoration: 'none', transition: 'color .2s' }}
                  onMouseEnter={e => (e.currentTarget.style.color = 'var(--text)')}
                  onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-soft)')}
                >
                  {label}
                </a>
              </li>
            ))}
          </ul>

        </div>
      </div>
    </footer>
  )
}
