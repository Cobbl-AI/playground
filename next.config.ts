import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  transpilePackages: [
    '@cobbl-ai/sdk',
    '@cobbl-ai/feedback-widget',
  ],
}

export default nextConfig
