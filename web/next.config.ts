import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  outputFileTracingRoot: process.cwd(),
  // Skip Next.js image optimisation (static export / Vercel-free deploys)
  images: {
    unoptimized: true,
  },
}

export default nextConfig
