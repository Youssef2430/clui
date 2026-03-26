import Nav from '@/components/Nav'
import Hero from '@/components/Hero'
import HeroDemo from '@/components/HeroDemo'
import SectionSummon from '@/components/SectionSummon'
import SectionPermissions from '@/components/SectionPermissions'
import SectionSkills from '@/components/SectionSkills'
import SectionVoice from '@/components/SectionVoice'
import FeaturesList from '@/components/FeaturesList'
import InstallTerminal from '@/components/InstallTerminal'
import Callout from '@/components/Callout'
import Footer from '@/components/Footer'

export default function Home() {
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
          <div className="reveal">
            <div className="section-label">Get started</div>
            <h2 className="section-heading">Up in 30 seconds.</h2>
            <p className="section-sub">Install via Homebrew — the same way you install everything else on your Mac.</p>
          </div>
          <InstallTerminal />
        </div>
      </section>

      <hr className="divider" />
      <Callout />
      <hr className="divider" />
      <Footer />
    </>
  )
}
