import type { NextConfig } from 'next'
// Relative, not the `@/` alias: next.config.ts is loaded by Next's own config
// loader, which does not apply tsconfig path mappings.
import { warnIfShopifyUnconfigured } from './src/lib/shopify/env-check'
// Importing the reader *is* the validation: every catalogue record is parsed through its
// Zod schema at module load, and a malformed one throws. See the block below.
import { getAllProducts } from './src/lib/catalog'

// Runs once per build (and once on `next start`), so a deployment that will
// serve a catalog nobody can buy from says so in the build log rather than
// looking perfectly healthy until a customer clicks Checkout.
warnIfShopifyUnconfigured()

/**
 * **Invalid catalogue content stops the build.**
 *
 * `src/lib/catalog` validates every record in `src/content/catalog/**` against its Zod
 * schema when the module first loads, and throws on the first bad set. Importing it here
 * makes that happen once per build, before a single page is generated.
 *
 * The import alone would do it, and the call is here anyway for a reason worth writing
 * down: a bare `import './src/lib/catalog'` for its side effect is exactly the shape a
 * later "unused import" cleanup deletes, taking the guarantee with it and leaving nothing
 * that fails. Reading the length makes the dependency visible to a human and to eslint.
 *
 * This is deliberately a **throw** and not the `warn` immediately above it. The two guard
 * different things: Shopify being unconfigured degrades to a working site, whereas a
 * malformed product record renders a page with a hole in it — a customer-visible lie that
 * no check downstream of the build would catch. `warnIfShopifyUnconfigured` exists because
 * a hard failure there would break the architecture it protects; nothing here protects
 * anything by continuing.
 *
 * Note the ordering constraint this creates: `manifest.ts` imports its JSON with relative
 * paths, not the `@/` alias, because this file is loaded by Next's own config loader, which
 * does not apply tsconfig path mappings (see the comment on the first import).
 */
if (getAllProducts().length === 0) {
  throw new Error(
    'The catalogue is empty. src/content/catalog/products/ has no valid records, or ' +
      'src/lib/catalog/manifest.ts lists none. A build that serves no products would ' +
      'deploy a shop with nothing in it and report success.'
  )
}

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
      /*
       * Retired commerce routes.
       *
       * 308, not 307 or 302: these are permanent, and a permanent redirect is what lets a
       * crawler retire the old URL instead of re-checking it forever. `permanent: true` is
       * Next's spelling of 308.
       *
       * Both have a successor that answers the visitor's actual question — a bag becomes
       * the shelf it was filled from, an account becomes the person who replaces it. That
       * is why they redirect and `/checkout` does not: a withdrawn capability has no
       * successor, so it answers 410 from its own route handler. See
       * `src/app/checkout/route.ts`.
       *
       * Asserted by status code, over HTTP, in `e2e/retired-routes.spec.ts` — `toHaveURL()`
       * passes on a soft 200 that merely renders the destination.
       */
      {
        source: '/cart',
        destination: '/shop',
        permanent: true,
      },
      {
        source: '/account',
        destination: '/contact',
        permanent: true,
      },
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
