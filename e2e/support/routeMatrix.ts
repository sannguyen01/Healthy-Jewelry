/**
 * **Contract §7, expanded into the requests a real client actually sends.**
 *
 * The literal cases in `e2e/retired-routes.spec.ts` each asked one question — does a GET
 * of one path answer the right status — and so each retired family was proved for one
 * method, one spelling and no query string. Finding 18 of the decommission plan listed
 * what that left unobserved:
 *
 * - **HEAD.** Crawlers and link checkers send it. A route module that exported only `GET`
 *   answers HEAD with 405, which reads as "exists, wrong verb".
 * - **POST to the 308 families.** Shopify's `/cart/add` *is* a POST, and a 308 preserves
 *   the method and body — so a cached product form re-submits to the destination. What that
 *   destination does with a POST is a separate question, asked by the spec, not here.
 * - **Trailing slashes and percent-encoding.** Next normalises `/cart/` to `/cart` with its
 *   own 308 *before* `redirects()` runs, so a trailing-slash request is two hops, and a
 *   matcher that only ever saw `/cart/add` has never been shown `/cart/%61dd`.
 * - **Query strings.** `?discount=CODE` is how Shopify carried a price promise on any URL;
 *   `?utm_source=` is how every campaign link arrives. Next carries the query through a
 *   redirect verbatim, and that is asserted rather than assumed.
 *
 * This module is pure — no Playwright, no filesystem — so the unit suite can hold it to
 * known answers (`route-matrix.test.ts`) and `commerce-route-inventory.test.ts` can use
 * `familyOf` to reconcile the spec's literal cases against §7 in both directions. The
 * rows come in as an argument, from `e2e/support/contract.ts`, which reads them through
 * the same parser the merge-gate scanner uses.
 */

/** One §7 row, as `parseContract(...).routesForbidden` yields it. */
export interface ForbiddenRouteRow {
  route: string
  status: number
  location: string | null
  why: string
}

/** What one request must answer. `location` is asserted only when `status` is 308. */
export interface HopExpectation {
  status: number
  location: string | null
}

export type VariantKind = 'route' | 'example' | 'trailing-slash' | 'query'

export interface RouteVariant {
  /** The §7 route this variant was generated from, spelled as the contract spells it. */
  family: string
  kind: VariantKind
  /** The request path, query included, exactly as sent — never re-encoded. */
  path: string
  /** The first response, read with `maxRedirects: 0`. */
  first: HopExpectation
  /**
   * The answer at `first.location`, when the first hop is Next's own trailing-slash
   * normalisation rather than the family's rule. `null` when the first hop is the answer.
   */
  then: HopExpectation | null
}

/** Every method the matrix sends. PUT/PATCH/DELETE are covered at unit level by `goneRoute`. */
export const MATRIX_METHODS = ['GET', 'HEAD', 'POST'] as const
export type MatrixMethod = (typeof MATRIX_METHODS)[number]

/**
 * Concrete stand-ins for a `:path*` segment.
 *
 * One segment, two segments, and a percent-encoded one (`%61` is `a`): the three shapes a
 * matcher can get wrong independently. The encoded one is sent as written — Playwright and
 * Node both leave an already-encoded path alone — so it reaches the router encoded.
 */
export const WILDCARD_EXAMPLES = ['/x', '/a/b', '/%61bc'] as const

/** The two query shapes an old link carries: a price promise and a campaign tag. */
export const QUERY_VARIANTS = ['?discount=CODE', '?utm_source=x'] as const

/**
 * The `Cache-Control` every 410 answers with, set once in `src/lib/http/goneResponse.ts`.
 *
 * Written out here rather than imported so the spec asserts the *response*, not the
 * helper's own constant: a route that stopped using the helper would still pass a check
 * that read its value from the helper. An hour, public: a withdrawn capability is a durable
 * answer, but one that must stay cheap to reverse — an immutable 410 could not be.
 */
export const GONE_CACHE_CONTROL = 'public, max-age=3600'

const WILDCARD = /\/:[A-Za-z_][A-Za-z0-9_]*\*$/

/** The static prefix of a `:path*` family, or `null` for an exact route. */
export function wildcardPrefix(route: string): string | null {
  return WILDCARD.test(route) ? route.replace(WILDCARD, '') : null
}

/**
 * The §7 row that governs a concrete path, the way Next's matcher would pick it.
 *
 * An exact row wins over a family; among families the longest prefix wins. `:path*`
 * matches zero segments too, so `/orders` belongs to `/orders/:path*` — which is why §7
 * needs no separate `/orders` row. The query string is ignored, and so is a trailing
 * slash: Next strips it with its own redirect before any rule is consulted.
 */
export function familyOf<T extends ForbiddenRouteRow>(path: string, rows: readonly T[]): T | null {
  const bare = path.split('?')[0].split('#')[0].replace(/(.)\/+$/, '$1')
  const exact = rows.find((r) => wildcardPrefix(r.route) === null && r.route === bare)
  if (exact) return exact

  let best: T | null = null
  let bestLength = -1
  for (const row of rows) {
    const prefix = wildcardPrefix(row.route)
    if (prefix === null) continue
    if ((bare === prefix || bare.startsWith(`${prefix}/`)) && prefix.length > bestLength) {
      best = row
      bestLength = prefix.length
    }
  }
  return best
}

/** The first-hop answer for a path with no trailing slash, given its family. */
function answerFor(row: ForbiddenRouteRow, query = ''): HopExpectation {
  // A 308 carries the query through untouched, so the location does too. A 410 or a 404
  // has no location to carry it to.
  return row.status === 308
    ? { status: 308, location: `${row.location}${query}` }
    : { status: row.status, location: null }
}

/** Every variant one §7 row generates. */
export function variantsFor(row: ForbiddenRouteRow): RouteVariant[] {
  const prefix = wildcardPrefix(row.route)
  const bases = prefix === null ? [row.route] : WILDCARD_EXAMPLES.map((e) => `${prefix}${e}`)
  const base = bases[0]
  const family = row.route

  const out: RouteVariant[] = bases.map((path) => ({
    family,
    kind: prefix === null ? 'route' : 'example',
    path,
    first: answerFor(row),
    then: null,
  }))

  // Next's trailing-slash normalisation runs first and answers 308 to the slashless path,
  // for every route — a 410 and a 404 included. The family's own answer is the second hop.
  out.push({
    family,
    kind: 'trailing-slash',
    path: `${base}/`,
    first: { status: 308, location: base },
    then: answerFor(row),
  })

  for (const query of QUERY_VARIANTS) {
    out.push({ family, kind: 'query', path: `${base}${query}`, first: answerFor(row, query), then: null })
  }
  return out
}

/** The whole matrix, one row at a time, in contract order. */
export function retiredRouteMatrix(rows: readonly ForbiddenRouteRow[]): RouteVariant[] {
  return rows.flatMap(variantsFor)
}
