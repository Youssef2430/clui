'use client'

export default function HeroDemo() {
  return (
    <div className="hero-demo">
      <div className="hero-demo-frame">
        <video
          src="/hero.mp4"
          autoPlay
          muted
          loop
          playsInline
          style={{ width: '100%', display: 'block' }}
        />
      </div>
    </div>
  )
}
