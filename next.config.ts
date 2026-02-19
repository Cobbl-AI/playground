import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Transpile workspace packages
  transpilePackages: [
    '@cobbl-ai/sdk',
    '@cobbl-ai/feedback-widget',
    '@prompti/shared',
  ],
}

export default nextConfig
