import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * **Both sides of every environment fallback in `src/config`.**
 *
 * ## Why three files failed CI and passed locally
 *
 * `build-info.ts` and the two vendor config modules beside it were almost entirely
 * `process.env.X ?? fallback`. Each of those is a branch, and **which side of it
 * runs is a property of the environment, not of the tests.** The sandbox had none
 * of those variables set; `ci.yml` set five at workflow scope. So the suite
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
 *
 * ## One file now, not three
 *
 * WS-A deleted the two vendor config modules on 2026-09-25, with the blocks that
 * covered their getters. `build-info.ts` is what remains, and its fingerprint lost
 * the store domain in the same change — so the fingerprint cases below drive
 * `NEXT_PUBLIC_SITE_URL`, the one key left, through both arms of its `??`.
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

  it('fingerprints the inlined value, set and unset, to different tokens', async () => {
    // The fingerprint is the stale-bundle detector's entire mechanism. If both
    // states hashed alike it would be unable to distinguish any deployment from
    // any other.
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', '')
    const empty = (await freshBuildInfo()).BUILD_INFO

    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://healthyjewellery.com')
    const filled = (await freshBuildInfo()).BUILD_INFO

    expect(empty.configFingerprint).not.toBe(filled.configFingerprint)
  })

  it('treats an absent site URL as blank rather than as the string "undefined"', async () => {
    // The `??` arm. `undefined`, not `''`: `??` falls back only on null and undefined,
    // so stubbing an empty string takes the *value* arm and leaves the fallback
    // unreached — which is exactly how the first draft of this file left CI at 50%
    // branches on a getter it believed it had covered. Absent and blank must
    // fingerprint alike, or a Vercel variable cleared rather than deleted would read
    // as a stale bundle.
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', undefined)
    const absent = (await freshBuildInfo()).BUILD_INFO

    vi.stubEnv('NEXT_PUBLIC_SITE_URL', '')
    const blank = (await freshBuildInfo()).BUILD_INFO

    expect(absent.configFingerprint).toBe(blank.configFingerprint)
  })

  it('exposes the fingerprinted key set that /api/version recomputes from', async () => {
    // One list, read by both sides. The route used to keep its own copy.
    const { FINGERPRINTED_KEYS } = await freshBuildInfo()
    expect([...FINGERPRINTED_KEYS]).toEqual(['NEXT_PUBLIC_SITE_URL'])
  })

  it('fingerprints deterministically, and independently of key order', async () => {
    const { fingerprint } = await freshBuildInfo()
    const a = { NEXT_PUBLIC_SITE_URL: 'https://x', NEXT_PUBLIC_EXAMPLE: 'y' }
    const b = { NEXT_PUBLIC_EXAMPLE: 'y', NEXT_PUBLIC_SITE_URL: 'https://x' }

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

/*
 * Two blocks stood here: `shopify-public reads the store domain, set and unset` and
 * `shopify config reads every secret, set and unset`. Their subjects were deleted by WS-A
 * on 2026-09-25 — the store domain has no reader left in the browser, and the three server
 * secrets had no reader left anywhere. The `??`-versus-`||` lesson they recorded survives
 * above, in the site-URL case, which is the same shape of branch on the one key left.
 */
