import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * **Both sides of every environment fallback in `src/config`.**
 *
 * ## Why these three files failed CI and passed locally
 *
 * `build-info.ts`, `shopify.ts` and `shopify-public.ts` are almost entirely
 * `process.env.X ?? fallback`. Each of those is a branch, and **which side of it
 * runs is a property of the environment, not of the tests.** This sandbox has no
 * Shopify variables set; `ci.yml` sets five at workflow scope. So the suite
 * exercised the fallback arm locally and the value arm in CI, and neither run
 * touched both.
 *
 * Under the old project-wide threshold that was invisible — the aggregate
 * absorbed it. Turning on `perFile: true` made it a failure, and it failed in
 * exactly one of the two environments:
 *
 * ```
 * ERROR: Coverage for branches (70%)    … for src/config/build-info.ts
 * ERROR: Coverage for branches (50%)    … for src/config/shopify-public.ts
 * ERROR: Coverage for branches (66.66%) … for src/config/shopify.ts
 * ```
 *
 * A green local run was not evidence the gate would pass, which is the same
 * mistake in miniature as everything else this review found: a measurement whose
 * scope was narrower than the confidence placed in it.
 *
 * Stubbing both arms here makes the number a property of the suite. Every case
 * re-imports under `vi.resetModules()` because `build-info.ts` reads its
 * variables at module scope — the value is captured once, on first import, and a
 * later `stubEnv` cannot reach it.
 */

/** Fresh module instance under the current environment. */
async function freshBuildInfo() {
  vi.resetModules()
  return import('@/config/build-info')
}

const BUILD_VARS = [
  'NEXT_PUBLIC_HJ_COMMIT',
  'NEXT_PUBLIC_HJ_VERCEL_ENV',
  'NEXT_PUBLIC_HJ_VERCEL_URL',
  'NEXT_PUBLIC_HJ_BRANCH',
  'NEXT_PUBLIC_HJ_BUILD_TIME',
] as const

beforeEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe('build-info reads every build variable, and survives all of them being absent', () => {
  it('reports each value when the build set it', async () => {
    vi.stubEnv('NEXT_PUBLIC_HJ_COMMIT', 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2')
    vi.stubEnv('NEXT_PUBLIC_HJ_VERCEL_ENV', 'production')
    vi.stubEnv('NEXT_PUBLIC_HJ_VERCEL_URL', 'hj-abc123.vercel.app')
    vi.stubEnv('NEXT_PUBLIC_HJ_BRANCH', 'main')
    vi.stubEnv('NEXT_PUBLIC_HJ_BUILD_TIME', '2026-09-18T08:00:00.000Z')

    const { BUILD_INFO } = await freshBuildInfo()

    expect(BUILD_INFO.commit).toBe('a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2')
    expect(BUILD_INFO.shortCommit).toBe('a1b2c3d')
    expect(BUILD_INFO.vercelEnv).toBe('production')
    expect(BUILD_INFO.vercelUrl).toBe('hj-abc123.vercel.app')
    expect(BUILD_INFO.branch).toBe('main')
    expect(BUILD_INFO.builtAt).toBe('2026-09-18T08:00:00.000Z')
  })

  it('reports null for each one the build did not set', async () => {
    // A local build sets none of these. `null` rather than `undefined` or `''`
    // so the endpoint's JSON says "not known" in one shape.
    //
    // These use `||` rather than `??`, so a blank value and an absent one take
    // the same arm — asserted below for both, because which of the two a given
    // environment supplies is not this suite's to control.
    for (const name of BUILD_VARS) vi.stubEnv(name, undefined)

    const { BUILD_INFO } = await freshBuildInfo()

    expect(BUILD_INFO.commit).toBeNull()
    expect(BUILD_INFO.shortCommit).toBeNull()
    expect(BUILD_INFO.vercelEnv).toBeNull()
    expect(BUILD_INFO.vercelUrl).toBeNull()
    expect(BUILD_INFO.branch).toBeNull()
    expect(BUILD_INFO.builtAt).toBeNull()
  })

  it('fingerprints the two inlined values, set and unset, to different tokens', async () => {
    // The fingerprint is the stale-bundle detector's entire mechanism. If both
    // states hashed alike it would be unable to distinguish any deployment from
    // any other.
    vi.stubEnv('NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN', '')
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', '')
    const empty = (await freshBuildInfo()).BUILD_INFO

    vi.stubEnv('NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN', 'shop.myshopify.com')
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://healthyjewellery.com')
    const filled = (await freshBuildInfo()).BUILD_INFO

    expect(empty.configFingerprint).not.toBe(filled.configFingerprint)
    expect(empty.storeDomainInlined).toBe(false)
    expect(filled.storeDomainInlined).toBe(true)
  })

  it('fingerprints deterministically, and independently of key order', async () => {
    const { fingerprint } = await freshBuildInfo()
    const a = { NEXT_PUBLIC_SITE_URL: 'https://x', NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN: 'y' }
    const b = { NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN: 'y', NEXT_PUBLIC_SITE_URL: 'https://x' }

    expect(fingerprint(a)).toBe(fingerprint(b))
    expect(fingerprint(a)).toMatch(/^[0-9a-f]{8}$/)
    expect(fingerprint(a)).not.toBe(fingerprint({ ...a, NEXT_PUBLIC_SITE_URL: 'https://z' }))
  })

  it('treats a blank value as absent, because these use || rather than ??', async () => {
    for (const name of BUILD_VARS) vi.stubEnv(name, '')
    const { BUILD_INFO } = await freshBuildInfo()

    expect(BUILD_INFO.commit).toBeNull()
    expect(BUILD_INFO.vercelEnv).toBeNull()
    expect(BUILD_INFO.builtAt).toBeNull()
  })

  it('buildStamp names every unknown rather than omitting it', async () => {
    // Line 118's fallbacks. A stamp that silently drops a field reads as a
    // shorter stamp, and "commit=unknown" is the thing worth seeing in view-source.
    for (const name of BUILD_VARS) vi.stubEnv(name, '')
    const { buildStamp, BUILD_INFO } = await freshBuildInfo()

    const stamp = buildStamp(BUILD_INFO)
    expect(stamp).toContain('commit=unknown')
    expect(stamp).toContain('env=local')
    expect(stamp).toContain('built=unknown')
    expect(stamp).toMatch(/config=[0-9a-f]{8}/)
  })

  it('buildStamp uses the real values when they exist', async () => {
    vi.stubEnv('NEXT_PUBLIC_HJ_COMMIT', 'deadbeefcafe')
    vi.stubEnv('NEXT_PUBLIC_HJ_VERCEL_ENV', 'preview')
    vi.stubEnv('NEXT_PUBLIC_HJ_BUILD_TIME', '2026-09-18T08:00:00.000Z')
    const { buildStamp, BUILD_INFO } = await freshBuildInfo()

    const stamp = buildStamp(BUILD_INFO)
    expect(stamp).toContain('commit=deadbee')
    expect(stamp).toContain('env=preview')
    expect(stamp).toContain('built=2026-09-18T08:00:00.000Z')
  })
})

describe('shopify-public reads the store domain, set and unset', () => {
  it('returns the domain the build inlined', async () => {
    vi.stubEnv('NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN', 'shop.myshopify.com')
    const { shopifyPublicConfig } = await import('@/config/shopify-public')
    expect(shopifyPublicConfig.storeDomain).toBe('shop.myshopify.com')
  })

  it('returns an empty string rather than undefined when it is absent', async () => {
    // Callers test truthiness (`isShopifyConfigured`, `/api/version`), and
    // `undefined` interpolated into a URL becomes the literal "undefined" —
    // a request to https://undefined/api/... that fails with a DNS error
    // rather than a configuration one.
    //
    // **`undefined`, not `''`.** These getters use `??`, which falls back only
    // on null and undefined, so stubbing an empty string takes the *value* arm
    // and leaves the fallback unreached. The first draft of this file did
    // exactly that and left CI still failing at 50% branches — the same `??`
    // versus `||` distinction that made an empty NEXT_PUBLIC_SITE_URL crash
    // `src/config/site.ts` at module load.
    vi.stubEnv('NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN', undefined)
    const { shopifyPublicConfig } = await import('@/config/shopify-public')
    expect(shopifyPublicConfig.storeDomain).toBe('')
  })

  it('also returns an empty string when the variable is set but blank', async () => {
    // The other arm of the same getter, and a real deployment state: a Vercel
    // value cleared rather than deleted. Both reduce to '' here, which is what
    // lets every caller ask one truthiness question instead of two.
    vi.stubEnv('NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN', '')
    const { shopifyPublicConfig } = await import('@/config/shopify-public')
    expect(shopifyPublicConfig.storeDomain).toBe('')
  })

  it('is read at access time, not frozen at module evaluation', async () => {
    // The getters exist for exactly this. Freezing at import would make every
    // `stubEnv` in the suite a no-op and every server-side read stale.
    vi.stubEnv('NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN', 'first.myshopify.com')
    const { shopifyPublicConfig } = await import('@/config/shopify-public')
    expect(shopifyPublicConfig.storeDomain).toBe('first.myshopify.com')

    vi.stubEnv('NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN', 'second.myshopify.com')
    expect(shopifyPublicConfig.storeDomain).toBe('second.myshopify.com')
  })
})

describe('shopify config reads every secret, set and unset', () => {
  it('returns each value when present', async () => {
    vi.stubEnv('SHOPIFY_STOREFRONT_ACCESS_TOKEN', 'shpat_storefront')
    vi.stubEnv('SHOPIFY_ADMIN_ACCESS_TOKEN', 'shpat_admin')
    vi.stubEnv('SHOPIFY_REVALIDATION_SECRET', 'revalidate_me')

    const { shopifyConfig } = await import('@/config/shopify')
    expect(shopifyConfig.storefrontAccessToken).toBe('shpat_storefront')
    expect(shopifyConfig.adminAccessToken).toBe('shpat_admin')
    expect(shopifyConfig.revalidationSecret).toBe('revalidate_me')
  })

  it('returns empty strings for the two that callers test for truthiness', async () => {
    // `undefined`, not `''` — see the note in the shopify-public block above.
    // Both getters use `??`, so only a genuinely absent variable reaches the
    // fallback arm.
    vi.stubEnv('SHOPIFY_STOREFRONT_ACCESS_TOKEN', undefined)
    vi.stubEnv('SHOPIFY_REVALIDATION_SECRET', undefined)

    const { shopifyConfig } = await import('@/config/shopify')
    expect(shopifyConfig.storefrontAccessToken).toBe('')
    expect(shopifyConfig.revalidationSecret).toBe('')
  })

  it('returns empty strings when they are set but blank, too', async () => {
    vi.stubEnv('SHOPIFY_STOREFRONT_ACCESS_TOKEN', '')
    vi.stubEnv('SHOPIFY_REVALIDATION_SECRET', '')

    const { shopifyConfig } = await import('@/config/shopify')
    expect(shopifyConfig.storefrontAccessToken).toBe('')
    expect(shopifyConfig.revalidationSecret).toBe('')
  })

  it('leaves the admin token undefined rather than empty, because absent is its normal state', async () => {
    // The asymmetry is deliberate and worth pinning: this token is reserved for
    // future Order Management work and is expected to be unset, so `undefined`
    // distinguishes "never configured" from "configured as blank" in a way the
    // other two do not need.
    vi.stubEnv('SHOPIFY_ADMIN_ACCESS_TOKEN', undefined)
    const { shopifyConfig } = await import('@/config/shopify')
    expect(shopifyConfig.adminAccessToken).toBeUndefined()
  })

  it('takes its store domain and API version from the public config, never its own copy', async () => {
    vi.stubEnv('NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN', 'shared.myshopify.com')
    const { shopifyConfig } = await import('@/config/shopify')
    const { shopifyPublicConfig } = await import('@/config/shopify-public')

    expect(shopifyConfig.storeDomain).toBe('shared.myshopify.com')
    expect(shopifyConfig.apiVersion).toBe(shopifyPublicConfig.apiVersion)
  })

  it('exposes the revalidation periods the routes name', async () => {
    const { REVALIDATE } = await import('@/config/shopify')
    expect(REVALIDATE.cart).toBe(0)
    expect(REVALIDATE.product).toBeGreaterThan(0)
  })
})
