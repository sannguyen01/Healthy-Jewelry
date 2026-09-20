import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const ROOT = resolve(__dirname, '../../..')

const { assessBrowseOnly, isAttributable, COMMERCE_MARKERS, FORBIDDEN_HOST_PATTERN } =
  await import('../../../scripts/lib/browse-only.mjs')
const { sitemapPathFromRobots, handlesFromSitemap } = await import(
  '../../../scripts/verify-browse-only.mjs'
)

/**
 * **The browse-only smoke's decision, driven by fixtures.**
 *
 * The script is transport and printing only (ADR 030), so every branch below is reachable
 * without a network — which is what let the attribution bug be found by *running* the thing
 * against a known answer rather than by reading it (ADR 024).
 */

const HANDLES = ['arc-band-titanium', 'dome-ring-titanium']

interface Observation {
  path: string
  kind: string
  transport: string
  status: number
  server: string
  body: string
  detail?: string
}

/** An ordinary HTML response from the site, with nothing wrong with it. */
const ok = (
  path: string,
  kind: string,
  body = '<!doctype html><html><body>a</body></html>'
): Observation => ({
  path,
  kind,
  transport: 'ok',
  status: kind === 'unknown-product' ? 404 : 200,
  server: 'Vercel',
  body,
})

const cleanRun = (): Observation[] => [
  ok('/products/arc-band-titanium', 'product'),
  ok('/products/dome-ring-titanium', 'product'),
  ok('/shop', 'collection'),
  ok('/products/nope', 'unknown-product'),
]

describe('a clean site reports clean', () => {
  it('finds nothing wrong with a healthy browse-only deployment', () => {
    const result = assessBrowseOnly({
      expectedHandles: HANDLES,
      observations: cleanRun(),
      sitemapHandles: HANDLES,
    })
    expect(result.verdict).toBe('clean')
    expect(result.findings).toEqual([])
  })
})

describe('an inability to measure is never a measurement', () => {
  // ADR 010, and the bug this guard shipped with. The first version accepted "a server
  // header OR any body at all", and the interception this repository runs behind answers
  // with a 78-byte text/plain denial — a body. It reported seventeen confident findings
  // about a site it had never reached.
  const middleboxDenial: Observation = {
    path: '/products/arc-band-titanium',
    kind: 'product',
    transport: 'ok',
    status: 403,
    server: '',
    body: 'Forbidden: this host is not permitted by the egress policy for this sandbox.',
  }

  it('does not attribute a bare 403 with a plain-text body to the site', () => {
    expect(isAttributable(middleboxDenial)).toBe(false)
  })

  it('reports unevaluable rather than a catalogue full of findings', () => {
    const result = assessBrowseOnly({
      expectedHandles: HANDLES,
      observations: [middleboxDenial, { ...middleboxDenial, path: '/products/dome-ring-titanium' }],
      sitemapHandles: null,
    })
    expect(result.verdict).toBe('unevaluable')
    expect(result.reason).toBe('no-attributable-responses')
    expect(result.findings).toEqual([])
  })

  it('still judges a real Vercel 403, which sends its own server header', () => {
    // Deployment Protection turned on by accident is a genuine misconfiguration and must
    // not be hidden by the guard that exists for middleboxes.
    expect(isAttributable({ ...middleboxDenial, server: 'Vercel' })).toBe(true)
  })

  it('attributes a 403 that returns an HTML page', () => {
    expect(
      isAttributable({
        ...middleboxDenial,
        body: '<!DOCTYPE html><html><body>Denied</body></html>',
      })
    ).toBe(true)
  })

  it('never attributes a transport failure', () => {
    expect(
      isAttributable({
        path: '/x',
        kind: 'product',
        transport: 'failed',
        status: 0,
        server: '',
        body: '',
      })
    ).toBe(false)
  })

  it('refuses to compare against an empty handle list', () => {
    // A sweep whose input is silently empty passes every assertion — the shape this
    // repository has recorded seven times.
    const result = assessBrowseOnly({
      expectedHandles: [],
      observations: cleanRun(),
      sitemapHandles: [],
    })
    expect(result.verdict).toBe('unevaluable')
    expect(result.reason).toBe('no-expected-handles')
  })
})

describe('the findings each fire on their own shape', () => {
  const findingCodes = (
    observations: Observation[],
    sitemapHandles: string[] | null = HANDLES
  ): string[] =>
    assessBrowseOnly({ expectedHandles: HANDLES, observations, sitemapHandles }).findings.map(
      (f: { code: string }) => f.code
    )

  it('a product that does not serve', () => {
    const runs = cleanRun()
    runs[0] = { ...runs[0], status: 500 }
    expect(findingCodes(runs)).toContain('product-not-served')
  })

  it('a soft 404 on an unknown handle', () => {
    // The live site does exactly this today: HTTP 200 with not-found.tsx rendered. It is
    // documented and deliberate — `dynamicParams = false` would 404 products newly added
    // in Shopify — and that premise expires when the repository becomes the catalogue.
    const runs = cleanRun()
    runs[3] = { ...runs[3], status: 200 }
    expect(findingCodes(runs)).toContain('unknown-not-404')
  })

  it('a Shopify host referenced anywhere in a response', () => {
    const runs = cleanRun()
    runs[0] = {
      ...runs[0],
      body: '<html><img src="https://cdn.shopify.com/s/files/1/x.jpg"></html>',
    }
    expect(findingCodes(runs)).toContain('shopify-host-referenced')
  })

  it.each([
    ['offer-jsonld', '{"@type": "Offer"}'],
    ['price-jsonld', '{"price": "89.00"}'],
    ['availability-jsonld', '"https://schema.org/InStock"'],
    ['add-to-bag', '<button data-testid="add-to-bag">Add</button>'],
    ['checkout-control', '<button data-testid="checkout-button">Go</button>'],
  ])('a surviving commerce marker: %s', (id, snippet) => {
    const runs = cleanRun()
    runs[0] = { ...runs[0], body: `<!doctype html><html>${snippet}</html>` }
    expect(findingCodes(runs)).toContain(`commerce-${id}`)
  })

  it('a product missing from the sitemap', () => {
    expect(findingCodes(cleanRun(), ['arc-band-titanium'])).toContain('sitemap-omits-product')
  })

  it('a sitemap listing a product the repository does not hold', () => {
    // Either the deployment is behind the repository, or the sitemap is built from a source
    // the catalogue no longer agrees with. Both are worth knowing and neither is visible.
    expect(findingCodes(cleanRun(), [...HANDLES, 'ghost-product'])).toContain(
      'sitemap-lists-unknown-product'
    )
  })

  it('a sitemap that could not be read is its own finding', () => {
    // Separate from "a handle is missing": a sitemap that 500s and a sitemap that omits a
    // product are different problems with different fixes.
    expect(findingCodes(cleanRun(), null)).toContain('sitemap-unreadable')
  })
})

describe('the host pattern matches hosts, not prose', () => {
  const hosts = (text: string): string[] => text.match(FORBIDDEN_HOST_PATTERN) ?? []

  it.each([
    'https://cdn.shopify.com/s/files/1/x.jpg',
    'https://healthy-jewellery.myshopify.com/products/a',
    'https://cdn.shopifycdn.net/x.js',
  ])('catches %s', (url) => {
    expect(hosts(url).length).toBeGreaterThan(0)
  })

  it('does not fire on the word Shopify in prose', () => {
    // Docs and legal copy may legitimately name the platform the brand left.
    expect(hosts('We no longer sell through Shopify.')).toEqual([])
  })
})

describe('the sitemap path comes from robots.txt, not from convention', () => {
  // The probe originally guessed /sitemap.xml. This site serves /api/sitemap, so it
  // reported `sitemap-unreadable` against a working sitemap — a false finding, which is
  // the failure direction that gets a monitor muted (ADR 011).
  it('reads an absolute Sitemap directive', () => {
    expect(
      sitemapPathFromRobots(
        'User-agent: *\nAllow: /\n\nSitemap: https://healthyjewellery.com/api/sitemap\n'
      )
    ).toBe('/api/sitemap')
  })

  it('accepts a relative directive', () => {
    expect(sitemapPathFromRobots('Sitemap: /api/sitemap')).toBe('/api/sitemap')
  })

  it('is case-insensitive, as the spec is', () => {
    expect(sitemapPathFromRobots('sitemap: https://x.test/s.xml')).toBe('/s.xml')
  })

  it('returns null when robots.txt names no sitemap', () => {
    expect(sitemapPathFromRobots('User-agent: *\nAllow: /')).toBeNull()
  })

  it('matches what this repository actually publishes', () => {
    // The join. If robots.txt moves the sitemap the probe follows; if the route moves and
    // robots.txt does not, crawlers break and so does this.
    const robots = readFileSync(join(ROOT, 'public/robots.txt'), 'utf-8')
    expect(sitemapPathFromRobots(robots)).toBe('/api/sitemap')
  })
})

describe('handles are read out of a real sitemap body', () => {
  it('extracts and de-duplicates product handles', () => {
    const body =
      '<urlset><url><loc>https://x.test/products/arc-band-titanium</loc></url>' +
      '<url><loc>https://x.test/products/arc-band-titanium</loc></url>' +
      '<url><loc>https://x.test/shop/rings</loc></url></urlset>'
    expect(handlesFromSitemap({ transport: 'ok', status: 200, body })).toEqual([
      'arc-band-titanium',
    ])
  })

  it('returns null when the sitemap did not serve', () => {
    // null and [] mean different things: "could not ask" versus "asked, it lists nothing".
    expect(handlesFromSitemap({ transport: 'ok', status: 500, body: 'x' })).toBeNull()
    expect(handlesFromSitemap({ transport: 'failed', status: 0, body: '' })).toBeNull()
  })

  it('returns an empty list for a sitemap with no products in it', () => {
    expect(handlesFromSitemap({ transport: 'ok', status: 200, body: '<urlset></urlset>' })).toEqual(
      []
    )
  })
})

describe('the markers are the ones the decommission removes', () => {
  it('names every commerce marker uniquely', () => {
    const ids = COMMERCE_MARKERS.map((m: { id: string }) => m.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('carries a human-readable explanation for each', () => {
    for (const marker of COMMERCE_MARKERS) {
      expect(marker.what.length).toBeGreaterThan(5)
    }
  })
})
