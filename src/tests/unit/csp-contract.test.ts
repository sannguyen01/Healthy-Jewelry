import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const { forbiddenRowFor, hostOfCspSource, parseEgress } = await import('../../../scripts/lib/egress.mjs')

/**
 * **The Content-Security-Policy, read back from `next.config.ts` and held to contract §12.**
 *
 * The header is one long string, and every weakening of it is a one-token diff that reads
 * as a fix: `'unsafe-eval'` added because a library asked for it, a vendor host added to
 * `connect-src` because a widget needed it, `https:` added to `img-src` because a
 * photograph would not load. None of those breaks a page. Each of them re-opens a door the
 * decommission closed, and the E2E fixture would only notice if a page happened to use the
 * door during a test.
 *
 * So this reads the header the way Next does — by calling `headers()` from the config —
 * and asserts it source by source. `connect-src` is pinned exactly, because it is the
 * egress rule. Every other source must be a keyword or a scheme §12 approves for the
 * browser, which makes the contract the only place a new origin can be granted: a host
 * added here without a §12 row fails, and a §13 host fails whatever §12 says.
 *
 * This file covers the **declared** policy. Whether any page violates it is the browser
 * fixture's question (`e2e/support/test.ts`), asked on every E2E test.
 */

const ROOT = path.resolve(import.meta.dirname, '../../..')
const egress = parseEgress(readFileSync(path.join(ROOT, 'COMMERCE-ELIMINATION-CONTRACT.md'), 'utf8'))

const nextConfig = (await import('../../../next.config')).default as {
  headers: () => Promise<{ source: string; headers: { key: string; value: string }[] }[]>
}
const rules = await nextConfig.headers()

/** A CSP string as directive → sources, rejecting a directive stated twice. */
function parseCsp(value: string): Map<string, string[]> {
  const out = new Map<string, string[]>()
  for (const part of value.split(';').map((p) => p.trim()).filter(Boolean)) {
    const [directive, ...sources] = part.split(/\s+/)
    if (out.has(directive.toLowerCase())) throw new Error(`${directive} is declared twice`)
    out.set(directive.toLowerCase(), sources)
  }
  return out
}

const cspHeaders = rules.flatMap((rule) =>
  rule.headers
    .filter((h) => h.key.toLowerCase() === 'content-security-policy')
    .map((h) => ({ source: rule.source, value: h.value }))
)
const csp = parseCsp(cspHeaders[0]?.value ?? '')

/** Keywords a directive may carry, per directive; anything else must be a §12 scheme. */
const KEYWORDS: Record<string, string[]> = {
  'script-src': ["'self'", "'unsafe-inline'"],
  'style-src': ["'self'", "'unsafe-inline'"],
}
const BROWSER_SCHEMES = new Set<string>(
  egress.allowed
    .filter((r) => r.side === 'browser' && r.kind === 'scheme')
    .map((r) => String(r.scheme))
)

describe('there is exactly one policy, on every route', () => {
  it('is declared once, for /(.*)', () => {
    expect(cspHeaders).toHaveLength(1)
    expect(cspHeaders[0].source).toBe('/(.*)')
  })

  it('parses into the directives this file expects', () => {
    // A policy that parsed to nothing would make every assertion below vacuous.
    expect(csp.size).toBeGreaterThanOrEqual(8)
  })

  it('is exactly the reviewed policy, byte for byte', () => {
    // The per-source rules below say what may never appear; this says what the reviewed
    // header *is*. Without it, a directive could be dropped — `object-src` deleted, say,
    // falling back to `default-src 'self'` and so still "passing" every source rule — and
    // nothing would notice, because an absent directive carries no source to reject.
    expect(cspHeaders[0]?.value).toBe(
      "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; " +
        "img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; " +
        "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'"
    )
  })
})

describe('the egress rule', () => {
  it("connect-src is exactly 'self'", () => {
    expect(csp.get('connect-src')).toEqual(["'self'"])
  })

  it("default-src is exactly 'self', so an unlisted directive falls back to the site", () => {
    expect(csp.get('default-src')).toEqual(["'self'"])
  })

  it('names no §13 host in any directive', () => {
    const hits: string[] = []
    for (const [directive, sources] of csp) {
      for (const source of sources) {
        const host = hostOfCspSource(source)
        if (host && forbiddenRowFor(host, egress.forbidden)) hits.push(`${directive} ${source}`)
      }
    }
    expect(hits).toEqual([])
  })

  it('grants no source §12 does not approve for the browser', () => {
    // No host at all, no wildcard, no bare `https:` — each of which approves an origin the
    // contract never reviewed. A scheme is allowed only if §12 lists it for the browser.
    const unapproved: string[] = []
    for (const [directive, sources] of csp) {
      for (const source of sources) {
        const keyword = source.startsWith("'")
        const allowedKeyword =
          source === "'self'" || source === "'none'" || (KEYWORDS[directive] ?? []).includes(source)
        if (keyword ? !allowedKeyword : !BROWSER_SCHEMES.has(source)) unapproved.push(`${directive} ${source}`)
      }
    }
    expect(unapproved).toEqual([])
  })
})

describe('the hardening directives', () => {
  it("script-src carries no 'unsafe-eval' and no 'wasm-unsafe-eval'", () => {
    expect(csp.get('script-src')).not.toContain("'unsafe-eval'")
    expect(csp.get('script-src')).not.toContain("'wasm-unsafe-eval'")
  })

  it.each([
    ['object-src', ["'none'"]],
    ['frame-ancestors', ["'none'"]],
    ['base-uri', ["'self'"]],
    ['form-action', ["'self'"]],
  ])('%s is %j', (directive, sources) => {
    expect(csp.get(directive)).toEqual(sources)
  })

  it('does not upgrade insecure requests, which would break the http E2E server', () => {
    expect(csp.has('upgrade-insecure-requests')).toBe(false)
  })
})

describe('the rule, on policies with known answers', () => {
  it('refuses a directive stated twice — the browser would honour only the first', () => {
    expect(() => parseCsp("connect-src 'self'; connect-src *")).toThrow(/twice/)
  })

  it('finds a forbidden host however the source is spelled', () => {
    const host = egress.forbidden[0].host
    for (const source of [`https://${host}`, `*.${host}`, `https://cdn.${host}:443`]) {
      expect(forbiddenRowFor(hostOfCspSource(source), egress.forbidden), source).not.toBeNull()
    }
  })
})
