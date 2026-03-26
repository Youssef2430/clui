import Nav from '@/components/Nav'
import Hero from '@/components/Hero'
import HeroDemo from '@/components/HeroDemo'
import SectionSummon from '@/components/SectionSummon'
import SectionPermissions from '@/components/SectionPermissions'
import SectionSkills from '@/components/SectionSkills'
import SectionVoice from '@/components/SectionVoice'
import FeaturesList from '@/components/FeaturesList'
import InstallTerminal from '@/components/InstallTerminal'
import DownloadAside from '@/components/DownloadAside'
import ScrollReveal from '@/components/ScrollReveal'
import Callout from '@/components/Callout'
import Footer from '@/components/Footer'

interface ReleaseAsset {
  name: string
  browser_download_url: string
}

async function getLatestDownloads() {
  const fallback = { arm64: '', x64: '' }
  try {
    const res = await fetch(
      'https://api.github.com/repos/Youssef2430/clui/releases/latest',
      { next: { revalidate: 3600 } }          // ISR – refresh every hour
    )
    if (!res.ok) return fallback

    const data = await res.json() as { assets: ReleaseAsset[] }
    const assets = data.assets ?? []

    const arm64 = assets.find(a => a.name.endsWith('-arm64.dmg'))
    const x64   = assets.find(a => a.name.endsWith('.dmg') && !a.name.includes('arm64'))

    return {
      arm64: arm64?.browser_download_url ?? '',
      x64:   x64?.browser_download_url   ?? '',
    }
  } catch {
    return fallback
  }
}

export default async function Home() {
  const downloads = await getLatestDownloads()
  return (
    <>
      <Nav />

      <section className="hero" style={{ padding: '128px 0 40px', textAlign: 'center' }}>
        <div className="container">
          <Hero />
        </div>
      </section>

      {/* Hero demo — Zen-style full-width video reveal */}
      <section style={{ padding: '0 24px', maxWidth: 1200, margin: '0 auto' }}>
        <HeroDemo />
      </section>

      <hr className="divider" style={{ marginTop: 80 }} />

      <SectionSummon />
      <hr className="divider" />
      <SectionPermissions />
      <hr className="divider" />
      <SectionSkills />
      <hr className="divider" />
      <SectionVoice />
      <hr className="divider" />

      <FeaturesList />
      <hr className="divider" />

      <section className="install-section" id="install" style={{ padding: '96px 0' }}>
        <div className="container">
          <ScrollReveal>
            <div className="section-label">Get started</div>
            <h2 className="section-heading">Up in 30 seconds.</h2>
            <p className="section-sub">Install via Homebrew — the same way you install everything else on your Mac. No accounts, no sign-ups, no subscriptions. Just one command and you're ready to go.</p>
          </ScrollReveal>
          <div className="install-row">
            <InstallTerminal />
            <DownloadAside arm64Url={downloads.arm64} x64Url={downloads.x64} />
          </div>
          <ScrollReveal delay={0.15}>
            <p className="section-sub" style={{ maxWidth: 520, fontSize: 13.5, marginTop: 40 }}>
              Requires macOS 13 or later. Clui lives in your menu bar and launches instantly with <strong style={{ color: 'var(--text)', fontWeight: 500 }}>&#x2325; Space</strong>. Uninstall anytime with <strong style={{ color: 'var(--text)', fontWeight: 500 }}>brew uninstall clui</strong>.
            </p>
          </ScrollReveal>
        </div>
      </section>

      <hr className="divider" />
      <Callout />
      <hr className="divider" />
      <Footer />
    </>
  )
}
