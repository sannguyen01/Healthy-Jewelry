/**
 * The canonical-domain verdict, driven from fixtures.
 *
 * `scripts/probe-canonical-domain.mjs` is transport and printing; every decision it makes
 * lives in `scripts/lib/canonical-domain.mjs` as a pure function, so every branch below is
 * reachable without a network (ADR 030, and ADR 024's rule that a tool must be pointed at a
 * known answer before it is trusted against an unknown one).
 *
 * Two of these tests exist because running the probe disproved something I believed:
 *
 *   · **The interception tests.** The sandbox this was written in proxies egress and answers
 *     blocked hosts with a bare 403. The first version read that as "the brand domain
 *     answered 403" and produced five confident findings about a domain it had never
 *     reached — an inability to measure, laundered into a measurement, which is ADR 010's
 *     failure with the sign flipped. On a six-hourly schedule that is a false production
 *     alarm four times a day.
 *   · **The `unreachable`-does-not-condemn test.** Missing evidence and bad evidence must
 *     not produce the same verdict, or the probe's own network becomes indistinguishable
 *     from a broken domain.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import fs, { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

import { SITE_URL } from '@/config/site'

// `await import`, not a static import: this is how every other spec in this directory
// reaches a dependency-free `.mjs` sibling (see api-version-contract.test.ts), and the
// convention exists so the script stays importable by bare `node` in CI as well as by
// Vitest here.
const {
  apexHostFromSiteConfig,
  classifyResponseOrigin,
  classifyTransportFailure,
  decideCanonicalDomain,
} = await import('../../../scripts/lib/canonical-domain.mjs')

// The probe itself, imported for its transport half. Safe because the script guards its
// own `main()` behind an `import.meta.url` check — without that, importing it here would
// fire real requests and call `process.exit`.
const { observe, MAX_REDIRECTS } = await import('../../../scripts/probe-canonical-domain.mjs')
const { domainIssuePlan, DOMAIN_ISSUE_LABEL } = await import('../../../scripts/lib/canonical-domain.mjs')

const APEX = 'healthyjewellery.com'
const WWW = `www.${APEX}`
const COMMIT = 'a'.repeat(40)

/**
 * Mirrors `HostObservation` in the probe's JSDoc.
 *
 * Restated here because the module is dependency-free `.mjs` and carries its types in
 * JSDoc, so there is no exported type to import. Written out rather than inferred so the
 * literal unions survive: `transport: 'ok'` inside an untyped object literal widens to
 * `string`, which is not assignable to the union the decision function takes — a real
 * type error this file shipped with until `tsc` ran on it.
 */
type Obs = {
  host: string
  transport: 'ok' | 'not-resolved' | 'unreachable'
  detail?: string
  status?: number
  chain?: string[]
  server?: string | null
  version?: {
    build?: { commit?: string | null; vercelEnv?: string | null }
    runtime?: { vercelEnv?: string | null }
  } | null
}

/** A healthy observation, with an escape hatch for the one field a test is about. */
function ok(host: string, over: Partial<Obs> = {}): Obs {
  return {
    host,
    transport: 'ok',
    status: 200,
    chain: [host],
    server: 'Vercel',
    version: {
      build: { commit: COMMIT, vercelEnv: 'production' },
      runtime: { vercelEnv: 'production' },
    },
    ...over,
  }
}

const codes = (v: { findings: { code: string }[] }) => v.findings.map((f) => f.code)

describe('decideCanonicalDomain', () => {
  it('reports bound when both hostnames reach the same production deployment', () => {
    const verdict = decideCanonicalDomain({
      observations: [ok(APEX), ok(WWW, { chain: [WWW, APEX] })],
      apexHost: APEX,
      expectedCommit: COMMIT,
    })
    expect(verdict.state).toBe('bound')
    expect(verdict.findings).toEqual([])
    expect(verdict.action).toBeNull()
  })

  it('catches a preview deployment answering on the brand domain', () => {
    // The failure this probe was commissioned for: the site renders, the tab looks right,
    // and production is serving a build that was never promoted.
    const verdict = decideCanonicalDomain({
      observations: [
        ok(APEX, {
          version: {
            build: { commit: COMMIT, vercelEnv: 'preview' },
            runtime: { vercelEnv: 'preview' },
          },
        }),
      ],
      apexHost: APEX,
    })
    expect(verdict.state).toBe('drifted')
    expect(codes(verdict)).toContain('not-production')
  })

  it('trusts the runtime environment over the one inlined at build time', () => {
    // A bundle built in preview and promoted to production is fine; only `runtime` is a
    // statement about now. Asserting the converse would fail every promoted deployment.
    const verdict = decideCanonicalDomain({
      observations: [
        ok(APEX, {
          version: {
            build: { commit: COMMIT, vercelEnv: 'preview' },
            runtime: { vercelEnv: 'production' },
          },
        }),
      ],
      apexHost: APEX,
    })
    expect(verdict.state).toBe('bound')
  })

  it('treats NXDOMAIN as an answer, not as an inability to answer', () => {
    const verdict = decideCanonicalDomain({
      observations: [
        { host: APEX, transport: 'not-resolved', detail: 'ENOTFOUND' },
        { host: WWW, transport: 'not-resolved', detail: 'ENOTFOUND' },
      ],
      apexHost: APEX,
    })
    expect(verdict.state).toBe('drifted')
    expect(codes(verdict)).toContain('unresolved')
  })

  it('reports unevaluable, not drifted, when nothing could be reached', () => {
    const verdict = decideCanonicalDomain({
      observations: [
        { host: APEX, transport: 'unreachable', detail: 'UND_ERR_CONNECT_TIMEOUT' },
        { host: WWW, transport: 'unreachable', detail: 'EAI_AGAIN' },
      ],
      apexHost: APEX,
    })
    expect(verdict.state).toBe('unevaluable')
    expect(verdict.action).toBeNull()
  })

  it('does not condemn the domain because one hostname was unreachable', () => {
    const verdict = decideCanonicalDomain({
      observations: [ok(APEX), { host: WWW, transport: 'unreachable', detail: 'EAI_AGAIN' }],
      apexHost: APEX,
    })
    expect(verdict.state).toBe('bound')
    // …but the gap is on the record, so the verdict is never read as covering more than
    // it measured.
    expect(codes(verdict)).toContain('unreachable')
  })

  it('notices the two hostnames serving different deployments', () => {
    const verdict = decideCanonicalDomain({
      observations: [
        ok(APEX),
        ok(WWW, {
          chain: [WWW, APEX],
          version: {
            build: { commit: 'b'.repeat(40), vercelEnv: 'production' },
            runtime: { vercelEnv: 'production' },
          },
        }),
      ],
      apexHost: APEX,
    })
    expect(codes(verdict)).toContain('commit-mismatch')
  })

  it('notices www serving its own copy instead of redirecting', () => {
    const verdict = decideCanonicalDomain({
      observations: [ok(APEX), ok(WWW)],
      apexHost: APEX,
    })
    expect(codes(verdict)).toContain('www-not-redirected')
  })

  it('notices a redirect leaving the brand entirely', () => {
    // The shape a completed Shopify "Connect existing domain" flow would produce, which
    // docs/dns-domain-setup.md exists to warn against.
    const verdict = decideCanonicalDomain({
      observations: [ok(APEX, { chain: [APEX, 'shops.myshopify.com'] })],
      apexHost: APEX,
    })
    expect(codes(verdict)).toContain('off-domain-redirect')
  })

  it('notices the domain pointed at something that is not Vercel', () => {
    const verdict = decideCanonicalDomain({
      observations: [ok(APEX, { server: 'cloudflare' })],
      apexHost: APEX,
    })
    expect(codes(verdict)).toContain('not-vercel')
  })

  it('notices production pinned behind main', () => {
    const verdict = decideCanonicalDomain({
      observations: [ok(APEX)],
      apexHost: APEX,
      expectedCommit: 'c'.repeat(40),
    })
    expect(codes(verdict)).toContain('commit-behind-main')
  })

  it('reports its own misconfiguration as its own, not as the domain’s', () => {
    const verdict = decideCanonicalDomain({
      observations: [ok('example.com')],
      apexHost: APEX,
    })
    expect(verdict.state).toBe('unevaluable')
    expect(codes(verdict)).toContain('config-host-mismatch')
    expect(verdict.action).toMatch(/Fix the probe/)
  })

  it('never passes on no evidence', () => {
    expect(decideCanonicalDomain({ observations: [], apexHost: APEX }).state).toBe('unevaluable')
  })
})

describe('classifyTransportFailure', () => {
  it('separates an authoritative NXDOMAIN from a resolver declining to answer', () => {
    // fetch-error.mjs groups these two, which is right for a hint to a human and wrong
    // for a verdict: they mean opposite things here.
    expect(classifyTransportFailure('ENOTFOUND: fetch failed')).toBe('not-resolved')
    expect(classifyTransportFailure('EAI_AGAIN: fetch failed')).toBe('unreachable')
  })

  it('lets the authoritative code outrank the retryable one in a nested cause chain', () => {
    expect(classifyTransportFailure('EAI_AGAIN: x ← ENOTFOUND: y')).toBe('not-resolved')
  })
})

describe('classifyResponseOrigin', () => {
  it('refuses to attribute a bare refusal to any origin', () => {
    expect(classifyResponseOrigin({ status: 403, server: null, version: null })).toBe('intercepted')
    expect(classifyResponseOrigin({ status: 407, server: null, version: null })).toBe('intercepted')
  })

  it('still judges a 403 that identifies its server', () => {
    // Vercel Deployment Protection answers 403 and sends `server: Vercel`. That is a real
    // finding about a real origin and must survive the interception guard.
    expect(classifyResponseOrigin({ status: 403, server: 'Vercel', version: null })).toBe('origin')
    expect(classifyResponseOrigin({ status: 403, server: null, version: { build: {} } })).toBe(
      'origin'
    )
  })

  it('attributes a foreign server answering normally, because that is a real misbinding', () => {
    expect(classifyResponseOrigin({ status: 200, server: 'cloudflare', version: null })).toBe(
      'origin'
    )
    expect(classifyResponseOrigin({ status: 404, server: null, version: null })).toBe('origin')
  })
})

describe('apexHostFromSiteConfig', () => {
  /**
   * The join that makes this a control rather than a reachability test.
   *
   * The probe is dependency-free `.mjs` and cannot import a `.ts` module, so it reads the
   * hostname out of `src/config/site.ts` with a pattern — and ADR 007 is blunt that a
   * pattern has unknown coverage. This is what makes the coverage known: the real constant
   * is imported here and compared to what the pattern extracts. Move the domain and this
   * fails, instead of the probe quietly holding production to a hostname the application
   * stopped believing in.
   */
  it('extracts the same hostname the application itself resolves', () => {
    const source = fs.readFileSync(
      path.resolve(import.meta.dirname, '../../config/site.ts'),
      'utf8'
    )
    expect(apexHostFromSiteConfig(source)).toBe(new URL(SITE_URL).hostname)
  })

  it('returns null rather than guessing when the literal is absent', () => {
    expect(apexHostFromSiteConfig('export const SITE_URL = process.env.WHATEVER')).toBeNull()
    expect(apexHostFromSiteConfig('nothing here at all')).toBeNull()
  })
})

describe('observe — the redirect walk', () => {
  /**
   * Stub `fetch` with a hostname → response map.
   *
   * The transport half had no coverage at all until now, and it is where the defect this
   * probe shipped with actually lived: a proxy's bare 403 read as an answer from the
   * origin. `decideCanonicalDomain` was never wrong about it — it was handed an
   * observation that already said `transport: 'ok'`.
   */
  function stubFetch(routes: Record<string, { status: number; location?: string; body?: unknown; server?: string | null }>) {
    return vi.fn(async (url: string | URL) => {
      const { hostname } = new URL(String(url))
      const route = routes[hostname]
      if (!route) throw Object.assign(new Error('fetch failed'), { cause: Object.assign(new Error('nope'), { code: 'ENOTFOUND' }) })
      return {
        status: route.status,
        headers: {
          get: (name: string) =>
            name.toLowerCase() === 'location'
              ? (route.location ?? null)
              : name.toLowerCase() === 'server'
                ? (route.server === undefined ? 'Vercel' : route.server)
                : null,
        },
        json: async () => {
          if (route.body === undefined) throw new Error('not json')
          return route.body
        },
      } as unknown as Response
    })
  }

  const healthy = { build: { commit: 'a'.repeat(40), vercelEnv: 'production' }, runtime: { vercelEnv: 'production' } }

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('records only the hostnames a redirect actually crosses', async () => {
    vi.stubGlobal(
      'fetch',
      stubFetch({
        'www.example.com': { status: 308, location: 'https://example.com/api/version' },
        'example.com': { status: 200, body: healthy },
      })
    )
    const result = await observe('www.example.com')
    expect(result.transport).toBe('ok')
    expect(result.status).toBe(200)
    expect(result.chain).toEqual(['www.example.com', 'example.com'])
  })

  it('records a hop that leaves the brand, so the decision can see it', async () => {
    vi.stubGlobal(
      'fetch',
      stubFetch({
        'example.com': { status: 301, location: 'https://shops.myshopify.com/' },
        'shops.myshopify.com': { status: 200, body: healthy },
      })
    )
    const result = await observe('example.com')
    expect(result.chain?.[result.chain.length - 1]).toBe('shops.myshopify.com')
  })

  it('refuses to attribute a bare 403 to the origin', async () => {
    // The regression test for the defect found by running the probe: this sandbox's proxy
    // answers blocked hosts with a 403 and no `server` header, and the first version
    // reported five confident findings about a domain it had never reached.
    vi.stubGlobal('fetch', stubFetch({ 'example.com': { status: 403, server: null } }))
    const result = await observe('example.com')
    expect(result.transport).toBe('unreachable')
    expect(result.detail).toMatch(/did not demonstrably reach the origin/i)
  })

  it('still reports a 403 that identifies its server', async () => {
    vi.stubGlobal('fetch', stubFetch({ 'example.com': { status: 403, server: 'Vercel' } }))
    const result = await observe('example.com')
    expect(result.transport).toBe('ok')
    expect(result.status).toBe(403)
  })

  it('reports an unparseable body rather than inventing one', async () => {
    vi.stubGlobal('fetch', stubFetch({ 'example.com': { status: 200 } }))
    const result = await observe('example.com')
    expect(result.transport).toBe('ok')
    expect(result.version).toBeNull()
  })

  it('classifies a name that does not resolve as an answer, not a failure to answer', async () => {
    vi.stubGlobal('fetch', stubFetch({}))
    const result = await observe('example.com')
    expect(result.transport).toBe('not-resolved')
  })

  it('stops walking rather than following a redirect loop forever', async () => {
    vi.stubGlobal(
      'fetch',
      stubFetch({
        'a.example.com': { status: 302, location: 'https://b.example.com/' },
        'b.example.com': { status: 302, location: 'https://a.example.com/' },
      })
    )
    const result = await observe('a.example.com')
    // Bounded: the walk gives up instead of hanging, and says so with a status no origin
    // would send, so the decision reports `not-ok` rather than silently passing.
    expect(result.transport).toBe('ok')
    expect(result.status).toBe(310)
    expect(MAX_REDIRECTS).toBeLessThanOrEqual(5)
  })
})

describe('domainIssuePlan — what the audit does with a verdict', () => {
  const runUrl = 'https://github.com/o/r/actions/runs/1'
  const drifted = {
    state: 'drifted',
    summary: 'healthyjewellery.com: 2 problems with the production domain binding.',
    action: 'Vercel -> Settings -> Domains.',
    findings: [{ code: 'not-production', detail: 'serving a preview' }],
  }

  it('opens one issue when nothing is open', () => {
    const plan = domainIssuePlan({ probe: drifted, openIssues: [], runUrl })
    expect(plan.create).toBe(true)
    expect(plan.update).toBeNull()
    expect(plan.body).toContain('not-production')
    expect(plan.body).toContain(runUrl)
  })

  it('rewrites the existing issue in place rather than commenting on it', () => {
    // ADR 011: issue #24 took 111 identical comments and taught everyone to mute it.
    const plan = domainIssuePlan({ probe: drifted, openIssues: [{ number: 7 }], runUrl })
    expect(plan.update).toBe(7)
    expect(plan.create).toBe(false)
    expect(plan.close).toEqual([])
  })

  it('closes the issue once the domain is bound again', () => {
    const plan = domainIssuePlan({
      probe: { state: 'bound', summary: 'healthyjewellery.com is bound.' },
      openIssues: [{ number: 7 }, { number: 9 }],
      runUrl,
    })
    expect(plan.close).toEqual([7, 9])
    expect(plan.closeComment).toContain('bound')
    expect(plan.create).toBe(false)
  })

  it('does nothing at all when the probe could not look', () => {
    // The load-bearing case. A runner with no public-web egress must not file an issue
    // saying the domain broke — and must not close a standing one either, because being
    // unable to look is not evidence the problem went away.
    const plan = domainIssuePlan({
      probe: { state: 'unevaluable', summary: 'no host answered' },
      openIssues: [{ number: 7 }],
      runUrl,
    })
    expect(plan).toEqual({ close: [], closeComment: '', update: null, create: false, body: '' })
  })

  it('does nothing when there is no verdict file to read', () => {
    expect(domainIssuePlan({ probe: null, openIssues: [{ number: 7 }], runUrl }).create).toBe(false)
    expect(domainIssuePlan({ probe: {}, openIssues: [], runUrl }).create).toBe(false)
  })
})

describe('the audit workflow reaches the decision it claims to', () => {
  it('imports the module by the path that exists, under the label it filters on', () => {
    // A typo in either would surface only in a scheduled job, six hours after the push
    // that caused it, with the step reporting success. Same reason
    // escalation-decision.test.ts pins production-smoke.yml's import.
    const workflow = readFileSync(
      path.resolve(import.meta.dirname, '../../../.github/workflows/control-audit.yml'),
      'utf8'
    )
    expect(workflow).toContain('scripts/lib/canonical-domain.mjs')
    expect(workflow).toContain('node scripts/probe-canonical-domain.mjs')
    expect(workflow).toContain('domainIssuePlan')
    expect(DOMAIN_ISSUE_LABEL).toBe('domain-unbound')
    expect(
      existsSync(path.resolve(import.meta.dirname, '../../../scripts/lib/canonical-domain.mjs'))
    ).toBe(true)
  })
})
