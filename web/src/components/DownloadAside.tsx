'use client'

import { useEffect, useState } from 'react'
import ScrollReveal from './ScrollReveal'

type Arch = 'arm64' | 'x64' | null

function detectArch(): Arch {
  if (typeof navigator === 'undefined') return null
  try {
    // Chrome / Edge
    const ua = navigator.userAgent
    if (/arm64|aarch64/i.test(ua)) return 'arm64'

    // userAgentData (Chromium 90+)
    const uaData = (navigator as unknown as { userAgentData?: { architecture?: string } }).userAgentData
    if (uaData?.architecture === 'arm') return 'arm64'

    // WebGL renderer – Apple GPU = Apple Silicon
    const canvas = document.createElement('canvas')
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl')
    if (gl && gl instanceof WebGLRenderingContext) {
      const dbg = gl.getExtension('WEBGL_debug_renderer_info')
      if (dbg) {
        const renderer = gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) as string
        if (/Apple M|Apple GPU/i.test(renderer)) return 'arm64'
      }
    }

    // Default to Intel for Macs we can't fingerprint
    if (/Macintosh|Mac OS X/i.test(ua)) return 'x64'
  } catch { /* ignore */ }
  return null
}

interface Props {
  arm64Url: string
  x64Url: string
}

export default function DownloadAside({ arm64Url, x64Url }: Props) {
  const [arch, setArch] = useState<Arch>(null)

  useEffect(() => {
    setArch(detectArch())
  }, [])

  return (
    <ScrollReveal delay={0.2} className="download-aside">
      <div className="download-aside-inner">
        <p className="download-aside-label">Or download directly</p>
        <p className="download-aside-sub">
          Grab the <strong>.dmg</strong> and drag Clui into Applications — same result, no Homebrew needed.
        </p>

        <div className="download-aside-links">
          <a
            href={arm64Url || undefined}
            aria-disabled={!arm64Url || undefined}
            onClick={arm64Url ? undefined : (e) => e.preventDefault()}
            className={`download-link${arch === 'arm64' ? ' recommended' : ''}${!arm64Url ? ' disabled' : ''}`}
          >
            <svg viewBox="0 0 24 24" className="download-icon" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            <span className="download-link-info">
              <span className="download-link-name">Apple Silicon</span>
              <span className="download-link-arch">M1, M2, M3, M4</span>
            </span>
            {arch === 'arm64' && <span className="download-badge">Your Mac</span>}
          </a>

          <a
            href={x64Url || undefined}
            aria-disabled={!x64Url || undefined}
            onClick={x64Url ? undefined : (e) => e.preventDefault()}
            className={`download-link${arch === 'x64' ? ' recommended' : ''}${!x64Url ? ' disabled' : ''}`}
          >
            <svg viewBox="0 0 24 24" className="download-icon" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            <span className="download-link-info">
              <span className="download-link-name">Intel</span>
              <span className="download-link-arch">x86_64</span>
            </span>
            {arch === 'x64' && <span className="download-badge">Your Mac</span>}
          </a>
        </div>

        <p className="download-aside-note">
          Not sure? Apple menu → About This Mac.
        </p>
      </div>
    </ScrollReveal>
  )
}
