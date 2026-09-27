import { test, expect, type APIRequestContext, type APIResponse } from './support/test'
import { forbiddenRoutes } from './support/contract'
import {
  GONE_CACHE_CONTROL,
  MATRIX_METHODS,
  expectationFor,
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
 *
 * And the six `retiredRoute()` families, which redirect browsing and answer an action with
 * their 410 page — `goto` would follow the 308 and assert the successor, never the route:
 *
 * - `/cart/[[...path]]`
 * - `/account/[[...path]]`
 * - `/collections/[[...path]]`
 * - `/policies/[...path]`
 * - `/stones/[[...path]]`
 * - `/crystals/[[...path]]`
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
    test(`${variant.path} answers ${shows} to GET and HEAD, and its §7 answer to POST [${variant.kind} of ${variant.family}]`, async ({
      request,
    }) => {
      for (const method of MATRIX_METHODS) {
        // A 308 family redirects browsing and answers an action with its 410 page —
        // `expectationFor` is the one place that rule is written (contract §7).
        const { first, then } = expectationFor(variant, method, forbiddenRoutes)
        await expectHop(await send(request, method, variant.path), method, variant.path, first)
        if (then) {
          // The trailing-slash hop is Next's, not ours. What matters is that it lands on
          // the family's answer rather than on a page — so follow it by hand, same method.
          const next = first.location as string
          await expectHop(await send(request, method, next), method, next, then)
        }
      }
    })
  }
})

/**
 * **A stale action on a retired path must end somewhere a person can read.**
 *
 * Shopify's `/cart/add` is a POST, and so is `/account/login`. A 308, unlike a 301, obliges the
 * client to repeat the *same* method and body at the new location — so until 2026-09-27 a
 * product form submitted from a cached page or a restored tab re-POSTed to `/shop`, and what
 * `/shop` did with it depended on the encoding. Measured against `next start` (Next 16.3) at
 * `228fdaf`, following the chain the way a browser does:
 *
 * | Body | Where it ended |
 * |---|---|
 * | `application/x-www-form-urlencoded` | 200, the shelf — as if the action had simply worked |
 * | `multipart/form-data` (Dawn's product form) | 404 `text/plain` "Server action not found." |
 * | `text/plain` (the third HTML form enctype) | 405 `text/plain` "Method Not Allowed" |
 * | `application/json` (the AJAX cart API) | 405 |
 *
 * The block that stood here pinned that table as expected behaviour, so the suite was green on
 * a visitor dead end. The mechanism is in the build output: every prerendered page carries
 * `experimentalBypassFor: [next-action header, content-type multipart/form-data]`, so a
 * multipart POST skips the static page and lands in the server-action dispatcher, which has no
 * action to find. And `next.config.ts` redirects run before any application code sees the
 * method, so no fix at the destination could tell a stale cart POST from anything else.
 *
 * So the 308 families became route handlers (`retiredRoute()` in `src/lib/http/goneResponse.ts`):
 * GET and HEAD keep the 308 to the successor, and every other method answers the 410 page
 * that explains what happened, at the URL the visitor actually used. This block follows every
 * hop by hand — `maxRedirects: 0`, the method kept on a 307/308 and turned into GET on a 303,
 * as RFC 9110 §15.4 requires of the client — and judges only **the final, human-facing
 * response**: it must be the 410 explanation, never a framework 404/405/500 and never a 2xx
 * page that implies the action went through. No hop may mint a cookie.
 */
test.describe('Retired commerce routes — a stale action ends honestly', () => {
  type Encoding = 'urlencoded' | 'multipart' | 'text-plain' | 'json' | 'no-body'
  const ENCODINGS: readonly Encoding[] = ['urlencoded', 'multipart', 'text-plain', 'json', 'no-body']

  /** Shopify's own add-to-cart fields. Their content is irrelevant; their encoding is the point. */
  const CART_FIELDS = { id: '1', quantity: '1' }

  function bodyFor(encoding: Encoding) {
    switch (encoding) {
      case 'urlencoded':
        return { form: CART_FIELDS }
      case 'multipart':
        return { multipart: CART_FIELDS }
      case 'text-plain':
        return { data: 'id=1\r\nquantity=1\r\n', headers: { 'content-type': 'text/plain' } }
      case 'json':
        return { data: CART_FIELDS, headers: { 'content-type': 'application/json' } }
      case 'no-body':
        return {}
    }
  }

  /** One concrete URL per 308 row: the route itself, or a path beneath its `:path*` family. */
  const SOURCES = forbiddenRoutes
    .filter((r) => r.status === 308)
    .map((r) => {
      const prefix = wildcardPrefix(r.route)
      return prefix === null ? r.route : `${prefix}/add`
    })

  async function followByHand(request: APIRequestContext, path: string, encoding: Encoding) {
    let method = 'POST'
    let body: object = bodyFor(encoding)
    let current = path
    const hops: { method: string; path: string; status: number; setCookie: string | undefined }[] = []
    for (let i = 0; i < 5; i += 1) {
      const response = await request.fetch(current, { method, maxRedirects: 0, ...body })
      const headers = response.headers()
      hops.push({ method, path: current, status: response.status(), setCookie: headers['set-cookie'] })
      const location = headers['location']
      if (response.status() >= 300 && response.status() < 400 && location) {
        // 307 and 308 repeat the method and body; 303 (and, in practice, 301/302) become a GET.
        if (![307, 308].includes(response.status())) {
          method = 'GET'
          body = {}
        }
        const next = new URL(location, `http://origin${current}`)
        current = `${next.pathname}${next.search}`
        continue
      }
      return { final: response, hops }
    }
    throw new Error(`${path}: more than five hops — a loop, not a destination`)
  }

  test('there are retired paths with a successor to follow', () => {
    // Guard on the generator: a §7 parse with no 308 rows would generate no tests below.
    expect(SOURCES.length).toBeGreaterThanOrEqual(8)
  })

  for (const source of SOURCES) {
    test(`a stale POST to ${source} ends on the 410 explanation, whatever its encoding`, async ({ request }) => {
      for (const encoding of ENCODINGS) {
        const { final, hops } = await followByHand(request, source, encoding)
        const chain = hops.map((h) => `${h.method} ${h.path} → ${h.status}`).join(', ')
        const where = `${encoding} POST to ${source} (${chain})`
        const text = await final.text()

        expect(final.status(), `${where} ended on ${final.status()}: ${text.slice(0, 80)}`).toBe(410)
        expect(final.headers()['content-type'], `${where} is not a page a person can read`).toMatch(/^text\/html/)
        expect(text, `${where} ended on a framework message`).not.toMatch(/Server action not found|Method Not Allowed/i)
        // A next step, not just a status: the successor the GET would have reached, or a person.
        expect(text, `${where} offers no way on`).toMatch(/href="\/(shop|contact|legal)?"/)
        expect(final.headers()['x-robots-tag'], `${where} is indexable`).toMatch(/noindex/i)
        for (const hop of hops) {
          expect(hop.setCookie, `${where}: ${hop.method} ${hop.path} minted a cookie`).toBeUndefined()
        }
      }
    })
  }

  test('a stale multipart product form, submitted from a page, shows a person what happened', async ({ page }) => {
    // The request-level tests above cannot see what a browser renders. This is the scenario the
    // defect was about: a cached product page's form — `enctype="multipart/form-data"`, as the
    // old theme's was — submitted from this origin, landing wherever the browser takes it.
    await page.goto('/')
    const landed = page.waitForResponse((r) => new URL(r.url()).pathname === '/cart/add')
    await page.evaluate(() => {
      const form = document.createElement('form')
      form.method = 'post'
      form.action = '/cart/add'
      form.enctype = 'multipart/form-data'
      for (const [name, value] of Object.entries({ id: '1', quantity: '1' })) {
        const input = document.createElement('input')
        input.type = 'hidden'
        input.name = name
        input.value = value
        form.appendChild(input)
      }
      document.body.appendChild(form)
      form.submit()
    })
    const response = await landed
    await page.waitForLoadState('domcontentloaded')

    expect(response.status(), 'the form submission did not end on the 410').toBe(410)
    await expect(page.locator('h1')).toContainText(/no longer accepts online orders/i)
    await expect(page.locator('body')).not.toContainText(/Server action not found/i)
    await expect(page.locator('a[href="/shop"]')).toBeVisible()
  })
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
