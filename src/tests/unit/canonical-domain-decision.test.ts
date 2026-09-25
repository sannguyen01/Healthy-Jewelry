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
  CANONICAL_FINDINGS,
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
  redirectStatus?: number | null
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

  it('notices the apex handing its traffic to www', () => {
    // **The state of the live domain on 2026-09-20, and the one this probe could not
    // describe.** Both hostnames served the right commit in production; the apex answered
    // 307 and pointed at www. The only finding the probe could produce was about www.
    const verdict = decideCanonicalDomain({
      observations: [ok(APEX, { status: 307, chain: [APEX, WWW] }), ok(WWW)],
      apexHost: APEX,
      expectedCommit: COMMIT,
    })

    expect(codes(verdict)).toContain('apex-redirected')
    expect(verdict.state).toBe('drifted')
  })

  it('does not also blame www when the apex is the one redirecting', () => {
    // The two cannot both be acted on: www cannot redirect to a host that redirects to
    // www. Reporting both gives a reader two instructions that contradict each other.
    const verdict = decideCanonicalDomain({
      observations: [ok(APEX, { status: 307, chain: [APEX, WWW] }), ok(WWW)],
      apexHost: APEX,
      expectedCommit: COMMIT,
    })

    expect(codes(verdict)).not.toContain('www-not-redirected')
  })

  it('tells a reader which hostname to change, and in which direction', () => {
    // The generic action line said "www redirecting permanently to the apex", which reads
    // as a description of the setting that is already wrong in the other direction.
    const { action } = decideCanonicalDomain({
      observations: [ok(APEX, { status: 307, chain: [APEX, WWW] }), ok(WWW)],
      apexHost: APEX,
      expectedCommit: COMMIT,
    })

    expect(action).toContain(`Clear the redirect on ${APEX}`)
    expect(action).toContain('308')
  })

  it('still blames www when the apex serves its own content', () => {
    // The suppression above must be conditional on the apex redirecting, not general.
    const verdict = decideCanonicalDomain({
      observations: [ok(APEX), ok(WWW)],
      apexHost: APEX,
    })

    expect(codes(verdict)).toContain('www-not-redirected')
    expect(codes(verdict)).not.toContain('apex-redirected')
  })

  it('prefers off-domain-redirect when the apex leaves the brand', () => {
    // An apex pointing at a host that is not under test is a different and worse fact
    // than an apex pointing at www, and the two must not be confused.
    const verdict = decideCanonicalDomain({
      observations: [ok(APEX, { status: 307, chain: [APEX, 'shops.myshopify.com'] }), ok(WWW)],
      apexHost: APEX,
    })

    expect(codes(verdict)).toContain('off-domain-redirect')
    expect(codes(verdict)).not.toContain('apex-redirected')
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

describe('the enumeration and the decision agree', () => {
  /**
   * `CANONICAL_FINDINGS` was exported, documented as the list ADR 019 reconciles against
   * prose, and referenced by **nothing** — not by the decision function that emits the
   * codes, not by a test, not by `docs/failure-modes.md`. An enumeration nobody compares
   * to anything is a comment with a type annotation.
   *
   * Both directions, this repository's usual rule: a code the function can emit but the
   * list does not name is an unnamed failure mode; a code the list names but nothing can
   * emit is a failure mode that was removed and left in the documentation.
   */
  const emitted = new Set<string>()
  const record = (v: { findings: { code: string }[] }) => {
    for (const f of v.findings) emitted.add(f.code)
    return v
  }

  // One scenario per code, so the reconciliation below is driven by the real function.
  record(decideCanonicalDomain({ observations: [], apexHost: APEX }))
  record(decideCanonicalDomain({ observations: [ok(WWW)], apexHost: APEX }))
  record(
    decideCanonicalDomain({
      observations: [{ host: APEX, transport: 'not-resolved', detail: 'ENOTFOUND' }],
      apexHost: APEX,
    }),
  )
  record(
    decideCanonicalDomain({
      observations: [ok(APEX), { host: WWW, transport: 'unreachable', detail: 'ETIMEDOUT' }],
      apexHost: APEX,
    }),
  )
  record(decideCanonicalDomain({ observations: [ok(APEX, { status: 500 })], apexHost: APEX }))
  record(decideCanonicalDomain({ observations: [ok(APEX, { server: 'cloudflare' })], apexHost: APEX }))
  record(decideCanonicalDomain({ observations: [ok(APEX, { version: null })], apexHost: APEX }))
  record(
    decideCanonicalDomain({
      observations: [
        ok(APEX, {
          version: { build: { commit: COMMIT, vercelEnv: 'preview' }, runtime: { vercelEnv: 'preview' } },
        }),
      ],
      apexHost: APEX,
    }),
  )
  record(
    decideCanonicalDomain({
      observations: [ok(APEX), ok(WWW, { version: { build: { commit: 'b'.repeat(40), vercelEnv: 'production' }, runtime: { vercelEnv: 'production' } } })],
      apexHost: APEX,
    }),
  )
  record(decideCanonicalDomain({ observations: [ok(APEX)], apexHost: APEX, expectedCommit: 'c'.repeat(40) }))
  record(decideCanonicalDomain({ observations: [ok(APEX, { chain: [APEX, WWW] }), ok(WWW)], apexHost: APEX }))
  record(decideCanonicalDomain({ observations: [ok(APEX, { chain: [APEX, 'elsewhere.example'] })], apexHost: APEX }))

  it('emits something, so the comparison is not trivially satisfied', () => {
    expect(emitted.size).toBeGreaterThan(5)
  })

  it('names every code it can emit', () => {
    for (const code of emitted) {
      expect(CANONICAL_FINDINGS, `${code} is emitted but not enumerated`).toContain(code)
    }
  })

  it('can emit every code it names', () => {
    for (const code of CANONICAL_FINDINGS) {
      expect(emitted, `${code} is enumerated but no scenario produces it`).toContain(code)
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────────────
// "answers 200 and redirects", which is not a thing that can happen
// ─────────────────────────────────────────────────────────────────────────────────────

/**
 * **Found in production, in an issue body a person was meant to act on.**
 *
 * The 2026-09-25 control audit rewrote issue #84 with the new `apex-redirected` finding,
 * and it read: *"healthyjewellery.com answers 200 and redirects to
 * www.healthyjewellery.com"*. A 200 does not redirect.
 *
 * The two halves of that sentence came from different hops. `observe` follows the chain by
 * design — the chain is the evidence — so the `status` it returns is whatever finally
 * answered, which was `www`'s 200. The finding interpolated that while claiming to describe
 * what the apex does. `verify-browse-only.mjs` printed 307 for the same redirect in the same
 * run, from the same runner, thirty seconds apart, because it never follows one and so has
 * only the immediate status to print. Two probes, one site, contradictory numbers.
 *
 * This is the same class of defect the whole 2026-09-21 change set was about: not a control
 * that failed to fire, but one that fired and said something untrue. A reader who believes
 * "answers 200" concludes the apex serves the site and the finding is spurious — the exact
 * wrong conclusion, reached by trusting the tool.
 *
 * `redirectStatus` carries the first hop's status separately, and the guard below refuses
 * any `apex-redirected` detail that names a status outside the 3xx range, so no future
 * refactor can reintroduce the sentence by wiring the wrong field back in.
 */
describe('apex-redirected names the redirect, not the end of the chain', () => {
  const chainToWww = { status: 200, redirectStatus: 307, chain: [APEX, WWW] }

  it('names the status the apex answered with', () => {
    const { findings } = decideCanonicalDomain({
      observations: [ok(APEX, chainToWww), ok(WWW)],
      apexHost: APEX,
      expectedCommit: COMMIT,
    })
    const detail = findings.find((f) => f.code === 'apex-redirected')?.detail ?? ''

    expect(detail).toContain(`${APEX} answers 307`)
    expect(detail).not.toContain('answers 200')
  })

  it('never claims a non-redirect status redirects', () => {
    // The guard on the guard, and the one that would have caught this in review. Whatever
    // the wording becomes, the number in it must be a 3xx.
    for (const redirectStatus of [301, 302, 307, 308]) {
      const { findings } = decideCanonicalDomain({
        observations: [ok(APEX, { status: 200, redirectStatus, chain: [APEX, WWW] }), ok(WWW)],
        apexHost: APEX,
      })
      const detail = findings.find((f) => f.code === 'apex-redirected')?.detail ?? ''

      const named = detail.match(/answers (\d{3})/)?.[1]
      expect(named, `no status named for ${redirectStatus}`).toBeDefined()
      expect(Number(named), `${named} is not a redirect`).toBeGreaterThanOrEqual(300)
      expect(Number(named)).toBeLessThan(400)
    }
  })

  it('says which host a visitor actually reaches', () => {
    // The sentence has to survive being read by someone who has not seen the chain.
    const { findings } = decideCanonicalDomain({
      observations: [ok(APEX, chainToWww), ok(WWW)],
      apexHost: APEX,
    })
    expect(findings.find((f) => f.code === 'apex-redirected')?.detail).toContain(
      `${WWW} is what a visitor actually reaches`,
    )
  })

  it('falls back to the final status rather than printing undefined', () => {
    // An observation from before this field existed, or a hand-built one. A coarse number
    // in an issue body beats `undefined`.
    const { findings } = decideCanonicalDomain({
      observations: [ok(APEX, { status: 307, chain: [APEX, WWW] }), ok(WWW)],
      apexHost: APEX,
    })
    const detail = findings.find((f) => f.code === 'apex-redirected')?.detail ?? ''

    expect(detail).toContain('answers 307')
    expect(detail).not.toContain('undefined')
  })
})

describe('observe records the redirect status alongside the final one', () => {
  function stub(routes: Record<string, { status: number; location?: string; body?: unknown }>) {
    return vi.fn(async (url: string | URL) => {
      const { hostname } = new URL(String(url))
      const route = routes[hostname]
      if (!route) throw new Error('unrouted host')
      return {
        status: route.status,
        headers: {
          get: (name: string) =>
            name.toLowerCase() === 'location' ? (route.location ?? null) : 'Vercel',
        },
        json: async () => {
          if (route.body === undefined) throw new Error('not json')
          return route.body
        },
      } as unknown as Response
    })
  }

  const healthy = {
    build: { commit: COMMIT, vercelEnv: 'production' },
    runtime: { vercelEnv: 'production' },
  }

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('keeps the first hop’s status while still following the chain', async () => {
    vi.stubGlobal(
      'fetch',
      stub({
        [APEX]: { status: 307, location: `https://${WWW}/api/version` },
        [WWW]: { status: 200, body: healthy },
      }),
    )

    const observation = await observe(APEX)

    // Both numbers, each meaning what it says.
    expect(observation.redirectStatus).toBe(307)
    expect(observation.status).toBe(200)
    expect(observation.chain).toEqual([APEX, WWW])
  })

  it('reports null when nothing redirected', async () => {
    // Not 200, and not absent: a host that served directly has no redirect status, and
    // null is how the decision knows to fall back rather than print a wrong number.
    vi.stubGlobal('fetch', stub({ [APEX]: { status: 200, body: healthy } }))

    expect((await observe(APEX)).redirectStatus).toBeNull()
  })

  it('keeps the first status when a chain redirects twice', async () => {
    // 307 then 308 is one policy to a reader. The status that matters is the one the
    // canonical host itself answers with.
    vi.stubGlobal(
      'fetch',
      stub({
        [APEX]: { status: 307, location: `https://${WWW}/api/version` },
        [WWW]: { status: 308, location: `https://${APEX}/api/version` },
      }),
    )

    expect((await observe(APEX)).redirectStatus).toBe(307)
  })

  it('carries it through the unparseable-Location bail-out', async () => {
    // That branch returns early, and an early return that drops a field is how the
    // original defect would come back.
    vi.stubGlobal(
      'fetch',
      stub({
        [APEX]: { status: 307, location: `https://${WWW}/api/version` },
        [WWW]: { status: 302, location: 'http://' },
      }),
    )

    const observation = await observe(APEX)
    expect(observation.redirectStatus).toBe(307)
  })
})
