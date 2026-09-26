import { describe, it, expect } from 'vitest'

const {
  classifyDiscrepancy,
  detectBody,
  nextHop,
  pickHeaders,
  probePaths,
  renderSummary,
  requestShowsCommerce,
  RETIRED_PATHS,
  UNKNOWN_PRODUCT_PATH,
  MAX_REDIRECTS,
} = await import('../../../scripts/lib/live-surface.mjs')
const { fetchChain, firstHandle } = await import('../../../scripts/probe-live-surface.mjs')
const { VENDOR_DOMAINS } = await import('../../../scripts/lib/browse-only.mjs')

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
    const result = detectBody(body)
    expect(result.visiblePrice.length).toBeGreaterThan(0)
    expect(result.commerce).toBe(true)
  })

  it('sees an Offer in JSON-LD', () => {
    const result = detectBody(html('<script type="application/ld+json">{"@type":"Offer","price":"1"}</script>'))
    expect(result.jsonLd).toEqual(expect.arrayContaining(['offer-jsonld', 'price-jsonld']))
    expect(result.commerce).toBe(true)
  })

  it('sees the vendor host', () => {
    const result = detectBody(html(`<img src="https://cdn.${VENDOR_DOMAINS[1]}/s/x.jpg">`))
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
    expect(detectBody(html(inner)).purchaseControls.length).toBeGreaterThan(0)
  })

  it('does not call prose about the absence of a checkout a control', () => {
    const result = detectBody(html('<p>There is no checkout on this site. Ask an ambassador.</p>'))
    expect(result.purchaseControls).toEqual([])
    expect(result.commerce).toBe(false)
  })

  it('records purchase-era copy as an observation that never makes a page commerce', () => {
    // Present in source today pending legal review; a failure here would be red on text
    // nobody in CI may change.
    const result = detectBody(html('<p>Free shipping worldwide. 30-day returns and a full refund. Dispatched in a day. Lifetime warranty.</p>'))
    expect(result.purchaseEraCopy).toEqual(['free-shipping', 'returns', 'refund', 'dispatch', 'warranty'])
    expect(result.commerce).toBe(false)
  })

  it('is clean on a clean page', () => {
    const result = detectBody(html('<h1>Grade 23 titanium</h1><p>Ti-6Al-4V ELI, 1.60 mm band.</p>'))
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

  it('a public page is commerce only when a blocking detector fired', () => {
    expect(requestShowsCommerce({ kind: 'public', status: 200, detectors: { commerce: true } })).toBe(true)
    expect(requestShowsCommerce({ kind: 'public', status: 200, detectors: null })).toBe(false)
  })
})

type Host = {
  role: string
  host: string
  reachable: boolean
  protected?: boolean
  commit: string | null
  commerce: boolean
  digests: Record<string, string>
}
const host = (role: string, name: string, overrides: Partial<Host> = {}): Host => ({
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

  it('apex differs from the deployment by commit → alias-dns-cdn', () => {
    const result = classifyDiscrepancy({ hosts: [apex({ commit: 'old1234' }), www(), deployment()] })
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

describe('what is asked, and how far a redirect is followed', () => {
  it('probes the public pages, one real product, the unknown product and every retired path', () => {
    const paths = probePaths('arc-band-titanium').map((p: { path: string }) => p.path)
    expect(paths.slice(0, 5)).toEqual(['/', '/shop', '/materials', '/products/arc-band-titanium', UNKNOWN_PRODUCT_PATH])
    expect(paths.slice(5)).toEqual([...RETIRED_PATHS])
    expect(RETIRED_PATHS).toHaveLength(8)
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

  it('walks a redirect chain by hand and stops at the edge of the site', async () => {
    const answers: Record<string, { status: number; location?: string; body?: string }> = {
      [`https://${APEX}/shop`]: { status: 307, location: `https://www.${APEX}/shop` },
      [`https://www.${APEX}/shop`]: { status: 200, body: html('<h1>Shop</h1>') },
    }
    const fetchImpl = async (url: string) => {
      const a = answers[url]
      return {
        status: a.status,
        headers: { get: (n: string) => (n === 'location' ? a.location ?? null : n === 'server' ? 'Vercel' : null) },
        text: async () => a.body ?? '',
      }
    }
    const result = await fetchChain(`https://${APEX}/shop`, fetchImpl)
    expect(result.chain.map((c: { status: number }) => c.status)).toEqual([307, 200])
    expect(result.status).toBe(200)
    expect(result.finalUrl).toBe(`https://www.${APEX}/shop`)
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
  })
})
