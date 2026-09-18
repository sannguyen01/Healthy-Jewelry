import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import ts from 'typescript'
import { parseSource, walk } from '@/lib/analysis/tsAstScan'

/**
 * **`/api/version` — the stale-bundle detector, which had no test.**
 *
 * `e2e/COVERAGE.md` excused this route from browser coverage on the grounds that
 * `src/tests/unit/api-version-contract.test.ts` verified it. That file tests
 * something else entirely: the version-literal scan across
 * `@/lib/shopify/api-version` and `scripts/lib/api-version.mjs`. It never
 * imports this route. The exception was written in good faith, named a real file
 * with a plausible name, and was checked by nothing — which is how
 * `coverage-manifest-truthfulness.test.ts` found it.
 *
 * So the route's entire purpose was untested. That purpose is one comparison:
 * the `NEXT_PUBLIC_*` fingerprint **inlined into the bundle at build time**
 * against the same fingerprint computed **from the live environment at request
 * time**. They differ exactly when a build reused its cache and kept stale
 * values — a failure that is byte-identical to a correct deployment in every
 * other respect, and which this project's runbook and STATE.md both warn about
 * without making observable.
 *
 * ## The assertion that matters most is static
 *
 * `readRuntimeEnv` indexes `process.env` with a **variable**, and its own comment
 * says so in unusually direct terms: *"Indexing with a variable is not a
 * stylistic choice and must not be 'tidied up': it is the only thing making the
 * two measurements independent. The whole route silently stops working if this
 * becomes a literal lookup."*
 *
 * That fragility cannot be caught behaviourally. Next's inliner is a textual
 * substitution performed during `next build`; under vitest there is no inliner,
 * so a literal read and an indexed read behave identically and every runtime
 * assertion below would pass on the broken version. The only place the
 * difference exists is in the source, so that is where it is checked — through
 * the AST rather than a regex
 * ([ADR 007](../../../docs/adr/007-regex-guardrails-have-unknown-coverage.md)),
 * because a pattern would match the warning comment itself.
 */

const ROOT = resolve(__dirname, '../../..')
const ROUTE_PATH = 'src/app/api/version/route.ts'

async function loadRoute() {
  vi.resetModules()
  return import('@/app/api/version/route')
}

beforeEach(() => {
  vi.unstubAllEnvs()
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe('the inliner-defeating read must survive refactoring', () => {
  /** Every `process.env.<LITERAL>` access in the route, as written. */
  function literalEnvReads(): string[] {
    const source = readFileSync(join(ROOT, ROUTE_PATH), 'utf8')
    const found: string[] = []

    walk(parseSource(ROUTE_PATH, source), (node) => {
      if (!ts.isPropertyAccessExpression(node)) return
      const obj = node.expression
      if (
        ts.isPropertyAccessExpression(obj) &&
        ts.isIdentifier(obj.expression) &&
        obj.expression.text === 'process' &&
        obj.name.text === 'env'
      ) {
        found.push(node.name.text)
      }
    })
    return found
  }

  it('the route never reads process.env by literal name', () => {
    // A literal here is substituted at build time, so `runtime.configFingerprint`
    // becomes a second copy of `build.configFingerprint`: always equal, and the
    // detector reports "not stale" for every deployment forever — including the
    // stale ones it exists to find. Comments are not AST nodes, so the warning
    // that says exactly this does not match.
    expect(
      literalEnvReads(),
      `${ROUTE_PATH} reads process.env by literal property name. Next inlines those at ` +
        `build time, which collapses the runtime fingerprint onto the build one and turns ` +
        `this route's only comparison into a tautology. Read through readRuntimeEnv(name).`
    ).toEqual([])
  })

  it('build-info reads them by literal name, which is the other half of the pair', () => {
    // The asymmetry is the mechanism. `build-info.ts` is in the client graph and
    // *must* be inlined; this route must not be. A test asserting only one side
    // would pass on a codebase where both had been made the same.
    const source = readFileSync(join(ROOT, 'src/config/build-info.ts'), 'utf8')
    expect(source).toContain('process.env.NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN')
    expect(source).toContain('process.env.NEXT_PUBLIC_SITE_URL')
  })

  it('stays dynamic, so no answer is ever prerendered and cached as fact', async () => {
    const mod = await loadRoute()
    expect(mod.dynamic).toBe('force-dynamic')
  })
})

describe('the stale-bundle comparison', () => {
  it('reports bundleIsStale when the live environment differs from the bundle', async () => {
    // The whole point of the route. `BUILD_INFO.configFingerprint` was computed
    // when the module first loaded; changing the environment afterwards is
    // exactly what a cached build looks like from the inside.
    const { GET } = await loadRoute()
    vi.stubEnv('NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN', 'changed-after-the-build.myshopify.com')
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://changed.example')

    const body = await (await GET()).json()

    expect(body.bundleIsStale).toBe(true)
    expect(body.runtime.configFingerprint).not.toBe(body.build.configFingerprint)
    expect(body.hint).toMatch(/Build Cache/)
  })

  it('reports a fresh bundle when they agree', async () => {
    const { GET } = await loadRoute()
    const body = await (await GET()).json()

    expect(body.bundleIsStale).toBe(false)
    expect(body.runtime.configFingerprint).toBe(body.build.configFingerprint)
    expect(body.hint).toBeUndefined()
  })

  it('notices a change in either fingerprinted key, not just the first', async () => {
    const { GET } = await loadRoute()

    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://only-this-one-changed.example')
    expect((await (await GET()).json()).bundleIsStale, 'SITE_URL alone was ignored').toBe(true)

    vi.unstubAllEnvs()
    vi.stubEnv('NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN', 'only-this-one.myshopify.com')
    expect((await (await GET()).json()).bundleIsStale, 'STORE_DOMAIN alone was ignored').toBe(true)
  })

  it('always answers 200, and never from a cache', async () => {
    // Unlike /api/health this route reports rather than judges: a stale bundle
    // is a fact for a human to read, not a reason to page anyone. `no-store`
    // because a cached answer describes a moment that has passed.
    const { GET } = await loadRoute()
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://stale.example')

    const res = await GET()
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe('no-store')
  })
})

describe('what it reports about Shopify', () => {
  it('says configured only when both halves are present', async () => {
    const { GET } = await loadRoute()

    vi.stubEnv('NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN', 'shop.myshopify.com')
    vi.stubEnv('SHOPIFY_STOREFRONT_ACCESS_TOKEN', '')
    expect((await (await GET()).json()).shopify.configured).toBe(false)

    vi.stubEnv('SHOPIFY_STOREFRONT_ACCESS_TOKEN', 'a-token')
    expect((await (await GET()).json()).shopify.configured).toBe(true)

    vi.stubEnv('NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN', '')
    expect((await (await GET()).json()).shopify.configured).toBe(false)
  })

  it('reports the pinned API version from the module, not a literal', async () => {
    const { GET } = await loadRoute()
    const { PINNED_API_VERSION } = await import('@/lib/shopify/api-version')
    expect((await (await GET()).json()).shopify.pinnedApiVersion).toBe(PINNED_API_VERSION)
  })
})

describe('the endpoint is public, so it says whether — never how', () => {
  it('returns no secret value anywhere in the payload', async () => {
    const { GET } = await loadRoute()
    vi.stubEnv('SHOPIFY_STOREFRONT_ACCESS_TOKEN', 'shpat_SECRET_TOKEN_VALUE')
    vi.stubEnv('SHOPIFY_WEBHOOK_SECRET', 'whsec_SECRET_WEBHOOK_VALUE')
    vi.stubEnv('SHOPIFY_CUSTOMER_ACCOUNT_CLIENT_SECRET', 'SECRET_CLIENT_VALUE')
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'SECRET_UPSTASH_VALUE')

    const raw = await (await GET()).text()

    for (const secret of [
      'shpat_SECRET_TOKEN_VALUE',
      'whsec_SECRET_WEBHOOK_VALUE',
      'SECRET_CLIENT_VALUE',
      'SECRET_UPSTASH_VALUE',
    ]) {
      expect(raw, `the payload leaked ${secret}`).not.toContain(secret)
    }
  })

  it('reports the store domain as a boolean rather than as a value', async () => {
    // `NEXT_PUBLIC_*` is public by construction, so this is not protecting a
    // secret — it is keeping the surface to exactly what the question needs.
    const { GET } = await loadRoute()
    vi.stubEnv('NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN', 'some-store.myshopify.com')

    const raw = await (await GET()).text()
    expect(JSON.parse(raw).runtime.storeDomainSet).toBe(true)
    expect(raw).not.toContain('some-store.myshopify.com')
  })
})
