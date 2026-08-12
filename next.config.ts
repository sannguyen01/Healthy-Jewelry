import type { NextConfig } from 'next'
// Relative, not the `@/` alias: next.config.ts is loaded by Next's own config
// loader, which does not apply tsconfig path mappings.
import { warnIfShopifyUnconfigured } from './src/lib/shopify/env-check'

// Runs once per build (and once on `next start`), so a deployment that will
// serve a catalog nobody can buy from says so in the build log rather than
// looking perfectly healthy until a customer clicks Checkout.
warnIfShopifyUnconfigured()

/**
 * Build-time facts, promoted to `NEXT_PUBLIC_*` so they are inlined into the
 * bundle and a served page can say where it came from. See
 * `src/config/build-info.ts` for why that matters and what it detects.
 *
 * `next.config.ts` is evaluated once per build, which is the only place
 * "when was this built" can be captured honestly — read anywhere inside the app
 * it would record render time instead.
 *
 * Vercel's own `VERCEL_*` variables are build-time-only and not `NEXT_PUBLIC_`,
 * so they never reach the browser. Copying them across here is what makes the
 * commit and environment readable from a `<meta>` tag on any device.
 */
const buildInfoEnv: Record<string, string> = {
  NEXT_PUBLIC_HJ_BUILD_TIME: new Date().toISOString(),
  NEXT_PUBLIC_HJ_COMMIT: process.env.VERCEL_GIT_COMMIT_SHA ?? '',
  NEXT_PUBLIC_HJ_VERCEL_ENV: process.env.VERCEL_ENV ?? '',
  NEXT_PUBLIC_HJ_VERCEL_URL: process.env.VERCEL_URL ?? '',
  NEXT_PUBLIC_HJ_BRANCH: process.env.VERCEL_GIT_COMMIT_REF ?? '',
}

const nextConfig: NextConfig = {
  env: buildInfoEnv,
  images: {
    formats: ['image/webp', 'image/avif'],
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'cdn.shopify.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: '*.shopify.com',
        pathname: '/**',
      },
    ],
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-DNS-Prefetch-Control', value: 'on' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
        ],
      },
    ]
  },
  async redirects() {
    return [
      {
        source: '/stones',
        destination: '/',
        permanent: true,
      },
      {
        source: '/crystals',
        destination: '/',
        permanent: true,
      },
      {
        source: '/stones/:path*',
        destination: '/',
        permanent: true,
      },
      {
        source: '/crystals/:path*',
        destination: '/',
        permanent: true,
      },
    ]
  },
}

export default nextConfig
