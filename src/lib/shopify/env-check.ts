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

/**
 * A variable that is *present* but holds the wrong kind of value.
 *
 * Absence is the easy half. The expensive failure on this project was a variable that
 * was set, non-empty, and satisfied every presence check in the repo — and was the wrong
 * credential. `SHOPIFY_STOREFRONT_ACCESS_TOKEN` held an Admin API token (`shpat_…`),
 * because Shopify issues both from the same admin area under similar names. The Storefront
 * API answers that with `{"message":"","extensions":{"code":"UNAUTHORIZED"}}` — an error
 * carrying no message — so `getProducts()` caught it, fell back to `hj-data.ts`, and the
 * production site served a static catalogue whose placeholder variant IDs made checkout
 * refuse. Nothing anywhere said "wrong token". The build log said nothing at all, because
 * the variable was set.
 *
 * Each rule is an *inverse* test — it fires only on a value that is definitely wrong, never
 * one that is merely unrecognised. Shopify has changed token formats before, and refusing a
 * working credential would be a worse failure than the one being prevented.
 */
interface ShapeRule {
  key: string
  wrong: (value: string) => boolean
  explain: string
}

const SHAPE_RULES: ShapeRule[] = [
  {
    key: 'SHOPIFY_STOREFRONT_ACCESS_TOKEN',
    wrong: (value) => value.startsWith('shpat_'),
    explain:
      'starts with "shpat_", which is the Admin API token format. A Storefront token is 32 hex characters, or starts with "shpca_" for a custom app delegate token. Shopify Admin → Sales channels → Headless → Storefront API access token.',
  },
  {
    key: 'NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN',
    wrong: (value) => value.includes('/') || value.includes(':') || !value.endsWith('.myshopify.com'),
    explain:
      'is not a bare *.myshopify.com host. It is interpolated directly into `https://${domain}/api/…`, so a scheme or a path yields a URL that fails to resolve instead of a readable error.',
  },
]

export interface EnvCheckResult {
  missing: RequiredVar[]
  /** Present, but holding a value of the wrong kind. */
  malformed: ShapeRule[]
  /** Lines to print, most important first. Empty when nothing is wrong. */
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
  const malformed = SHAPE_RULES.filter((rule) => {
    const value = env[rule.key]
    return !!value && rule.wrong(value)
  })
  if (missing.length === 0 && malformed.length === 0) return { missing, malformed, messages: [] }

  const messages: string[] = []

  // Malformed first. A missing variable is a job half-done and reads as one; a variable
  // set to the wrong credential reads as "configured" to every other check in the repo,
  // so it is the line most likely to be the only useful thing in the log.
  if (malformed.length > 0) {
    messages.push(
      `[HJ] ${malformed.length} Shopify variable${malformed.length === 1 ? ' is' : 's are'} set to the wrong kind of value.`,
      '     These are present, so nothing else in this build will object. They are still wrong.',
      ...malformed.map(({ key, explain }) => `     · ${key} ${explain}`),
    )
  }

  if (missing.length > 0) {
    messages.push(
      `[HJ] Shopify is not fully configured — ${missing.length} of ${REQUIRED.length} variables are missing.`,
      '     The site will build and serve the static fallback catalog, but customers cannot complete a purchase.',
      ...missing.map(({ key, inlined }) => `     · ${key}${inlined ? '  (inlined at build time)' : ''}`),
      ...missing.map(({ key, impact }) => `     ${key}: ${impact}`),
    )
  }

  messages.push(...TRAPS.map((trap) => `     ! ${trap}`))

  return { missing, malformed, messages }
}

/** Print the diagnostic. Returns whether anything was wrong — missing or malformed. */
export function warnIfShopifyUnconfigured(env: EnvLike = process.env): boolean {
  const { missing, malformed, messages } = checkShopifyEnv(env)
  for (const message of messages) console.warn(message)
  return missing.length > 0 || malformed.length > 0
}
