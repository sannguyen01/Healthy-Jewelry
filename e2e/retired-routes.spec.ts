import { test, expect } from '@playwright/test'

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
    path: '/checkout',
    status: 410,
    location: null,
    why: 'a withdrawn capability has no successor — 410 is final where 404 invites re-crawling',
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

  test('the checkout 410 explains itself to a human', async ({ request }) => {
    // A bare 410 is correct for a crawler and useless to the customer who followed an old
    // link from an email. The body is the difference between "this is broken" and "this
    // brand stopped selling online, here is what to do instead".
    const response = await request.get('/checkout', { maxRedirects: 0 })
    const body = await response.text()

    expect(body).toMatch(/no longer accepts online orders/i)
    expect(body).toMatch(/ambassador/i)
    expect(body).toContain('/contact')
  })

  test('the checkout 410 is not indexable', async ({ request }) => {
    const response = await request.get('/checkout', { maxRedirects: 0 })
    expect(response.headers()['x-robots-tag']).toMatch(/noindex/i)
  })

  test('a stale POST to checkout is also gone, not 405', async ({ request }) => {
    // An old form re-submitted from a restored tab must get the same answer. 405 Method
    // Not Allowed would suggest the resource exists and the verb is wrong.
    const response = await request.post('/checkout', { maxRedirects: 0 })
    expect(response.status()).toBe(410)
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

/*
 * 'Unknown product handles' — a true 404 for a handle the catalogue does not hold — is
 * acceptance criterion 4 and is **not** asserted here yet.
 *
 * It cannot be, honestly. `dynamicParams = false` is what makes that 404 real, and while
 * `products/[handle]/page.tsx` still reads from `@/lib/shopify` the soft 404 is the correct
 * behaviour: `generateStaticParams` enumerates what Shopify held at build time, so a hard
 * 404 would break any product added since the last deploy. That trade-off is documented in
 * the page itself and mitigated with `robots: noindex`.
 *
 * The premise expires when the data source moves to `@/lib/catalog`, and
 * `src/tests/unit/soft-404-premise.test.ts` fails the moment it does without
 * `dynamicParams = false` beside it. These assertions arrive in the same change, not before
 * — a test written against behaviour the code is deliberately not exhibiting yet is a
 * failing test with a good excuse, which is how a suite learns to be ignored.
 */
