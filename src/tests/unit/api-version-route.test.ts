import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import ts from 'typescript'
import { parseSource, walk, envReads } from '@/lib/analysis/tsAstScan'

/**
 * **`/api/version` — the stale-bundle detector.**
 *
 * `e2e/COVERAGE.md` once excused this route from browser coverage on the grounds that a
 * version-literal contract test verified it. That file tested something else entirely and
 * never imported the route. The exception was written in good faith, named a real file
 * with a plausible name, and was checked by nothing — which is how
 * `coverage-manifest-truthfulness.test.ts` found it, and why this file exists.
 *
 * The route's purpose is one comparison: the `NEXT_PUBLIC_*` fingerprint **inlined into
 * the bundle at build time** against the same fingerprint computed **from the live
 * environment at request time**. They differ exactly when a build reused its cache and
 * kept stale values — a failure that is byte-identical to a correct deployment in every
 * other respect, and which STATE.md warns about without making observable.
 *
 * ## What changed on 2026-09-25, and what did not
 *
 * WS-A removed the route's vendor block and the two store-domain fields, and dropped the
 * store domain from the fingerprinted key set: nothing on the site can sell, so "is this
 * deployment configured to sell" had one answer on every deployment and was no longer a
 * measurement. The four assertions about that block went with it.
 *
 * The fingerprint assertions are the substance of this file and all of them survive. Two
 * got *stronger* in the process rather than merely narrower
 * ([ADR 035](../../../docs/adr/035-a-control-outlives-its-subject.md)): the key set is now
 * read from `build-info.ts` instead of restated here, and every key in it is checked for
 * a literal read — so adding a key cannot quietly produce a fingerprint the browser
 * computes over `undefined`.
 *
 * ## The assertion that matters most is static
 *
 * `readRuntimeEnv` indexes `process.env` with a **variable**, and its own comment says so
 * in unusually direct terms: *"Indexing with a variable is not a stylistic choice and must
 * not be 'tidied up': it is the only thing making the two measurements independent. The
 * whole route silently stops working if this becomes a literal lookup."*
 *
 * That fragility cannot be caught behaviourally. Next's inliner is a textual substitution
 * performed during `next build`; under vitest there is no inliner, so a literal read and
 * an indexed read behave identically and every runtime assertion below would pass on the
 * broken version. The only place the difference exists is in the source, so that is where
 * it is checked — through the AST rather than a regex
 * ([ADR 007](../../../docs/adr/007-regex-guardrails-have-unknown-coverage.md)), because a
 * pattern would match the warning comment itself.
 */

const ROOT = resolve(__dirname, '../../..')
const ROUTE_PATH = 'src/app/api/version/route.ts'
const BUILD_INFO_PATH = 'src/config/build-info.ts'

async function loadRoute() {
  vi.resetModules()
  return import('@/app/api/version/route')
}

async function loadBuildInfo() {
  vi.resetModules()
  return import('@/config/build-info')
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

  it('build-info reads every fingerprinted key by literal name, which is the other half', async () => {
    // The asymmetry is the mechanism. `build-info.ts` is in the client graph and *must* be
    // inlined; this route must not be. A test asserting only one side would pass on a
    // codebase where both had been made the same.
    //
    // Driven from `FINGERPRINTED_KEYS` rather than a list typed here: a key added to the
    // set but read through a computed lookup would not be inlined, would read `undefined`
    // in the browser, and would fingerprint to a value that looks fine and measures
    // nothing. Through the AST, so a key named only in a comment does not count.
    const { FINGERPRINTED_KEYS } = await loadBuildInfo()
    const literal = envReads(
      parseSource(BUILD_INFO_PATH, readFileSync(join(ROOT, BUILD_INFO_PATH), 'utf8'))
    )

    expect(FINGERPRINTED_KEYS.length, 'nothing is fingerprinted, so nothing is compared').toBeGreaterThan(0)
    for (const key of FINGERPRINTED_KEYS) {
      expect(literal, `${key} is fingerprinted but not read as a literal`).toContain(key)
    }
  })

  it('fingerprints the one operator-set public value the rendered site depends on', async () => {
    // A wrong NEXT_PUBLIC_SITE_URL points every canonical URL, OG image and JSON-LD
    // record at another host while every page renders perfectly. If this set ever loses
    // it, the detector keeps running and has nothing left to detect.
    const { FINGERPRINTED_KEYS } = await loadBuildInfo()
    expect(FINGERPRINTED_KEYS).toContain('NEXT_PUBLIC_SITE_URL')
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

  it('notices a change in every fingerprinted key, one at a time', async () => {
    // Was "either key, not just the first" while there were two. Driven from the shared
    // key set so a third key is covered by this loop the day it is added.
    const { FINGERPRINTED_KEYS } = await loadBuildInfo()
    for (const key of FINGERPRINTED_KEYS) {
      vi.unstubAllEnvs()
      const { GET } = await loadRoute()
      vi.stubEnv(key, `changed-after-the-build:${key}`)
      expect((await (await GET()).json()).bundleIsStale, `${key} alone was ignored`).toBe(true)
    }
  })

  it('ignores a change to a variable that is not fingerprinted', async () => {
    // The other direction. A detector that fired on any environment change would page on
    // every unrelated secret rotation, and be muted within a week (ADR 011).
    const { GET } = await loadRoute()
    vi.stubEnv('RESEND_API_KEY', 'rotated-after-the-build')
    expect((await (await GET()).json()).bundleIsStale).toBe(false)
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

describe('the payload is exactly the fingerprint, in both directions', () => {
  /**
   * Equality on the key sets, not `toHaveProperty` on the ones that matter. A removed
   * field and a re-added one are both changes a consumer can observe, and a check that
   * only asserted presence would pass on a payload that had quietly grown a vendor block
   * back ([ADR 021](../../../docs/adr/021-a-metric-with-only-one-direction.md)).
   */
  it('carries the build identity, the runtime fingerprint and the verdict — nothing else', async () => {
    const { GET } = await loadRoute()
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://stale.example') // so `hint` is present
    const body = await (await GET()).json()

    expect(Object.keys(body).sort()).toEqual(['build', 'bundleIsStale', 'hint', 'runtime'])
    expect(Object.keys(body.build).sort()).toEqual([
      'branch',
      'builtAt',
      'commit',
      'configFingerprint',
      'shortCommit',
      'vercelEnv',
      'vercelUrl',
    ])
    expect(Object.keys(body.runtime).sort()).toEqual(['configFingerprint', 'vercelEnv'])
  })

  it('still satisfies the canonical-domain probe, which reads it from outside', async () => {
    // `scripts/lib/canonical-domain.mjs` is the consumer of this payload that outlives the
    // decommission. It reads `build.commit`, `runtime.vercelEnv` and `build.vercelEnv`.
    // Feeding it the real route output — not a hand-written fixture of what the route is
    // believed to return — is what makes a rename here fail here. Renamed, `commit` would
    // simply read as absent out there, and the probe would stop comparing commits without
    // saying so.
    const COMMIT = 'c0ffee00c0ffee00c0ffee00c0ffee00c0ffee00'
    vi.stubEnv('NEXT_PUBLIC_HJ_COMMIT', COMMIT)
    vi.stubEnv('VERCEL_ENV', 'production')
    const { GET } = await loadRoute()
    const version = await (await GET()).json()

    const { decideCanonicalDomain } = await import('../../../scripts/lib/canonical-domain.mjs')
    // The probe's own `HostObservation['version']` shape: the fields it reads, and no more.
    type VersionBody = {
      build?: { commit?: string | null; vercelEnv?: string | null }
      runtime?: { vercelEnv?: string | null }
    }
    const observe = (v: VersionBody) => [
      {
        host: 'healthyjewellery.com',
        transport: 'ok' as const,
        status: 200,
        chain: ['healthyjewellery.com'],
        server: 'Vercel',
        version: v,
      },
    ]

    const bound = decideCanonicalDomain({
      observations: observe(version),
      apexHost: 'healthyjewellery.com',
      expectedCommit: COMMIT,
    })
    expect(bound.state, JSON.stringify(bound.findings)).toBe('bound')

    // And the fields are what decide it, rather than the probe passing on any object.
    const behind = decideCanonicalDomain({
      observations: observe(version),
      apexHost: 'healthyjewellery.com',
      expectedCommit: 'f'.repeat(40),
    })
    expect(behind.findings.map((f: { code: string }) => f.code)).toContain('commit-behind-main')

    vi.stubEnv('VERCEL_ENV', 'preview')
    const preview = decideCanonicalDomain({
      observations: observe(await (await GET()).json()),
      apexHost: 'healthyjewellery.com',
    })
    expect(preview.findings.map((f: { code: string }) => f.code)).toContain('not-production')
  })
})

describe('the endpoint is public, so it says whether — never how', () => {
  it('returns no secret value anywhere in the payload', async () => {
    const { GET } = await loadRoute()
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'SECRET_UPSTASH_VALUE')
    vi.stubEnv('RESEND_API_KEY', 'SECRET_RESEND_VALUE')
    vi.stubEnv('RATE_LIMIT_KEY_SECRET', 'SECRET_RATE_LIMIT_KEY_VALUE_0123456789')

    const raw = await (await GET()).text()

    for (const secret of [
      'SECRET_UPSTASH_VALUE',
      'SECRET_RESEND_VALUE',
      'SECRET_RATE_LIMIT_KEY_VALUE_0123456789',
    ]) {
      expect(raw, `the payload leaked ${secret}`).not.toContain(secret)
    }
  })

  it('reports the site URL as a fingerprint rather than as a value', async () => {
    // `NEXT_PUBLIC_*` is public by construction, so this is not protecting a
    // secret — it is keeping the surface to exactly what the question needs.
    const { GET } = await loadRoute()
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://some-preview-host.example')

    const raw = await (await GET()).text()
    expect(raw).not.toContain('some-preview-host.example')
  })
})
