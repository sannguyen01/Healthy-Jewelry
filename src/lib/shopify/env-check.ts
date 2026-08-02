// Healthy Jewelry — build-time Shopify configuration diagnostics
//
// The site is designed to build and run without Shopify: `hj-data.ts` is a
// complete static catalog, and every fetch falls back to it. That is a feature,
// not an oversight — which is exactly why a missing variable is silent, and why
// an unconfigured production deployment looks completely healthy right up until
// a customer clicks Checkout and nothing happens.
//
// So this warns. It does not throw. Throwing would break local development,
// break the static-fallback architecture it is meant to protect, and not fire
// in CI anyway (which sets mock values). A warning in the build log is the
// right severity for "this deploy will serve a catalog nobody can buy from".

/**
 * Just enough of an environment to read names from.
 *
 * Deliberately not `NodeJS.ProcessEnv`, which requires `NODE_ENV` — this check
 * has no business demanding it, and callers would have to fabricate one to ask
 * a question about four Shopify variables.
 */
type EnvLike = Record<string, string | undefined>

/** A variable the storefront needs, and what breaks in its absence. */
interface RequiredVar {
  key: string
  /** `NEXT_PUBLIC_*` values are inlined into the client bundle at build time. */
  inlined: boolean
  impact: string
}

const REQUIRED: RequiredVar[] = [
  {
    key: 'NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN',
    inlined: true,
    impact: 'the cart never syncs, so Checkout produces no checkoutUrl and no order',
  },
  {
    key: 'SHOPIFY_STOREFRONT_ACCESS_TOKEN',
    inlined: false,
    impact: 'every product fetch falls back to the static catalog, whose variant IDs are placeholders Shopify rejects',
  },
  {
    key: 'SHOPIFY_WEBHOOK_SECRET',
    inlined: false,
    impact: 'webhook signatures cannot be verified, so orders/* deliveries are rejected with 401',
  },
  {
    key: 'SHOPIFY_REVALIDATION_SECRET',
    inlined: false,
    impact: 'catalog changes in Shopify never invalidate the cached pages',
  },
]

export interface EnvCheckResult {
  missing: RequiredVar[]
  /** Lines to print, most important first. Empty when nothing is missing. */
  messages: string[]
}

/**
 * Two traps cost real deployment time on this project and neither produces an
 * error message anywhere, so they are named explicitly rather than left for the
 * next person to rediscover.
 */
const TRAPS = [
  'Vercel scopes variables per environment — setting them for Production alone leaves Preview deployments broken in exactly this way.',
  'NEXT_PUBLIC_* values are inlined into the client bundle at build time. Setting them and then *redeploying* changes nothing: a redeploy can reuse the cached build. Trigger a fresh build.',
]

export function checkShopifyEnv(env: EnvLike = process.env): EnvCheckResult {
  const missing = REQUIRED.filter(({ key }) => !env[key])
  if (missing.length === 0) return { missing, messages: [] }

  const messages = [
    `[HJ] Shopify is not fully configured — ${missing.length} of ${REQUIRED.length} variables are missing.`,
    '     The site will build and serve the static fallback catalog, but customers cannot complete a purchase.',
    ...missing.map(({ key, inlined }) => `     · ${key}${inlined ? '  (inlined at build time)' : ''}`),
    ...missing.map(({ key, impact }) => `     ${key}: ${impact}`),
    ...TRAPS.map((trap) => `     ! ${trap}`),
  ]

  return { missing, messages }
}

/** Print the diagnostic. Returns whether anything was missing. */
export function warnIfShopifyUnconfigured(env: EnvLike = process.env): boolean {
  const { missing, messages } = checkShopifyEnv(env)
  for (const message of messages) console.warn(message)
  return missing.length > 0
}
