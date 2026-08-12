import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { shopifyPublicConfig } from '@/config/shopify-public'
import {
  reportApiVersionDrift,
  resetApiVersionDriftLog,
  PINNED_API_VERSION,
  API_VERSION_HEADER,
} from '@/lib/shopify/api-version'

const {
  SHOPIFY_API_VERSION,
  API_VERSION_ACCESSIBLE_UNTIL,
  MIGRATION_LEAD_DAYS,
  apiVersionStatus,
  compareServedApiVersion,
} = await import('../../../scripts/lib/api-version.mjs')

/**
 * The Shopify API version is written down in two places that cannot import each
 * other — `src/config/shopify-public.ts` (TypeScript, inlined into the bundle)
 * and `scripts/lib/api-version.mjs` (dependency-free, run by CI and by hand).
 *
 * That is the `cacheTags.ts` shape: two sides of a contract with nothing joining
 * them. It failed exactly the same way. Both said `2025-01` for roughly seven
 * months after Shopify stopped serving `2025-01` — they agreed with each other
 * perfectly, and were both wrong, and nothing anywhere could tell the difference.
 *
 * Agreement is what this file can enforce. Correctness is enforced live, by
 * `shopifyServesThePinnedApiVersion` in `scripts/verify-production.mjs`, which
 * reads Shopify's own `X-Shopify-API-Version` header. Both halves are needed:
 * agreement without the live check is what this project already had.
 */
/**
 * Remove comments so a scan for code can ignore prose.
 *
 * Line comments are matched only where `//` is not preceded by a colon, so the
 * `//` in `https://…` stays put — a URL is the single most likely place for a
 * hardcoded version literal to hide, and eating the rest of that line would make
 * this guardrail silently unable to see the thing it exists to find.
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(?<![:\w])\/\/.*$/gm, '')
}

function findVersionLiterals(source: string): string[] {
  return source.match(/(?<![\w-])20\d{2}-(?:01|04|07|10)(?![\w-])/g) ?? []
}

/**
 * The stripper is load-bearing for the scan above: if it removed too much, that
 * test would pass on a file that does hardcode a version. So it is tested against
 * the cases that would make it lie.
 */
describe('the version-literal scan cannot be blinded by its own comment stripping', () => {
  it('ignores a version named in a line comment', () => {
    expect(findVersionLiterals(stripComments('// we used to pin 2025-01\nconst a = 1'))).toEqual([])
  })

  it('ignores a version named in a block comment', () => {
    expect(findVersionLiterals(stripComments('/** was 2025-01, retired */\nconst a = 1'))).toEqual(
      [],
    )
  })

  it('still finds a version hardcoded inside a URL, despite the "//"', () => {
    const code = 'const u = `https://shop.myshopify.com/api/2025-01/graphql.json`'
    expect(findVersionLiterals(stripComments(code))).toEqual(['2025-01'])
  })

  it('still finds a bare version assignment', () => {
    expect(findVersionLiterals(stripComments("const API_VERSION = '2026-01'"))).toEqual(['2026-01'])
  })

  it('does not mistake an ordinary date-like string for a version', () => {
    // Quarterly only: 2026-08 is not a Shopify version name, and a scan that
    // flagged every YYYY-MM would flag the retirement dates in this repo's docs.
    expect(findVersionLiterals('const d = "2026-08-12"')).toEqual([])
  })
})

describe('Shopify API version contract', () => {
  it('the TypeScript config and the .mjs constant name the same version', () => {
    expect(shopifyPublicConfig.apiVersion).toBe(SHOPIFY_API_VERSION)
  })

  it('the client-side re-export follows the config rather than a third copy', () => {
    expect(PINNED_API_VERSION).toBe(shopifyPublicConfig.apiVersion)
  })

  it('the version is a real Shopify version name (YYYY-MM, quarterly)', () => {
    expect(SHOPIFY_API_VERSION).toMatch(/^\d{4}-(01|04|07|10)$/)
  })

  /**
   * The failure that started this: a literal spelled out in a second file, drifting
   * unnoticed. `verify-production.mjs` must *import* the version, never re-declare
   * it — so the source is scanned, not just compared.
   *
   * Comments are stripped first. `audit-workflow-secrets.mjs` learned this the
   * expensive way: its first grep-based pass reported a secret name that came from a
   * comment documenting an anti-pattern, and **a tool that reports phantoms teaches
   * its reader to skim.** The history of this very bug is written in the comments of
   * the file under test, so scanning them would fail permanently for the wrong reason.
   *
   * Stripping cannot be allowed to blind the scan, which is what `stripComments`'s own
   * tests below are for.
   */
  it('no script hardcodes a version literal instead of importing it', () => {
    const source = readFileSync(
      resolve(__dirname, '../../../scripts/verify-production.mjs'),
      'utf8',
    )
    expect(findVersionLiterals(stripComments(source))).toEqual([])
  })

  it('the retirement date is a parseable instant in the future of the pinned release', () => {
    const deadline = new Date(API_VERSION_ACCESSIBLE_UNTIL)
    expect(Number.isNaN(deadline.getTime())).toBe(false)
    // Shopify keeps a version accessible ~12 months from its release quarter.
    const [year, month] = SHOPIFY_API_VERSION.split('-').map(Number)
    expect(deadline.getTime()).toBeGreaterThan(Date.UTC(year, month - 1, 1))
  })
})

/**
 * `apiVersionStatus` gates a premise that fires **once, on a date in the future**.
 * Its interesting branches therefore never run locally, which is precisely the
 * shape of bug this project has already shipped: the completed-order branch of
 * the cart could not be exercised in development and was the half that broke.
 *
 * So the clock is the parameter, and every branch is exercised here.
 */
describe('apiVersionStatus', () => {
  const deadline = new Date(API_VERSION_ACCESSIBLE_UNTIL)
  const daysBefore = (n: number) => new Date(deadline.getTime() - n * 86_400_000)

  it('reports ok while the version is comfortably accessible', () => {
    const status = apiVersionStatus(daysBefore(MIGRATION_LEAD_DAYS + 30))
    expect(status.state).toBe('ok')
    expect(status.daysRemaining).toBeGreaterThan(MIGRATION_LEAD_DAYS)
  })

  it('reports expiring inside the migration lead time', () => {
    expect(apiVersionStatus(daysBefore(MIGRATION_LEAD_DAYS - 1)).state).toBe('expiring')
  })

  it('treats the lead-time boundary itself as expiring, not ok', () => {
    // Off-by-one here would silence the warning for a whole day at the exact
    // moment it starts mattering.
    expect(apiVersionStatus(daysBefore(MIGRATION_LEAD_DAYS)).state).toBe('expiring')
  })

  it('reports expired once the deadline has passed', () => {
    const status = apiVersionStatus(new Date(deadline.getTime() + 86_400_000))
    expect(status.state).toBe('expired')
    expect(status.daysRemaining).toBeLessThanOrEqual(0)
  })

  it('reports expired at the instant of retirement, not one day later', () => {
    expect(apiVersionStatus(deadline).state).toBe('expired')
  })

  it('rounds a part-day up, so "12 hours left" is not reported as zero days', () => {
    expect(apiVersionStatus(new Date(deadline.getTime() - 43_200_000)).daysRemaining).toBe(1)
  })
})

describe('compareServedApiVersion', () => {
  it('matches when Shopify served the pinned version', () => {
    const result = compareServedApiVersion(SHOPIFY_API_VERSION)
    expect(result.matches).toBe(true)
    expect(result.served).toBe(SHOPIFY_API_VERSION)
  })

  it('tolerates surrounding whitespace in the header value', () => {
    expect(compareServedApiVersion(` ${SHOPIFY_API_VERSION} `).matches).toBe(true)
  })

  /**
   * The real-world case: Shopify answers a retired version with a different one
   * and a 200. Nothing else in a response distinguishes this from success.
   */
  it('reports a fall-forward, naming both versions and the fix', () => {
    const result = compareServedApiVersion('2026-10')
    expect(result.matches).toBe(false)
    expect(result.served).toBe('2026-10')
    expect(result.reason).toContain('2026-10')
    expect(result.reason).toContain(SHOPIFY_API_VERSION)
    expect(result.reason).toContain('api-version.mjs')
  })

  /**
   * "We could not tell" is not "it matched". Collapsing the two is what made
   * `environment: production-readonly` a control that could not fail (ADR 006).
   */
  it.each([null, undefined, '', '   '])('treats a missing header (%p) as a mismatch', (header) => {
    const result = compareServedApiVersion(header)
    expect(result.matches).toBe(false)
    expect(result.served).toBeNull()
    expect(result.reason).toContain('unknown')
  })
})

describe('reportApiVersionDrift', () => {
  let error: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    resetApiVersionDriftLog()
    error = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    error.mockRestore()
  })

  const headers = (value?: string) =>
    new Headers(value === undefined ? {} : { [API_VERSION_HEADER]: value })

  it('says nothing when Shopify served the pinned version', () => {
    expect(reportApiVersionDrift(headers(PINNED_API_VERSION), 'test')).toBeNull()
    expect(error).not.toHaveBeenCalled()
  })

  it('reports a fall-forward with both versions and the caller', () => {
    const drift = reportApiVersionDrift(headers('2027-01'), 'shopifyFetch')
    expect(drift).toEqual({ served: '2027-01', pinned: PINNED_API_VERSION })

    const [, payload] = error.mock.calls[0] as [string, Record<string, unknown>]
    expect(payload).toMatchObject({ caller: 'shopifyFetch', served: '2027-01' })
  })

  it('reports an absent header as drift with a served value of null', () => {
    expect(reportApiVersionDrift(headers(), 'shopifyFetch')).toEqual({
      served: null,
      pinned: PINNED_API_VERSION,
    })
    expect(error).toHaveBeenCalledTimes(1)
  })

  /**
   * A page fans out to several Shopify calls and a Lambda instance serves many
   * pages, so an un-deduplicated error would print on every fetch for the life
   * of the instance — training everyone to filter out the one line that matters.
   */
  it('logs a given drift once, however many times it recurs', () => {
    for (let i = 0; i < 25; i++) reportApiVersionDrift(headers('2027-01'), 'shopifyFetch')
    expect(error).toHaveBeenCalledTimes(1)
  })

  it('still returns the drift on repeat calls, even when it does not log again', () => {
    reportApiVersionDrift(headers('2027-01'), 'shopifyFetch')
    expect(reportApiVersionDrift(headers('2027-01'), 'shopifyFetch')).not.toBeNull()
  })

  it('logs a second, different drift rather than swallowing it', () => {
    reportApiVersionDrift(headers('2027-01'), 'shopifyFetch')
    reportApiVersionDrift(headers('2027-04'), 'shopifyFetch')
    expect(error).toHaveBeenCalledTimes(2)
  })
})
