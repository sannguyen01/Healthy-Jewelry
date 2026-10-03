import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const {
  classifyDiscrepancy,
  observeHosts,
  detectBody,
  nextHop,
  pickHeaders,
  probePaths,
  renderSummary,
  requestShowsCommerce,
  retiredPaths,
  UNKNOWN_PRODUCT_PATH,
  MAX_REDIRECTS,
} = await import('../../../scripts/lib/live-surface.mjs')
const { fetchChain, firstHandle } = await import('../../../scripts/probe-live-surface.mjs')
const { FORBIDDEN_HOST_PATTERN, UNKNOWN_HANDLE, VENDOR_DOMAINS } = await import('../../../scripts/lib/browse-only.mjs')
const { parseContract } = await import('../../../scripts/lib/commerce-contract.mjs')
const { forbiddenHostPattern, parseEgress } = await import('../../../scripts/lib/egress.mjs')

/** The real contract, as the probe reads it: §7 for the paths, §13 for the hosts. */
const CONTRACT = readFileSync(path.resolve(import.meta.dirname, '../../../COMMERCE-ELIMINATION-CONTRACT.md'), 'utf8')
const ROUTES_FORBIDDEN: { route: string }[] = parseContract(CONTRACT).routesForbidden
const FORBIDDEN = parseEgress(CONTRACT).forbidden as { host: string }[]
const HOSTS = forbiddenHostPattern(FORBIDDEN)

/**
 * **Where in the chain commerce appears, pointed at known answers.**
 *
 * A retrieval of the live site reportedly showed prices the repository cannot produce. Which
 * of four explanations holds decides whose console the fix is in, and each is a fixture here
 * (ADR 024) — the live probe itself cannot reach production from this sandbox, and would only
 * ever demonstrate whichever state production happens to be in.
 */

const APEX = 'healthyjewellery.com'
const html = (inner: string) => `<!doctype html><html><body>${inner}</body></html>`

describe('detectBody — the detectors, on the historical defect and on clean pages', () => {
  it.each([
    ['1.450.000₫', html('<p>Arc Band</p><p>1.450.000₫</p>')],
    ['Dome Ring · 112.00 — the live defect STATE.md records', html('<h3>Dome Ring</h3> · <span>112.00</span>')],
  ])('sees a visible price: %s', (_label, body) => {
    const result = detectBody(body, HOSTS)
    expect(result.visiblePrice.length).toBeGreaterThan(0)
    expect(result.commerce).toBe(true)
  })

  it('sees an Offer in JSON-LD', () => {
    const result = detectBody(html('<script type="application/ld+json">{"@type":"Offer","price":"1"}</script>'), HOSTS)
    expect(result.jsonLd).toEqual(expect.arrayContaining(['offer-jsonld', 'price-jsonld']))
    expect(result.commerce).toBe(true)
  })

  it('sees a §13 host the vendor-only pattern it replaced was blind to', () => {
    // The probe once matched four vendor domains while §13 forbids payment, wallet and tax
    // hosts too; a live page loading one of those read as `clean`.
    const unseen = FORBIDDEN.find((r) => !new RegExp(FORBIDDEN_HOST_PATTERN.source, 'i').test(r.host))
    expect(unseen, '§13 has no host outside the vendor pattern, so this case proves nothing').toBeDefined()
    const result = detectBody(html(`<script src="https://${unseen!.host}/v3"></script>`), HOSTS)
    expect(result.vendorHosts).toEqual([unseen!.host])
    expect(result.commerce).toBe(true)
  })

  it('refuses to run without the §13 pattern, rather than seeing no host at all', () => {
    expect(() => detectBody(html('<p>x</p>'), undefined as unknown as RegExp)).toThrow(/§13 host pattern/)
    expect(() => detectBody(html('<p>x</p>'), /x/)).toThrow(/§13 host pattern/)
  })

  it('sees the vendor host', () => {
    const result = detectBody(html(`<img src="https://cdn.${VENDOR_DOMAINS[1]}/s/x.jpg">`), HOSTS)
    expect(result.vendorHosts).toEqual([`cdn.${VENDOR_DOMAINS[1]}`])
    expect(result.commerce).toBe(true)
  })

  it.each([
    ['an Add to Bag button', '<button type="button">Add to Bag</button>'],
    ['a checkout link', '<a href="/checkout">Checkout</a>'],
    ['a buy-now button', '<button>Buy now</button>'],
    ['a form posting to a cart', '<form action="/cart/add" method="post"></form>'],
    ['the removed test id', '<div data-testid="add-to-bag"></div>'],
  ])('sees a purchase control: %s', (_label, inner) => {
    expect(detectBody(html(inner), HOSTS).purchaseControls.length).toBeGreaterThan(0)
  })

  it('does not call prose about the absence of a checkout a control', () => {
    const result = detectBody(html('<p>There is no checkout on this site. Ask an ambassador.</p>'), HOSTS)
    expect(result.purchaseControls).toEqual([])
    expect(result.commerce).toBe(false)
  })

  it('records purchase-era copy as an observation that never makes a page commerce', () => {
    // Present in source today pending legal review; a failure here would be red on text
    // nobody in CI may change.
    const result = detectBody(html('<p>Free shipping worldwide. 30-day returns and a full refund. Dispatched in a day. Lifetime warranty.</p>'), HOSTS)
    expect(result.purchaseEraCopy).toEqual(['free-shipping', 'returns', 'refund', 'dispatch', 'warranty'])
    expect(result.commerce).toBe(false)
  })

  it('is clean on a clean page', () => {
    const result = detectBody(html('<h1>Grade 23 titanium</h1><p>Ti-6Al-4V ELI, 1.60 mm band.</p>'), HOSTS)
    expect(result).toMatchObject({ visiblePrice: [], jsonLd: [], vendorHosts: [], purchaseControls: [], commerce: false })
  })
})

describe('requestShowsCommerce', () => {
  it('a retired path answering 2xx is commerce whatever its body says', () => {
    expect(requestShowsCommerce({ kind: 'retired', status: 200, detectors: { commerce: false } })).toBe(true)
  })

  it.each([308, 404, 410])('a retired path answering %s is the retirement working', (status) => {
    expect(requestShowsCommerce({ kind: 'retired', status, detectors: { commerce: false } })).toBe(false)
  })

  it('a retired path that redirects is judged by its own answer, not by where the redirect lands', async () => {
    // The shape the probe records: `fetchChain` follows `/cart` -> 308 -> `/shop` and ends on
    // `/shop`'s 200. Judged on that final status, eleven §7 rows read as live commerce on a
    // healthy site and every audit blamed the deployed commit.
    const fake = async (url: string) =>
      new URL(url).pathname === '/cart'
        ? new Response(null, { status: 308, headers: { location: '/shop' } })
        : new Response(html('<h1>Shop</h1>'), { status: 200 })
    const answer = await fetchChain(`https://${APEX}/cart`, fake)
    expect(answer.chain.map((h: { status: number }) => h.status)).toEqual([308, 200])
    expect(answer.transport).toBe('ok')
    const record = { kind: 'retired', status: answer.status ?? 0, chain: answer.chain, detectors: detectBody(answer.body ?? '', HOSTS) }
    expect(requestShowsCommerce(record)).toBe(false)

    expect(requestShowsCommerce({ kind: 'retired', status: 200, chain: [{ status: 200 }], detectors: null })).toBe(true)
  })

  it('a public page is commerce only when a blocking detector fired', () => {
    expect(requestShowsCommerce({ kind: 'public', status: 200, detectors: { commerce: true } })).toBe(true)
    expect(requestShowsCommerce({ kind: 'public', status: 200, detectors: null })).toBe(false)
  })
})

type Role = 'apex' | 'www' | 'deployment' | 'preview'
type Host = {
  role: Role
  host: string
  reachable: boolean
  protected?: boolean
  commit: string | null
  commerce: boolean
  digests: Record<string, string>
  warmDigests?: Record<string, string>
  truncatedPaths?: string[]
  coldCache?: Record<string, string>
  firstHop?: { status: number; location: string | null } | null
}
const host = (role: Role, name: string, overrides: Partial<Host> = {}): Host => ({
  role,
  host: name,
  reachable: true,
  commit: 'c0ffee',
  commerce: false,
  digests: { '/': 'aaa', '/shop': 'bbb' },
  ...overrides,
})
const apex = (o: Partial<Host> = {}) => host('apex', APEX, o)
const www = (o: Partial<Host> = {}) => host('www', `www.${APEX}`, o)
const deployment = (o: Partial<Host> = {}) => host('deployment', 'healthy-jewellery-abc.vercel.app', o)

describe("classifyDiscrepancy — the owner's four rules", () => {
  it('only an external retrieval shows commerce → retrieval-or-indexing', () => {
    const result = classifyDiscrepancy({
      externalRetrievalShowsCommerce: true,
      hosts: [apex(), www(), deployment()],
    })
    expect(result.classification).toBe('retrieval-or-indexing')
  })

  it('apex and www on different builds → host-identity-mismatch, before anything is attributed', () => {
    // This fixture read `alias-dns-cdn` until 2026-09-27. Its apex and www report different
    // commits from each other, so a visitor's answer depends on which name they typed — and
    // any attribution after that is about one of two artifacts without saying which.
    const result = classifyDiscrepancy({ hosts: [apex({ commit: 'old1234' }), www(), deployment()] })
    expect(result.classification).toBe('host-identity-mismatch')
    expect(result.observation.identityMismatch).toEqual([
      { host: APEX, commit: 'old1234' },
      { host: `www.${APEX}`, commit: 'c0ffee' },
    ])
  })

  it('both edge hosts on one build that is not the deployment → alias-dns-cdn', () => {
    const result = classifyDiscrepancy({
      hosts: [apex({ commit: 'old1234' }), www({ commit: 'old1234' }), deployment()],
    })
    expect(result.classification).toBe('alias-dns-cdn')
    expect(result.differences).toContainEqual({ host: APEX, kind: 'commit', edge: 'old1234', deployment: 'c0ffee' })
  })

  it('www differs from the deployment by body on the same commit → alias-dns-cdn (a stale CDN variant)', () => {
    const result = classifyDiscrepancy({ hosts: [apex(), www({ digests: { '/': 'zzz' } }), deployment()] })
    expect(result.classification).toBe('alias-dns-cdn')
    expect(result.differences).toContainEqual({ host: `www.${APEX}`, kind: 'digest', path: '/' })
  })

  it('commerce on the edge and not on the deployment → alias-dns-cdn', () => {
    expect(classifyDiscrepancy({ hosts: [apex({ commerce: true }), www(), deployment()] }).classification).toBe(
      'alias-dns-cdn'
    )
  })

  it('apex and deployment both serve commerce → source-build-deploy-chain', () => {
    const result = classifyDiscrepancy({
      hosts: [apex({ commerce: true }), www({ commerce: true }), deployment({ commerce: true })],
    })
    expect(result.classification).toBe('source-build-deploy-chain')
    expect(result.detail).toContain('c0ffee')
  })

  it('outranks an external retrieval: the site itself is serving it', () => {
    const result = classifyDiscrepancy({
      externalRetrievalShowsCommerce: true,
      hosts: [apex({ commerce: true }), deployment({ commerce: true })],
    })
    expect(result.classification).toBe('source-build-deploy-chain')
  })

  it('HTTP clean everywhere → clean, and says what HTTP cannot see', () => {
    const result = classifyDiscrepancy({ hosts: [apex(), www(), deployment()] })
    expect(result.classification).toBe('clean')
    expect(result.note).toMatch(/localStorage|service worker/)
  })

  it('a protected deployment does not stop a clean verdict', () => {
    const result = classifyDiscrepancy({
      hosts: [apex(), www(), deployment({ reachable: false, protected: true, commit: null })],
    })
    expect(result.classification).toBe('clean')
  })

  it('commerce on the edge with the deployment unobservable is unevaluable, not a guess', () => {
    // "Fix the source" and "fix the alias" are different consoles.
    const result = classifyDiscrepancy({
      hosts: [apex({ commerce: true }), deployment({ reachable: false, protected: true })],
    })
    expect(result.classification).toBe('unevaluable')
    expect(result.reason).toBe('edge-commerce-deployment-unobserved')
  })

  it('no edge host observed is unevaluable', () => {
    const result = classifyDiscrepancy({
      externalRetrievalShowsCommerce: true,
      hosts: [apex({ reachable: false }), www({ reachable: false }), deployment()],
    })
    expect(result.classification).toBe('unevaluable')
    expect(result.reason).toBe('no-edge-host-observed')
  })
})

/**
 * **Observation before attribution.** The cases the first classifier got too definite: it read
 * "edge and deployment both show commerce" as "the build carries it" without first asking
 * whether they were the same build.
 */
describe('classifyDiscrepancy — identity is settled before cause', () => {
  it('both serve commerce on DIFFERENT builds → multiple-causes, never source-build-deploy-chain', () => {
    const result = classifyDiscrepancy({
      hosts: [
        apex({ commerce: true, commit: 'old1234' }),
        www({ commerce: true, commit: 'old1234' }),
        deployment({ commerce: true, commit: 'new5678', digests: { '/': 'ddd', '/shop': 'eee' } }),
      ],
    })
    expect(result.classification).toBe('multiple-causes')
    expect(result.reason).toBe('edge-and-deployment-diverge-both-serve-commerce')
    expect(result.observation.agreement).toBe('disagree')
  })

  it('both serve commerce and nothing could be compared → unevaluable, with the deployment commerce kept', () => {
    const result = classifyDiscrepancy({
      hosts: [
        apex({ commerce: true, commit: null, digests: {} }),
        deployment({ commerce: true, commit: null, digests: {} }),
      ],
    })
    expect(result).toMatchObject({ classification: 'unevaluable', reason: 'agreement-unestablished', deploymentCommerce: true })
    expect(result.observation.agreement).toBe('unknown')
  })

  it('agreement by identical bodies alone is enough when no commit is reported', () => {
    const result = classifyDiscrepancy({
      hosts: [apex({ commerce: true, commit: null }), deployment({ commerce: true, commit: null })],
    })
    expect(result.observation.agreement).toBe('agree')
    expect(result.classification).toBe('source-build-deploy-chain')
  })

  it('one host serving one path two ways cold and warm → alias-dns-cdn/cold-warm-variance', () => {
    const result = classifyDiscrepancy({
      hosts: [apex({ warmDigests: { '/': 'aaa', '/shop': 'zzz' } }), www(), deployment()],
    })
    expect(result).toMatchObject({ classification: 'alias-dns-cdn', reason: 'cold-warm-variance' })
    expect(result.observation.cacheVariance).toEqual([{ host: APEX, path: '/shop' }])
  })

  it('a first pass answered STALE is a scheduled regeneration, not cache variance', () => {
    // Every page revalidates hourly since 2026-09-27, so the probe's first request can be the one
    // that triggers a regeneration and its second the fresh page. That is the site working.
    const result = classifyDiscrepancy({
      hosts: [apex({ warmDigests: { '/': 'aaa', '/shop': 'zzz' }, coldCache: { '/shop': 'STALE' } }), www(), deployment()],
    })
    expect(result.classification).toBe('clean')
    expect(result.observation.cacheVariance).toEqual([])
    expect(result.observation.regenerated).toEqual([{ host: APEX, path: '/shop' }])
  })

  it('an identity verdict still says commerce was seen — it is never dropped from the sentence', () => {
    const result = classifyDiscrepancy({
      hosts: [apex({ commit: 'old1234', commerce: true }), www(), deployment()],
    })
    expect(result.classification).toBe('host-identity-mismatch')
    expect(result.detail).toContain(`Commerce was also observed on ${APEX}`)
    expect(result.edgeCommerce).toEqual([APEX])
  })

  it('a truncated body with nothing found is never clean — and outranks an external retrieval', () => {
    const hosts = [apex({ truncatedPaths: ['/shop'] }), www(), deployment()]
    expect(classifyDiscrepancy({ hosts })).toMatchObject({ classification: 'unevaluable', reason: 'truncated-response' })
    expect(classifyDiscrepancy({ hosts, externalRetrievalShowsCommerce: true }).classification).toBe('unevaluable')
  })

  it('commerce found in a truncated prefix is still commerce', () => {
    const result = classifyDiscrepancy({
      hosts: [apex({ commerce: true, truncatedPaths: ['/'] }), deployment({ commerce: true })],
    })
    expect(result.classification).toBe('source-build-deploy-chain')
  })

  it("records each host's first answer for /, so a redirect the wrong way round is evidence", () => {
    const observation = observeHosts([
      apex({ firstHop: { status: 307, location: `https://www.${APEX}/` } }),
      www({ firstHop: { status: 200, location: null } }),
    ])
    expect(observation.firstHops).toEqual({
      [APEX]: { status: 307, location: `https://www.${APEX}/` },
      [`www.${APEX}`]: { status: 200, location: null },
    })
    expect(observation.agreement).toBe('deployment-unobserved')
  })
})

describe('what is asked, and how far a redirect is followed', () => {
  it('probes the public pages, one real product, the unknown product and one path per §7 row', () => {
    const paths = probePaths('arc-band-titanium', ROUTES_FORBIDDEN).map((p: { path: string }) => p.path)
    expect(paths.slice(0, 5)).toEqual(['/', '/shop', '/materials', '/products/arc-band-titanium', UNKNOWN_PRODUCT_PATH])
    expect(paths.slice(5)).toEqual(retiredPaths(ROUTES_FORBIDDEN))
    expect(paths.slice(5)).toHaveLength(ROUTES_FORBIDDEN.length)
    expect(UNKNOWN_PRODUCT_PATH).toBe(`/products/${UNKNOWN_HANDLE}`)
  })

  it('probes a §7 route as written, and a family by one path beneath it', () => {
    expect(retiredPaths([{ route: '/cart' }, { route: '/cart/:path*' }, { route: '/api/auth/login' }])).toEqual([
      '/cart',
      '/cart/test',
      '/api/auth/login',
    ])
    expect(() => retiredPaths([])).toThrow(/§7 retires no route/)
  })

  it('reads the first catalogue handle from the product filenames', () => {
    expect(firstHandle()).toMatch(/^[a-z0-9-]+$/)
  })

  it('follows apex to www, and never off the brand domain', () => {
    expect(nextHop(`https://${APEX}/shop`, 307, `https://www.${APEX}/shop`, 0)).toMatchObject({ follow: true })
    expect(nextHop('https://x.vercel.app/', 302, 'https://vercel.com/sso/x', 0)).toMatchObject({
      follow: false,
      reason: 'off-site',
    })
    expect(nextHop(`https://${APEX}/`, 200, null, 0)).toMatchObject({ follow: false, reason: 'final' })
    expect(nextHop(`https://${APEX}/`, 308, '/a', MAX_REDIRECTS)).toMatchObject({
      follow: false,
      reason: 'too-many-redirects',
    })
  })

  it('records the header subset and only whether a CSP is present', () => {
    const headers = new Map([
      ['server', 'Vercel'],
      ['x-vercel-cache', 'HIT'],
      ['content-security-policy', "default-src 'self'"],
      ['set-cookie', 'never-recorded=1'],
    ])
    const picked = pickHeaders((n: string) => headers.get(n) ?? null)
    expect(picked).toEqual({ server: 'Vercel', 'x-vercel-cache': 'HIT', 'content-security-policy-present': true })
  })

  /**
   * A real `Response` whose body records whether anybody cancelled it. Pull-based, 512 bytes at a
   * time, the way a socket delivers — a stream that enqueues everything up front is already
   * closed by the time a reader stops, and cancelling a closed stream calls nothing.
   */
  function trackedResponse(status: number, body: string, headers: Record<string, string> = {}) {
    const state = { cancelled: false }
    const bytes = new TextEncoder().encode(body)
    let offset = 0
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (offset >= bytes.byteLength) return controller.close()
        controller.enqueue(bytes.subarray(offset, offset + 512))
        offset += 512
      },
      cancel() {
        state.cancelled = true
      },
    })
    return { response: new Response(stream, { status, headers: { server: 'Vercel', ...headers } }), state }
  }

  it('walks a redirect chain by hand, discards the hop, and reads the page it lands on', async () => {
    // These doubles had no body stream until 2026-09-27, so the probe's reader saw empty text
    // and the test checked statuses alone. Real Responses now: the body is read, and the
    // redirect hop's body is released unread.
    const hop = trackedResponse(307, 'moved', { location: `https://www.${APEX}/shop` })
    const page = trackedResponse(200, html('<h1>Shop</h1>'))
    const answers: Record<string, Response> = {
      [`https://${APEX}/shop`]: hop.response,
      [`https://www.${APEX}/shop`]: page.response,
    }
    const result = await fetchChain(`https://${APEX}/shop`, async (url: string) => answers[url])
    expect(result.chain.map((c: { status: number }) => c.status)).toEqual([307, 200])
    expect(result.status).toBe(200)
    expect(result.finalUrl).toBe(`https://www.${APEX}/shop`)
    expect(result.body).toContain('<h1>Shop</h1>')
    expect(result.truncated).toBe(false)
    expect(hop.state.cancelled, 'the redirect hop body was left open').toBe(true)
  })

  it('records a body longer than the cap as truncated, with only the cap read', async () => {
    const page = trackedResponse(200, html('x'.repeat(5000)))
    const result = await fetchChain(`https://${APEX}/`, async () => page.response, 1024)
    expect(result).toMatchObject({ truncated: true, truncationReason: 'byte-cap', bytesRead: 1024 })
    expect(page.state.cancelled).toBe(true)
  })

  it('returns a transport failure as data', async () => {
    const result = await fetchChain('https://unreachable.example/', async () => {
      throw Object.assign(new Error('fetch failed'), { cause: { code: 'ENOTFOUND' } })
    })
    expect(result).toMatchObject({ transport: 'failed', detail: 'ENOTFOUND' })
  })
})

describe('renderSummary', () => {
  it('states the classification first and lists purchase-era copy as an observation', () => {
    const classification = classifyDiscrepancy({ hosts: [apex(), www()] })
    const markdown = renderSummary({
      generatedAt: '2026-09-26T00:00:00Z',
      classification,
      hosts: [apex(), www()],
      requests: [],
      observations: { 'free-shipping': [`${APEX}/shipping`] },
    })
    expect(markdown).toContain('**clean**')
    expect(markdown).toMatch(/not a finding/)
    expect(markdown).toContain(`${APEX}/shipping`)
    expect(markdown).toContain('Edge vs deployment: **deployment-unobserved**')
  })
})
