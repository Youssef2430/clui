'use client'

export default function HeroDemo() {
  return (
    <div style={{
      borderRadius: 14,
      overflow: 'hidden',
      lineHeight: 0,
    }}>
      <video
        src="/hero.mp4"
        autoPlay
        muted
        loop
        playsInline
        style={{ width: '100%', display: 'block' }}
      />
    </div>
  )
}
