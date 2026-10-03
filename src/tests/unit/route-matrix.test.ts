import { describe, expect, it } from 'vitest'
import {
  familyOf,
  QUERY_VARIANTS,
  expectationFor,
  retiredRouteMatrix,
  variantsFor,
  WILDCARD_EXAMPLES,
  wildcardPrefix,
  type ForbiddenRouteRow,
} from '../../../e2e/support/routeMatrix'

/**
 * **The §7 route-matrix generator, on rows with known answers.**
 *
 * `e2e/retired-routes.spec.ts` generates its HEAD/POST/trailing-slash/encoded/query cases
 * from contract §7 through `e2e/support/routeMatrix.ts`. A generator that produced the
 * wrong expectation would make the E2E suite assert the wrong thing *and pass*, so the
 * expectations themselves are pinned here, against hand-written rows — the E2E run is
 * where they meet a real server (ADR 024: the decision is a pure function, tested apart
 * from the thing it decides about).
 */

const row = (route: string, status: number, location: string | null): ForbiddenRouteRow => ({
  route,
  status,
  location,
  why: 'fixture',
})

const ROWS = [
  row('/cart', 308, '/shop'),
  row('/cart/:path*', 308, '/shop'),
  row('/checkout', 410, null),
  row('/orders/:path*', 410, null),
  row('/api/proxy', 404, null),
  row('/collections/:path*', 308, '/shop'),
  row('/collections/special/:path*', 308, '/legal'),
]

describe('wildcardPrefix', () => {
  it('recognises a :name* family and nothing else', () => {
    expect(wildcardPrefix('/cart/:path*')).toBe('/cart')
    expect(wildcardPrefix('/cart/:rest*')).toBe('/cart')
    expect(wildcardPrefix('/cart')).toBeNull()
    expect(wildcardPrefix('/cart/:id')).toBeNull()
  })
})

describe('familyOf — which §7 row governs a concrete path', () => {
  it.each([
    ['/cart', '/cart'],
    ['/cart/', '/cart'],
    ['/cart?discount=CODE', '/cart'],
    ['/cart/add', '/cart/:path*'],
    ['/cart/a/b', '/cart/:path*'],
    ['/cart/%61bc', '/cart/:path*'],
    ['/orders', '/orders/:path*'],
    ['/orders/1234', '/orders/:path*'],
    ['/collections/rings', '/collections/:path*'],
    ['/collections/special/x', '/collections/special/:path*'],
  ])('%s → %s', (path, family) => {
    expect(familyOf(path, ROWS)?.route).toBe(family)
  })

  it.each(['/shop', '/cartography', '/ordersx', '/api/proxy/x', '/'])('%s → no family', (path) => {
    // `/cartography` is the prefix trap: a startsWith without the slash would claim it.
    expect(familyOf(path, ROWS)).toBeNull()
  })
})

describe('expectationFor — browsing is redirected, an action is told why', () => {
  const ROWS_308 = [row('/cart', 308, '/shop'), row('/cart/:path*', 308, '/shop'), row('/stones', 308, '/')]

  it('leaves GET and HEAD exactly as the variant states them', () => {
    for (const variant of variantsFor(row('/cart', 308, '/shop'))) {
      for (const method of ['GET', 'HEAD'] as const) {
        expect(expectationFor(variant, method, ROWS_308)).toEqual({ first: variant.first, then: variant.then })
      }
    }
  })

  it('turns every successor redirect into the 410 for POST, query variants included', () => {
    const variants = variantsFor(row('/cart', 308, '/shop'))
    for (const variant of variants.filter((v) => v.kind !== 'trailing-slash')) {
      expect(expectationFor(variant, 'POST', ROWS_308), variant.path).toEqual({
        first: { status: 410, location: null },
        then: null,
      })
    }
  })

  it("keeps Next's trailing-slash hop a 308 for POST, then lands on the 410", () => {
    const slash = variantsFor(row('/cart', 308, '/shop')).find((v) => v.kind === 'trailing-slash')!
    expect(expectationFor(slash, 'POST', ROWS_308)).toEqual({
      first: { status: 308, location: '/cart' },
      then: { status: 410, location: null },
    })
  })

  it('recognises a successor of "/" without mistaking the slash hop for it', () => {
    const [bare, slash] = variantsFor(row('/stones', 308, '/'))
    expect(expectationFor(bare, 'POST', ROWS_308).first).toEqual({ status: 410, location: null })
    expect(expectationFor(slash, 'POST', ROWS_308).first).toEqual({ status: 308, location: '/stones' })
  })

  it('changes nothing for a 410 or a 404 row', () => {
    const rows = [row('/orders/:path*', 410, null), row('/api/auth/login', 404, null)]
    for (const variant of retiredRouteMatrix(rows)) {
      expect(expectationFor(variant, 'POST', rows)).toEqual({ first: variant.first, then: variant.then })
    }
  })
})

describe('variantsFor — what each variant must answer', () => {
  it('an exact 308 route: itself, a slash hop onto its answer, and both queries carried', () => {
    expect(variantsFor(row('/cart', 308, '/shop'))).toEqual([
      { family: '/cart', kind: 'route', path: '/cart', first: { status: 308, location: '/shop' }, then: null },
      {
        family: '/cart',
        kind: 'trailing-slash',
        path: '/cart/',
        first: { status: 308, location: '/cart' },
        then: { status: 308, location: '/shop' },
      },
      {
        family: '/cart',
        kind: 'query',
        path: '/cart?discount=CODE',
        first: { status: 308, location: '/shop?discount=CODE' },
        then: null,
      },
      {
        family: '/cart',
        kind: 'query',
        path: '/cart?utm_source=x',
        first: { status: 308, location: '/shop?utm_source=x' },
        then: null,
      },
    ])
  })

  it('a 410 family: every example 410s, the slash hop lands on a 410, a query changes nothing', () => {
    const variants = variantsFor(row('/orders/:path*', 410, null))
    expect(variants.filter((v) => v.kind === 'example').map((v) => v.path)).toEqual(
      WILDCARD_EXAMPLES.map((e) => `/orders${e}`)
    )
    for (const v of variants.filter((v) => v.kind !== 'trailing-slash')) {
      expect(v.first, v.path).toEqual({ status: 410, location: null })
    }
    const slash = variants.find((v) => v.kind === 'trailing-slash')!
    expect(slash).toMatchObject({
      path: '/orders/x/',
      first: { status: 308, location: '/orders/x' },
      then: { status: 410, location: null },
    })
  })

  it('a 404 route has no location in any variant', () => {
    for (const v of variantsFor(row('/api/proxy', 404, null))) {
      expect((v.then ?? v.first).status).toBe(404)
      expect((v.then ?? v.first).location).toBeNull()
    }
  })

  it('every variant of a row is governed by that row', () => {
    // The generator and the matcher must agree, or the inventory reconciliation — which
    // uses familyOf — would be checking a different contract from the one the spec sends.
    for (const variant of retiredRouteMatrix(ROWS)) {
      expect(familyOf(variant.path, ROWS)?.route, variant.path).toBe(variant.family)
    }
  })
})

describe('retiredRouteMatrix', () => {
  it('generates 4 variants per exact route and 6 per family', () => {
    const exact = ROWS.filter((r) => wildcardPrefix(r.route) === null).length
    const families = ROWS.length - exact
    const perExact = 1 + 1 + QUERY_VARIANTS.length
    const perFamily = WILDCARD_EXAMPLES.length + 1 + QUERY_VARIANTS.length
    expect(retiredRouteMatrix(ROWS)).toHaveLength(exact * perExact + families * perFamily)
  })

  it('generates nothing from nothing — which the spec guards against', () => {
    expect(retiredRouteMatrix([])).toEqual([])
  })
})
