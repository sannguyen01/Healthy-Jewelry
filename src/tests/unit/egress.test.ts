import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '../../..')

const {
  compileOriginPattern,
  forbiddenRowFor,
  formatEgressFindings,
  hostOfCspSource,
  judgeEgress,
  parseEgress,
} = await import('../../../scripts/lib/egress.mjs')

/**
 * **The egress judge, pointed at answers that are already known.**
 *
 * `scripts/lib/egress.mjs` decides, for the browser fixture in `e2e/support/test.ts` and
 * the server harness in `server-egress.test.ts`, whether a recorded URL was allowed to
 * leave. Both of those harnesses can only ever show it the traffic the site happens to
 * make today — which, if the site is correct, is traffic that should all pass. A judge
 * only ever shown passing input has never been observed to fail
 * ([ADR 024](../../../docs/adr/024-a-tool-never-pointed-at-a-known-answer.md)).
 *
 * So the fixtures here are synthetic and deliberately hostile: a forbidden host under a
 * subdomain, a lookalike glued to the front of one, an approved host on the wrong port,
 * an approved wildcard asked about its own apex, and a row that is both approved and
 * forbidden. Every hostname is under `.example` or `.test`, which no real vendor owns, so
 * this file needs no exemption from the commerce contract to say what it means.
 */

/** A contract carrying only the two sections this module reads. */
function contractWith(allowedRows: string[], forbiddenRows: string[]): string {
  return [
    '<!-- contract:egress-allowed -->',
    '| Origin pattern | Side | Why |',
    '|---|---|---|',
    ...allowedRows,
    '<!-- /contract:egress-allowed -->',
    '',
    '<!-- contract:egress-forbidden -->',
    '| Host pattern | Why |',
    '|---|---|',
    ...forbiddenRows,
    '<!-- /contract:egress-forbidden -->',
  ].join('\n')
}

const FIXTURE = contractWith(
  [
    '| `self` | browser | the site itself |',
    '| `data:` | browser | inline bytes |',
    '| `blob:` | browser | object URLs |',
    '| `about:` | browser | the empty document |',
    '| `https://mail.example` | server | delivery |',
    '| `https://*.limits.example` | server | per-database subdomains |',
    // Approved *and* forbidden — the forbidden row must win.
    '| `https://*.pay.example` | server | a row wider than it should be |',
  ],
  [
    '| `store.example` | the retired vendor |',
    '| `checkout.site.test` | the retired checkout hostname |',
    '| `pay.example` | a payment vendor |',
  ]
)

const policy = parseEgress(FIXTURE)
const SITE = 'http://localhost:3000'

const codes = (urls: string[], side: 'browser' | 'server' = 'browser') =>
  judgeEgress(urls, { siteOrigin: SITE, ...policy, side }).map(
    (f: { code: string; origin: string }) => `${f.code} ${f.origin}`
  )

describe('parseEgress reads both sections and refuses to read nothing', () => {
  it('parses every row', () => {
    expect(policy.allowed).toHaveLength(7)
    expect(policy.forbidden.map((r: { host: string }) => r.host)).toEqual([
      'store.example',
      'checkout.site.test',
      'pay.example',
    ])
  })

  it('throws on a missing section rather than returning an empty list', () => {
    expect(() => parseEgress('no anchors here')).toThrow(/egress-allowed/)
  })

  it('throws when one side approves nothing', () => {
    // An empty browser allowlist makes every same-origin request a finding, the check goes
    // red on everything, and a check red on everything is a check somebody switches off.
    const serverOnly = contractWith(['| `https://mail.example` | server | x |'], ['| `store.example` | x |'])
    expect(() => parseEgress(serverOnly)).toThrow(/browser side/)
  })

  it('throws on an unknown side', () => {
    const typo = contractWith(['| `self` | browsr | x |'], ['| `store.example` | x |'])
    expect(() => parseEgress(typo)).toThrow(/browsr/)
  })

  it('throws on an empty denylist', () => {
    const none = contractWith(['| `self` | browser | x |', '| `https://mail.example` | server | x |'], [])
    expect(() => parseEgress(none)).toThrow(/§13 forbids no host/)
  })

  it('refuses a §13 pattern with a scheme or wildcard in it', () => {
    // A §13 row already covers every subdomain, so a wildcard there is either redundant or
    // a sign the author thought it was a glob — and `https://` would make it match nothing.
    for (const bad of ['`https://store.example`', '`*.store.example`', '`store`']) {
      const doc = contractWith(['| `self` | browser | x |', '| `https://mail.example` | server | x |'], [`| ${bad} | x |`])
      expect(() => parseEgress(doc), bad).toThrow(/not a bare hostname/)
    }
  })

  it('refuses an origin pattern outside the four shapes', () => {
    for (const bad of ['https://mail.example/path', '*.mail.example', 'https://mail.*.example', 'ftp://x.example', 'https://x']) {
      expect(() => compileOriginPattern(bad), bad).toThrow()
    }
  })
})

describe('judgeEgress on the browser side', () => {
  it('passes the site itself and the non-network schemes', () => {
    expect(
      codes([
        `${SITE}/`,
        `${SITE}/_next/static/chunks/app.js`,
        `${SITE}/api/analytics`,
        'data:image/svg+xml;base64,AAAA',
        'blob:http://localhost:3000/5b1c',
        'about:blank',
      ])
    ).toEqual([])
  })

  it('refuses a server-side approval in the browser', () => {
    // The delivery API is approved for the server. A browser calling it directly would be
    // an API key in a client bundle, which is exactly the finding this must produce.
    expect(codes(['https://mail.example/emails'])).toEqual(['unapproved-origin https://mail.example'])
  })

  it('refuses the site on another port or scheme', () => {
    expect(codes(['http://localhost:3001/', 'https://localhost:3000/'])).toEqual([
      'unapproved-origin http://localhost:3001',
      'unapproved-origin https://localhost:3000',
    ])
  })

  it('names a forbidden host, its subdomains, and upper-case spellings', () => {
    expect(
      codes(['https://store.example/cart.js', 'https://cdn.store.example/x.png', 'https://CDN.Store.Example/y'])
    ).toEqual([
      'forbidden-origin https://store.example',
      'forbidden-origin https://cdn.store.example',
    ])
  })

  it('does not call a lookalike forbidden — it is merely unapproved', () => {
    // Label boundary: `evilstore.example` is somebody else's domain. Still refused, by §12.
    expect(codes(['https://evilstore.example/', 'https://store.example.attacker.test/'])).toEqual([
      'unapproved-origin https://evilstore.example',
      'unapproved-origin https://store.example.attacker.test',
    ])
  })

  it('counts repeats as one finding with a count and keeps the first example', () => {
    const findings = judgeEgress(
      ['https://store.example/a', 'https://store.example/b', 'https://store.example/c'],
      { siteOrigin: SITE, ...policy }
    )
    expect(findings).toEqual([
      {
        code: 'forbidden-origin',
        origin: 'https://store.example',
        count: 3,
        example: 'https://store.example/a',
        rule: 'store.example',
      },
    ])
  })

  it('fails closed on a string the URL parser refuses', () => {
    expect(codes(['not a url'])).toEqual(['unparseable-url not a url'])
  })

  it('refuses to judge the browser side without a site origin', () => {
    expect(() => judgeEgress([`${SITE}/`], { ...policy })).toThrow(/site origin/)
  })
})

describe('judgeEgress on the server side', () => {
  it('passes the exact approved host and any subdomain of an approved wildcard', () => {
    expect(
      codes(['https://mail.example/emails', 'https://eu1-quiet-owl.limits.example/pipeline'], 'server')
    ).toEqual([])
  })

  it('does not stretch a wildcard to its own apex', () => {
    expect(codes(['https://limits.example/'], 'server')).toEqual(['unapproved-origin https://limits.example'])
  })

  it('does not approve an approved host on a non-default port or over http', () => {
    expect(codes(['https://mail.example:8443/', 'http://mail.example/'], 'server')).toEqual([
      'unapproved-origin https://mail.example:8443',
      'unapproved-origin http://mail.example',
    ])
  })

  it('lets §13 outrank a §12 row that is wider than it should be', () => {
    // `https://*.pay.example` is approved in the fixture; `api.pay.example` sits under both.
    // Forbidden wins, or a broad approval could reopen a closed vendor by being broad.
    expect(codes(['https://api.pay.example/charges'], 'server')).toEqual([
      'forbidden-origin https://api.pay.example',
    ])
  })

  it('treats `self` as a browser-only approval', () => {
    // A route handler calling its own deployment over HTTP is a loop, not a dependency.
    expect(codes([`${SITE}/api/health`], 'server')).toEqual(['unapproved-origin http://localhost:3000'])
  })
})

describe('forbiddenRowFor', () => {
  it('matches on a label boundary, case-insensitively, ignoring a trailing dot', () => {
    expect(forbiddenRowFor('checkout.site.test', policy.forbidden)?.host).toBe('checkout.site.test')
    expect(forbiddenRowFor('A.Checkout.Site.Test.', policy.forbidden)?.host).toBe('checkout.site.test')
    expect(forbiddenRowFor('site.test', policy.forbidden)).toBeNull()
    expect(forbiddenRowFor('mycheckout.site.test', policy.forbidden)).toBeNull()
    expect(forbiddenRowFor('', policy.forbidden)).toBeNull()
  })
})

describe('hostOfCspSource', () => {
  it('reduces every host-bearing source expression to its host', () => {
    expect(hostOfCspSource('https://cdn.store.example')).toBe('cdn.store.example')
    expect(hostOfCspSource('*.store.example')).toBe('store.example')
    expect(hostOfCspSource('https://*.store.example:443/path')).toBe('store.example')
    expect(hostOfCspSource('wss://live.store.example')).toBe('live.store.example')
    expect(hostOfCspSource('store.example')).toBe('store.example')
  })

  it('returns null for keywords and scheme sources', () => {
    for (const t of ["'self'", "'none'", "'unsafe-inline'", 'data:', 'blob:', 'https:']) {
      expect(hostOfCspSource(t), t).toBeNull()
    }
  })
})

describe('the real contract: §12 and §13 as this repository declares them', () => {
  /*
   * The fixtures above prove the judge; these prove the document it is handed is shaped
   * the way the two harnesses assume. Read, not copied: a list duplicated here would be a
   * second allowlist, and the reason `egress.mjs` exists is that there should be one.
   */
  const real = parseEgress(readFileSync(path.join(ROOT, 'COMMERCE-ELIMINATION-CONTRACT.md'), 'utf8'))

  it('parses, with rows on both sides and a non-empty denylist', () => {
    expect(real.allowed.filter((r: { side: string }) => r.side === 'browser').length).toBeGreaterThan(0)
    expect(real.allowed.filter((r: { side: string }) => r.side === 'server').length).toBeGreaterThan(0)
    expect(real.forbidden.length).toBeGreaterThan(10)
  })

  it('approves no third-party host for the browser', () => {
    // The design, not a coincidence of today's table: the browser talks to the site and to
    // nothing else, so a browser-side row naming a host is a design change and must fail
    // here until somebody deletes this assertion on purpose.
    const hostRows = real.allowed.filter(
      (r: { side: string; kind: string }) => r.side === 'browser' && r.kind !== 'self' && r.kind !== 'scheme'
    )
    expect(hostRows).toEqual([])
  })

  it('approves server hosts over https only', () => {
    for (const row of real.allowed.filter((r: { side: string; kind: string }) => r.side === 'server')) {
      expect(row.scheme, row.pattern).toBe('https:')
    }
  })

  it('forbids nothing it also approves', () => {
    // §13 outranks §12, so an overlap would be silently resolved in the safe direction —
    // and an approval nothing can ever use is an entry that misleads its reader.
    for (const row of real.allowed.filter((r: { host?: string }) => r.host)) {
      const probe = row.kind === 'subdomains' ? `x.${row.host}` : row.host
      expect(forbiddenRowFor(probe, real.forbidden), row.pattern).toBeNull()
    }
  })
})

describe('formatEgressFindings', () => {
  it('names the rule, the side and the count', () => {
    const lines = formatEgressFindings(
      judgeEgress(['https://store.example/a', 'https://other.test/'], { siteOrigin: SITE, ...policy }),
      'browser'
    )
    expect(lines[0]).toMatch(/forbidden by §13 \(store\.example\); 1 request/)
    expect(lines[1]).toMatch(/not approved by §12 for the browser side/)
  })
})
