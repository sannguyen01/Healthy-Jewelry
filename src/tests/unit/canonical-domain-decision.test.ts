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

import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
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

const APEX = 'healthyjewellery.com'
const WWW = `www.${APEX}`
const COMMIT = 'a'.repeat(40)

/** A healthy observation, with an escape hatch for the one field a test is about. */
function ok(host: string, over: Record<string, unknown> = {}) {
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
