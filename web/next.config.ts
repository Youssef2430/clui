import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Allow importing SVGs as React components if needed later
  images: {
    unoptimized: true,
  },
}

export default nextConfig
