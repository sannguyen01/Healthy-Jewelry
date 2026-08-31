import { describe, it, expect } from 'vitest'
import { readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { GET } from '@/app/api/sitemap/route'
import { STATIC_PAGES, SITEMAP_EXCLUDED } from '@/lib/seo/sitemapPages'
import { hjCollections, getAllProducts } from '@/lib/data/hj-data'

import { pageRoutes } from '../support/parsers'

/**
 * **Every route this app serves is either in the sitemap or excluded on the record.**
 *
 * ## The third state
 *
 * `--sage` shipped as 9–13px text at ratios between 1.97:1 and 2.36:1 in four places.
 * It did not fail the contrast check. It was **absent from the list the check reads** —
 * a third state between pass and fail, invisible from either side, and the reason
 * `design-tokens-contrast.test.ts` now requires every colour token to be classified.
 *
 * The sitemap's page list carried the identical risk and the identical defect. It named
 * sixteen paths by hand. `/contact` — a real marketing route with a working form — was
 * not among them, sitting beside `/cart`, `/checkout` and `/account`, which are absent
 * *correctly*. Four omissions, three of them right, and nothing distinguishing them.
 *
 * A missing sitemap entry produces no error, no warning, and no failing test. The page
 * renders. The links work. It is simply less discoverable than it was meant to be, for
 * as long as nobody counts.
 *
 * So this counts, in both directions, from the filesystem — which is the only source of
 * truth about what routes exist. See
 * [ADR 019](../../../docs/adr/019-an-unclassified-entry-is-an-unverified-one.md).
 *
 * ## Dynamic segments are declared, not guessed
 *
 * A `[handle]` directory is not one route, so "is it in the list" is the wrong question.
 * Each dynamic route names below how its concrete paths are generated, and the
 * generation is then checked against the same source the route itself uses. An
 * undeclared dynamic route fails — the same no-third-option rule, applied to the case
 * where the answer is a rule rather than a path.
 */

const APP = resolve(__dirname, '../../app')

/**
 * How each dynamic route's concrete paths reach the sitemap. Keyed by the route pattern
 * as the filesystem spells it.
 */
const DYNAMIC_ROUTE_SOURCES: Record<string, string> = {
  '/shop/[collection]': 'STATIC_PAGES derives one entry per hjCollections handle',
  '/products/[handle]': 'GET() derives one entry per product returned by getProducts()',
}

/** Reads the real `src/app` tree for the walk in `../support/parsers`. */
const readAppDir = (relative: string) =>
  readdirSync(join(APP, relative)).map((name) => ({
    name,
    isDirectory: statSync(join(APP, relative, name)).isDirectory(),
  }))

const routes = pageRoutes(readAppDir)
const staticRoutes = routes.filter((r) => !r.includes('['))
const dynamicRoutes = routes.filter((r) => r.includes('['))
const sitemapPaths = STATIC_PAGES.map((p) => p.loc as string)

describe('the walk found something to check', () => {
  it('finds page routes', () => {
    // Every assertion below is vacuously true over an empty set. This repo has already
    // shipped one check that passed because it looked at nothing.
    expect(routes.length).toBeGreaterThan(10)
  })

  it('finds both static and dynamic routes', () => {
    expect(staticRoutes.length).toBeGreaterThan(0)
    expect(dynamicRoutes.length).toBeGreaterThan(0)
  })
})

describe('every static route is classified', () => {
  it.each(staticRoutes)('%s is either published or excluded with a reason', (route) => {
    const published = sitemapPaths.includes(route)
    const excluded = route in SITEMAP_EXCLUDED

    expect(
      published || excluded,
      `${route} is neither in STATIC_PAGES nor in SITEMAP_EXCLUDED.\n\n` +
        `Decide which. If it should be crawled, add it to STATIC_PAGES with a ` +
        `changefreq and priority. If it should not — transactional, authenticated, ` +
        `per-visitor — add it to SITEMAP_EXCLUDED with the reason.\n\n` +
        `There is no third option. "Not in the list" is how /contact stayed out of the ` +
        `sitemap indefinitely while sitting beside three routes that were out of it on ` +
        `purpose.`
    ).toBe(true)

    // Both would be two answers to one question, and the reader trusts whichever they
    // found first.
    expect(published && excluded, `${route} is both published and excluded`).toBe(false)
  })

  it('every exclusion carries a real reason, not a placeholder', () => {
    for (const [route, reason] of Object.entries(SITEMAP_EXCLUDED)) {
      expect(reason.length, `${route}: the reason is too short to be one`).toBeGreaterThan(30)
    }
  })

  it('nothing is excluded that does not exist', () => {
    // A stale exclusion is a claim about a route that is gone — harmless today, and
    // exactly the fossil this suite is learning not to keep.
    for (const route of Object.keys(SITEMAP_EXCLUDED)) {
      expect(staticRoutes, `SITEMAP_EXCLUDED names ${route}, which no page.tsx serves`).toContain(
        route
      )
    }
  })
})

/**
 * Whether some route in the app router serves this concrete path.
 *
 * A published path may be served literally (`/about` by `about/page.tsx`) or through a
 * dynamic segment (`/shop/rings` by `shop/[collection]/page.tsx`). Matching only the
 * literal set would reject every collection path in the sitemap, so the patterns are
 * matched segment by segment: same length, literals equal, `[…]` matches anything.
 */
function isServedByAnyRoute(path: string): boolean {
  if (staticRoutes.includes(path)) return true

  const parts = path.split('/').filter(Boolean)
  return dynamicRoutes.some((pattern) => {
    const patternParts = pattern.split('/').filter(Boolean)
    if (patternParts.length !== parts.length) return false
    return patternParts.every((segment, i) => segment.startsWith('[') || segment === parts[i])
  })
}

describe('the sitemap publishes nothing that does not exist', () => {
  it.each(sitemapPaths)('%s is served by a real route', (path) => {
    // The reverse direction. A sitemap that advertises a 404 is worse than one with a
    // gap: it spends crawl budget teaching a search engine the site is broken.
    expect(
      isServedByAnyRoute(path),
      `The sitemap publishes ${path}, which no page.tsx serves — literally or through a ` +
        `dynamic segment. Either the route was removed and this entry outlived it, or ` +
        `the path is misspelled.`
    ).toBe(true)
  })

  it('every published collection path is one the router will actually serve', () => {
    // `/shop/[collection]` sets `dynamicParams = false`, so a handle outside its
    // VALID_COLLECTIONS is a hard 404 before rendering. Pattern-matching above proves
    // the shape; this proves the handle. collection-handle-contract.test.ts already
    // holds VALID_COLLECTIONS and hjCollections together, so deriving from hjCollections
    // is sound — that is the join this relies on, named rather than assumed.
    const handles = hjCollections.map((c) => c.handle)
    for (const path of sitemapPaths.filter((p) => p.startsWith('/shop/'))) {
      expect(handles, `${path} is not a collection the router serves`).toContain(
        path.replace('/shop/', '')
      )
    }
  })
})

describe('every dynamic route declares how its paths are generated', () => {
  it.each(dynamicRoutes)('%s names its source', (route) => {
    expect(
      DYNAMIC_ROUTE_SOURCES[route],
      `${route} is a dynamic route and DYNAMIC_ROUTE_SOURCES does not say how its ` +
        `concrete paths reach the sitemap. Add it, then assert the derivation below.`
    ).toBeTruthy()
  })

  it('/shop/[collection] publishes every collection, and only collections', () => {
    // Derived rather than reconciled: STATIC_PAGES maps over hjCollections, so a
    // collection added to the catalogue reaches the sitemap without anyone remembering
    // this file. These five paths were written out by hand until 2026-08-28 —
    // a second copy of hjCollections, with nothing joining them.
    const published = sitemapPaths.filter((p) => p.startsWith('/shop/')).sort()
    const expected = hjCollections.map((c) => `/shop/${c.handle}`).sort()
    expect(published).toEqual(expected)
  })

  it('/products/[handle] publishes one entry per product the fetcher returns', async () => {
    // Without Shopify credentials `getProducts()` degrades to the static catalogue,
    // which is what the unit environment sees. That is the right thing to assert here:
    // the question is whether the sitemap enumerates whatever the fetcher returns, not
    // which catalogue answered.
    const xml = await (await GET()).text()
    for (const product of getAllProducts()) {
      expect(xml, `no sitemap entry for /products/${product.handle}`).toContain(
        `/products/${product.handle}<`
      )
    }
  })
})

describe('the rendered XML carries what the list declares', () => {
  it('emits every static page', async () => {
    // Guards the render loop itself. A correct list and a broken template produce a
    // sitemap that passes every assertion above and ships nothing.
    const xml = await (await GET()).text()
    for (const path of sitemapPaths) {
      expect(xml, `${path} is in STATIC_PAGES but absent from the rendered sitemap`).toContain(
        `${path}<`
      )
    }
  })

  it('emits no excluded route', async () => {
    const xml = await (await GET()).text()
    for (const path of Object.keys(SITEMAP_EXCLUDED)) {
      expect(xml, `${path} is excluded but appears in the rendered sitemap`).not.toContain(
        `<loc>${''}${path}</loc>`
      )
    }
  })
})
