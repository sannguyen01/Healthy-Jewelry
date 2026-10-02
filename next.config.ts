import type { NextConfig } from 'next'
// Relative, not the `@/` alias: next.config.ts is loaded by Next's own config
// loader, which does not apply tsconfig path mappings.
//
// Importing the reader *is* the validation: every catalogue record is parsed through its
// Zod schema at module load, and a malformed one throws. See the block below.
import { getAllProducts } from './src/lib/catalog'

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
 * This is deliberately a **throw**, and the contrast that makes the point used to sit one
 * line above it. `warnIfShopifyUnconfigured()` ran here every build and *printed*: a
 * deployment with no Storefront credentials degraded to the static catalogue and served a
 * working site, so failing the build over it would have broken the architecture the warning
 * protected.
 *
 * There is no such degradation any more. The static catalogue is not a fallback, it is the
 * source, and a malformed record renders a page with a hole in it — a customer-visible lie
 * no check downstream of the build would catch. Nothing here is protected by continuing,
 * so nothing continues.
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

/**
 * **Content-Security-Policy: the browser talks to this origin and to nothing else.**
 *
 * There was no CSP at all until 2026-09-26, so "the CSP must lose its commerce origins" had
 * nothing to act on, and nothing stopped a copied component from pulling a script, a font
 * or a beacon from a vendor. Contract §12 now says the browser side approves the site and
 * the non-network schemes and no third-party host; this header is that sentence enforced
 * by every visitor's browser rather than only by the E2E suite.
 *
 * Each source is here for a reason that was measured, not assumed:
 *
 * - `script-src 'unsafe-inline'` — Next's App Router streams its RSC payload through inline
 *   `self.__next_f.push(…)` scripts, and the JSON-LD blocks are inline. A nonce would remove
 *   the need, but a nonce forces every page to render per request, and nearly every route
 *   here is prerendered. No `'unsafe-eval'`: the production runtime does not need it, and
 *   `csp-contract.test.ts` fails if it arrives.
 * - `style-src 'unsafe-inline'` — React `style` props and the 410 pages' own `<style>`
 *   block, which exists precisely so a withdrawn route renders without the CSS pipeline.
 * - `img-src data: blob:` and `font-src data:` — inline SVG and font bytes; §12 rows.
 * - `connect-src 'self'` — the whole egress rule in one directive. `fetch('/api/…')` only.
 * - `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`.
 *
 * **No `upgrade-insecure-requests`.** E2E serves `http://localhost:3000` and the directive
 * would rewrite its subresources to https and fail every page; production is already
 * https-only through the HSTS header below.
 *
 * **Known cost:** Vercel's preview toolbar loads from its own host, so it is blocked on
 * preview deployments. Accepted: a preview that behaves like production is the point.
 *
 * Pinned by `src/tests/unit/csp-contract.test.ts`, which reads it back through
 * `headers()` and checks every source against contract §12 and §13.
 */
const CONTENT_SECURITY_POLICY: Record<string, readonly string[]> = {
  'default-src': ["'self'"],
  'script-src': ["'self'", "'unsafe-inline'"],
  'style-src': ["'self'", "'unsafe-inline'"],
  'img-src': ["'self'", 'data:', 'blob:'],
  'font-src': ["'self'", 'data:'],
  'connect-src': ["'self'"],
  'frame-ancestors': ["'none'"],
  'base-uri': ["'self'"],
  'form-action': ["'self'"],
  'object-src': ["'none'"],
}

const contentSecurityPolicy = Object.entries(CONTENT_SECURITY_POLICY)
  .map(([directive, sources]) => `${directive} ${sources.join(' ')}`)
  .join('; ')

const nextConfig: NextConfig = {
  env: buildInfoEnv,
  /*
   * No `remotePatterns`.
   *
   * This allowlisted `cdn.shopify.com` and `*.shopify.com`, which is how a product
   * photograph reached `next/image` from a Shopify CDN URL. The catalogue's `photo` media
   * arm carries a repository-relative `src` instead, so every image `next/image` is asked
   * to optimise is one this build ships.
   *
   * Removed rather than left harmlessly in place. `remotePatterns` is a statement about
   * which third parties may put bytes through this deployment's image optimiser, and a
   * wildcard for a vendor nothing fetches from is a standing permission nobody reviewed.
   * A photograph arriving from a CDN again is a decision, and it should cost an edit here.
   */
  images: {
    formats: ['image/webp', 'image/avif'],
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
          { key: 'Content-Security-Policy', value: contentSecurityPolicy },
        ],
      },
    ]
  },
  /*
   * **No `redirects()`.** The retired commerce families — `/cart`, `/account`, `/collections`,
   * `/policies`, `/stones`, `/crystals` — were twelve config redirects here until 2026-09-27.
   * They are route handlers now (`src/app/<family>/[[...path]]/route.ts`, all through
   * `retiredRoute()` in `src/lib/http/goneResponse.ts`), because a config redirect runs before
   * any code sees the method and answers a stale POST with the same 308 as a GET. A 308
   * obliges the client to repeat the POST at the successor, and a multipart one — the old
   * theme's product form — ended on a bare "Server action not found." at `/shop`. The
   * handlers keep the 308 for GET and HEAD, query string carried, and answer every other
   * method with the 410 page at the URL the visitor used.
   *
   * The cost is recorded rather than hidden: a legacy GET now invokes a function instead of
   * matching an edge rule. The 308 carries `s-maxage=86400`, so the edge answers repeats and a
   * legacy path costs about one invocation per day; `retired-route-matrix` in
   * `docs/controls.json` carries the rest as a known limit. A new redirect belongs in contract §7
   * first, and `commerce-route-inventory.test.ts` reconciles whichever mechanism serves it.
   */
}

export default nextConfig
