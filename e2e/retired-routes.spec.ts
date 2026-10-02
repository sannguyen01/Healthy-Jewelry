import { test, expect, type APIRequestContext, type APIResponse } from './support/test'
import { forbiddenRoutes } from './support/contract'
import {
  GONE_CACHE_CONTROL,
  MATRIX_METHODS,
  retiredRouteMatrix,
  wildcardPrefix,
  type HopExpectation,
  type MatrixMethod,
} from './support/routeMatrix'

/**
 * **The retired-route contract, asserted by status code.**
 *
 * Commerce is gone. Its URLs are not: they are in inbound links, bookmarks, old emails and
 * search indexes, and each one has to answer something deliberate.
 *
 * ## Why every assertion here reads a real status
 *
 * This is the one contract that cannot be checked by looking at a page. `toHaveURL()`
 * passes on a soft redirect *and* on a page that merely renders the destination;
 * `getByText('Gone')` passes on an HTTP 200 that says the word. Both are the exact failure
 * `docs/adr/016-fit-is-a-measurement-nobody-took.md` records in a different domain —
 * `toBeVisible()` returning true for a control whose centre is off-screen.
 *
 * So these use `request.get(url, { maxRedirects: 0 })` and read `.status()`. `maxRedirects: 0`
 * is load-bearing: with redirects followed, a 308 to `/shop` reports 200 and a broken
 * redirect chain is indistinguishable from a working one.
 *
 * `scripts/verify-browse-only.mjs` asks the same questions of the deployed site. This asks
 * them of every build, before deploy.
 */

/**
 * **Handlers exercised here by status code rather than by navigation.**
 *
 * Named explicitly because `e2e/COVERAGE.md` cites this file as the coverage for each of
 * them, and `coverage-manifest-truthfulness.test.ts` reads that citation literally: a
 * reason naming a file that never mentions the route is a justification nobody checked.
 *
 * - `/checkout`
 * - `/checkouts/[[...path]]`
 * - `/orders/[[...path]]`
 * - `/discount/[[...path]]`
 *
 * All four answer 410 and none of them can be meaningfully `goto`-ed: Playwright follows a
 * 410 and renders its body, so a navigation test passes identically whether the route
 * answers 410 or 200. The status read below is the only assertion that distinguishes them.
 */

/** What each retired URL must answer, and why that status rather than another. */
const RETIRED = [
  {
    path: '/cart',
    status: 308,
    location: '/shop',
    why: 'a bag becomes the shelf it was filled from',
  },
  {
    path: '/account',
    status: 308,
    location: '/contact',
    why: 'a login becomes the person who replaces it',
  },
  {
    path: '/cart/add',
    status: 308,
    location: '/shop',
    why: "Shopify's cart endpoint, reachable from any cached page or restored tab",
  },
  {
    path: '/account/orders',
    status: 308,
    location: '/contact',
    why: 'order history, for accounts that were built and never switched on',
  },
  {
    path: '/collections',
    status: 308,
    location: '/shop',
    why: "Shopify's collection index — the shelf still exists, it moved",
  },
  {
    path: '/collections/rings',
    status: 308,
    location: '/shop',
    why: 'an indexed collection URL; one always-correct destination beats five that drift',
  },
  {
    path: '/policies/privacy-policy',
    status: 308,
    location: '/legal',
    why: "the four policy URLs Shopify's hosted checkout linked from its footer",
  },
  {
    path: '/checkout',
    status: 410,
    location: null,
    why: 'a withdrawn capability has no successor — 410 is final where 404 invites re-crawling',
  },
  {
    path: '/checkouts/c/abc123',
    status: 410,
    location: null,
    why: "Shopify's own hosted-checkout URL space, carried in abandoned-cart emails",
  },
  {
    path: '/orders',
    status: 410,
    location: null,
    why: 'this site holds no orders and must never imply it can look one up',
  },
  {
    path: '/orders/1234567890',
    status: 410,
    location: null,
    why: 'an order-status token from a confirmation email',
  },
  {
    path: '/discount/SUMMER25',
    status: 410,
    location: null,
    why: 'a discount is a price claim, and this site publishes no prices',
  },
  {
    path: '/stones',
    status: 308,
    location: '/',
    why: 'a pre-repositioning category URL — this is a titanium brand',
  },
  {
    path: '/crystals',
    status: 308,
    location: '/',
    why: 'healing-crystal inventory the brand no longer sells and whose copy is prohibited',
  },
  {
    path: '/stones/amethyst-ring',
    status: 308,
    location: '/',
    why: 'an indexed product URL beneath the retired category; no titanium successor exists',
  },
  {
    path: '/crystals/quartz-pendant',
    status: 308,
    location: '/',
    why: 'as /stones/:path* — a per-item map would imply a successor piece, and there is none',
  },
  {
    path: '/api/shopify',
    status: 404,
    location: null,
    why: 'never a public contract; the proxy existed only for the cart',
  },
  {
    path: '/api/auth/login',
    status: 404,
    location: null,
    why: 'customer OAuth is gone',
  },
  {
    path: '/api/auth/logout',
    status: 404,
    location: null,
    why: 'customer OAuth is gone',
  },
  {
    path: '/api/auth/callback',
    status: 404,
    location: null,
    why: 'customer OAuth is gone',
  },
] as const

test.describe('Retired commerce routes', () => {
  for (const route of RETIRED) {
    test(`${route.path} answers ${route.status} — ${route.why}`, async ({ request }) => {
      const response = await request.get(route.path, { maxRedirects: 0 })
      expect(
        response.status(),
        `${route.path} answered ${response.status()}, expected ${route.status}.\n\n` +
          `${route.why}.\n\n` +
          `A soft 200 here is the worst outcome: it is an indexable page for a capability ` +
          `that no longer exists, and nothing about the rendered output would show it.`
      ).toBe(route.status)

      if (route.location) {
        // A 308 with no Location is a redirect that redirects nowhere — it reports the
        // right status and strands the visitor.
        expect(response.headers()['location']).toBe(route.location)
      }
    })
  }

  /** Every path in the table above that answers 410, checked as a page rather than a status. */
  const GONE = RETIRED.filter((r) => r.status === 410).map((r) => r.path)

  for (const path of GONE) {
    test(`the ${path} 410 explains itself to a human`, async ({ request }) => {
      // A bare 410 is correct for a crawler and useless to the customer who followed an old
      // link from an email. The body is the difference between "this is broken" and "this
      // brand stopped selling online, here is what to do instead".
      const response = await request.get(path, { maxRedirects: 0 })
      const body = await response.text()

      expect(body, `${path} names no next step`).toMatch(/ambassador/i)
      expect(body, `${path} offers no way to reach a person`).toContain('/contact')
      // The page must render without the app shell, which is the reason it is hand-written
      // HTML. A stylesheet or script tag is a dependency on the pipeline that may be the
      // thing that is gone.
      expect(body).not.toMatch(/<script\b/i)
    })

    test(`the ${path} 410 is not indexable`, async ({ request }) => {
      const response = await request.get(path, { maxRedirects: 0 })
      expect(response.headers()['x-robots-tag']).toMatch(/noindex/i)
    })

    test(`a stale POST to ${path} is also gone, not 405`, async ({ request }) => {
      // An old form re-submitted from a restored tab must get the same answer. 405 Method
      // Not Allowed would suggest the resource exists and the verb is wrong.
      const response = await request.post(path, { maxRedirects: 0 })
      expect(response.status()).toBe(410)
    })
  }

  test('the 410 family is not empty', () => {
    // Guard on the guard: if the filter above ever matched nothing — a status typo, a table
    // rewritten — the three generated tests would simply not exist, and their absence looks
    // exactly like them passing.
    expect(GONE.length).toBeGreaterThanOrEqual(4)
  })

  test('a discount code cannot be smuggled through a query string', async ({ request }) => {
    // Shopify accepts `?discount=CODE` on any storefront URL as well as at `/discount/CODE`.
    // The path is retired above; this asserts the query form reaches an ordinary page with
    // no special behaviour, rather than being honoured by something left over.
    const response = await request.get('/shop?discount=SUMMER25', { maxRedirects: 0 })
    expect(response.status()).toBe(200)
    const body = await response.text()
    expect(body).not.toMatch(/SUMMER25/)
    expect(body).not.toMatch(/discount applied/i)
  })

  test('the routes that stay, stay', async ({ request }) => {
    // The other half of the contract, and the reason this test exists: a redirect rule
    // matching more than it should is invisible until someone reports a missing page.
    for (const path of ['/', '/shop', '/contact', '/about', '/materials']) {
      const response = await request.get(path, { maxRedirects: 0 })
      expect(response.status(), `${path} should still serve`).toBe(200)
    }
  })
})

/**
 * **The same contract, asked every way a real client asks it.**
 *
 * The table above is a literal list, one GET per path, and it stays that way on purpose:
 * `commerce-route-inventory.test.ts` reads its `path:` literals and reconciles them against
 * §7 in both directions, status and location included. What it never covered is finding 18
 * of the decommission plan — HEAD, POST to the 308 families, trailing slashes, encoded
 * segments and query strings — and every one of those is a request something sends.
 *
 * So these are generated from §7 itself (`e2e/support/routeMatrix.ts`), not copied from it:
 * a family added to the contract is a family tested here with no edit to this file, and a
 * status changed in the contract changes what this asserts. Every request is sent with
 * `maxRedirects: 0` for the reason the file header gives.
 *
 * One test per variant, three methods inside it: a failing message names the method, and
 * 94 tests read better in a report than 282.
 */
test.describe('Retired commerce routes — the §7 matrix', () => {
  const MATRIX = retiredRouteMatrix(forbiddenRoutes)

  /** Shopify's own add-to-cart body. The shape is irrelevant to a 308, and that is the point. */
  const CART_FORM = { id: '1', quantity: '1' }

  async function send(request: APIRequestContext, method: MatrixMethod, path: string) {
    return request.fetch(path, {
      method,
      maxRedirects: 0,
      ...(method === 'POST' ? { form: CART_FORM } : {}),
    })
  }

  async function expectHop(response: APIResponse, method: MatrixMethod, path: string, hop: HopExpectation) {
    const where = `${method} ${path}`
    expect(response.status(), `${where} answered ${response.status()}, expected ${hop.status}`).toBe(hop.status)
    const headers = response.headers()

    if (hop.status === 308) {
      // Asserted exactly, query included: Next carries the query string through a redirect,
      // and a location that dropped or mangled it would strand a campaign link's attribution.
      expect(headers['location'], `${where} redirects somewhere else`).toBe(hop.location)
    }
    if (hop.status === 410) {
      expect(headers['x-robots-tag'], `${where} is an indexable 410`).toMatch(/noindex/i)
      // What goneResponse sets. A 410 missing it has stopped going through the helper, and
      // then the next thing to go missing from it is the X-Robots-Tag.
      expect(headers['cache-control'], `${where} lost the 410 cache policy`).toBe(GONE_CACHE_CONTROL)
    }
    if (method === 'HEAD') {
      // HEAD is GET without a body. A body here is a server that does not know what HEAD is.
      expect((await response.body()).length, `${where} returned a body`).toBe(0)
    }
  }

  test('the matrix covers every §7 row, in every variant shape', () => {
    // Guard on the generator: an empty §7 parse would generate zero tests, and zero tests
    // is indistinguishable from a passing file.
    expect(forbiddenRoutes.length).toBeGreaterThanOrEqual(19)
    const families = new Set(MATRIX.map((v) => v.family))
    expect([...families].sort()).toEqual(forbiddenRoutes.map((r) => r.route).sort())
    for (const kind of ['trailing-slash', 'query'] as const) {
      expect(MATRIX.filter((v) => v.kind === kind).length, kind).toBeGreaterThanOrEqual(forbiddenRoutes.length)
    }
    expect(MATRIX.some((v) => v.path.includes('%61'))).toBe(true)
  })

  for (const variant of MATRIX) {
    const shows = variant.then ? `${variant.first.status} → ${variant.then.status}` : `${variant.first.status}`
    test(`${variant.path} answers ${shows} to GET, HEAD and POST [${variant.kind} of ${variant.family}]`, async ({
      request,
    }) => {
      for (const method of MATRIX_METHODS) {
        await expectHop(await send(request, method, variant.path), method, variant.path, variant.first)
        if (variant.then) {
          // The trailing-slash hop is Next's, not ours. What matters is that it lands on
          // the family's answer rather than on a page — so follow it by hand, same method.
          const next = variant.first.location as string
          await expectHop(await send(request, method, next), method, next, variant.then)
        }
      }
    })
  }
})

/**
 * **A 308 keeps the method. So where does a retired POST end up?**
 *
 * Shopify's `/cart/add` is a POST, and so is `/account/login`. A 308, unlike a 301, obliges
 * the client to repeat the *same* method and body at the new location — so a product form
 * submitted from a cached page, or a restored tab, re-POSTs to `/shop`. The redirect is
 * correct and asserted above; this asks what the *destination* does with the POST, which
 * no test had ever looked at.
 *
 * Measured on 2026-09-26 against `next start` (Next 16.3), for each distinct §7 destination:
 *
 * | Body | Destination answers | Who sends it |
 * |---|---|---|
 * | `application/x-www-form-urlencoded` | 200, the page | an older theme's `<form method="post">` |
 * | `multipart/form-data` | 404 `Server action not found.` | Dawn's product form (`enctype="multipart/form-data"`) |
 * | `application/json` | 405, `Allow: GET, HEAD` | the AJAX cart API, `/cart/add.js` |
 *
 * Next treats a form-encoded POST to a page as a possible server-action submission. With no
 * action id in the body, a urlencoded one falls through to rendering the page — the visitor
 * sees the shelf, which is what §7 promises. A multipart one is rejected by the action
 * dispatcher with a plain-text 404, which is a dead end for a person: **a known defect,
 * reported to the integrator, pinned here exactly** so that the fix is a deliberate edit to
 * this table rather than a change nobody notices. The JSON case is correct as it stands: a
 * script that believed it had added to a bag gets a failure, never a 2xx.
 *
 * Every case: no `Set-Cookie` (no cart or session is ever minted), and never a 5xx.
 */
test.describe('Retired commerce routes — a POST that follows its 308', () => {
  const DESTINATIONS = [...new Set(forbiddenRoutes.filter((r) => r.status === 308).map((r) => r.location))]

  const BODIES = [
    { encoding: 'urlencoded', status: 200, contentType: /^text\/html/ },
    { encoding: 'multipart', status: 404, contentType: /^text\/plain/ },
    { encoding: 'json', status: 405, contentType: null },
  ] as const

  const CART_FIELDS = { id: '1', quantity: '1' }

  function bodyFor(encoding: (typeof BODIES)[number]['encoding']) {
    if (encoding === 'urlencoded') return { form: CART_FIELDS }
    if (encoding === 'multipart') return { multipart: CART_FIELDS }
    return { data: CART_FIELDS, headers: { 'content-type': 'application/json' } }
  }

  test('there are destinations to follow', () => {
    expect(DESTINATIONS.length).toBeGreaterThanOrEqual(4)
  })

  for (const destination of DESTINATIONS) {
    // A `:path*` family that redirects here if there is one, else the exact route, at a
    // concrete path. `/add` is Shopify's cart verb; for the other families it is simply a
    // segment the family must absorb.
    const redirecting = forbiddenRoutes.filter((r) => r.status === 308 && r.location === destination)
    const row = redirecting.find((r) => wildcardPrefix(r.route) !== null) ?? redirecting[0]
    const prefix = wildcardPrefix(row.route)
    const source = prefix === null ? row.route : `${prefix}/add`

    for (const body of BODIES) {
      test(`a ${body.encoding} POST to ${source} re-POSTs to ${destination} and gets ${body.status}`, async ({
        request,
      }) => {
        const first = await request.post(source, { maxRedirects: 0, ...bodyFor(body.encoding) })
        expect(first.status()).toBe(308)
        expect(first.headers()['location']).toBe(destination)

        // Followed by hand, same method and body, which is what RFC 9110 §15.4.9 requires
        // of the client and what every browser does.
        const landed = await request.post(destination as string, { maxRedirects: 0, ...bodyFor(body.encoding) })
        const headers = landed.headers()
        expect(landed.status(), `${body.encoding} POST at ${destination}`).toBe(body.status)
        if (body.contentType) expect(headers['content-type']).toMatch(body.contentType)
        if (body.encoding === 'multipart') expect(await landed.text()).toBe('Server action not found.')
        if (body.encoding === 'json') expect(headers['allow'] ?? '').toMatch(/GET/)
        expect(headers['set-cookie'], `${body.encoding} POST at ${destination} minted a cookie`).toBeUndefined()
      })
    }
  }
})

/**
 * **Acceptance criterion 4: a handle the catalogue does not hold is a real 404.**
 *
 * These assertions were deferred, and the comment that stood here said exactly why: while
 * `products/[handle]/page.tsx` read `@/lib/shopify`, the *soft* 404 was the correct
 * behaviour. `generateStaticParams` enumerated what Shopify held at build time, so
 * `dynamicParams = false` would have hard-404'd any product a merchant added since the last
 * deploy. The trade-off was documented in the page and mitigated with `robots: noindex`.
 *
 * That premise expired when the data source moved to `@/lib/catalog`: nobody can add a
 * product anywhere but this repository, so the generated list is complete by construction.
 * `src/tests/unit/soft-404-premise.test.ts` failed the moment the imports changed and named
 * the fix in its message; `dynamicParams = false` went in with it, and these assertions
 * arrive in the same change rather than before it.
 *
 * ## Why a status code and not a rendered page
 *
 * A soft 404 is HTTP 200 with `not-found.tsx` inside it. It renders the words "not found",
 * so `getByText(/not found/i)` passes on both the broken and the fixed behaviour — and a
 * crawler indexes the 200. This is the same measurement failure as everything else in this
 * file: `request.get()` and `.status()` are the only things that can tell them apart.
 */
test.describe('Unknown product handles', () => {
  const UNKNOWN = [
    {
      path: '/products/does-not-exist',
      why: 'a handle nobody has ever published',
    },
    {
      path: '/products/sapphire-halo-ring',
      why: 'a plausible jewellery handle for a piece this brand does not make — and one whose name breaks the no-stones rule, so it could never be added',
    },
    {
      path: '/products/arc-band-titanium-x',
      why: 'a real handle with a character appended, which is what a truncated or mangled inbound link looks like',
    },
  ] as const

  for (const route of UNKNOWN) {
    test(`${route.path} answers 404`, async ({ request }) => {
      const response = await request.get(route.path, { maxRedirects: 0 })
      expect(
        response.status(),
        `${route.path} answered ${response.status()}, expected 404.\n\n` +
          `${route.why}.\n\n` +
          `HTTP 200 here is a soft 404: the page renders "not found" while the status line ` +
          `says the URL is fine, so a crawler indexes it. dynamicParams = false on ` +
          `products/[handle]/page.tsx is what makes this real — check it is still there.`
      ).toBe(404)
    })
  }

  test('an unknown collection is a 404 too', async ({ request }) => {
    // `/shop/[collection]` has had `dynamicParams = false` all along, because its handle set
    // was always closed. Asserted beside the product case so the two cannot drift: they are
    // now the same mechanism for the same reason.
    const response = await request.get('/shop/pendants', { maxRedirects: 0 })
    expect(response.status()).toBe(404)
  })

  test('every handle the catalogue does hold still serves', async ({ request }) => {
    // The other half, and the reason this is not just a 404 test. `dynamicParams = false`
    // makes the generated list authoritative: a product missing from it is a 404 on a page
    // the site links to from its own collection grid. A spec that only checked the
    // negative direction would pass on an empty catalogue.
    for (const handle of ['arc-band-titanium', 'disc-studs-titanium', 'cable-cuff-titanium']) {
      const response = await request.get(`/products/${handle}`, { maxRedirects: 0 })
      expect(response.status(), `/products/${handle} should serve`).toBe(200)
    }
  })

  test("the 404 is the site's own page, not a framework error", async ({ request }) => {
    // A correct status with a stack trace under it is still a bad outcome for the person
    // who followed a stale link from an ambassador's message. `not-found.tsx` is what
    // renders here, and this asserts the visitor lands somewhere with a way back in.
    const response = await request.get('/products/does-not-exist', { maxRedirects: 0 })
    const body = await response.text()

    expect(body).toMatch(/doesn&#x27;t exist|doesn't exist/i)
    expect(body).toMatch(/href="\/"/)
  })
})
