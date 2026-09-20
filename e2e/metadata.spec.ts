import { test, expect } from '@playwright/test'

/**
 * The product page read Shopify in its body and the static catalogue in its
 * `generateMetadata`. Because the two catalogues are nearly disjoint, 20 of the
 * 22 live products served `<title>Product Not Found</title>` from a page that
 * rendered perfectly — the browser tab, the Google result, and every shared
 * link, all saying the product does not exist.
 *
 * **What this spec can and cannot prove.** E2E runs without Shopify
 * credentials, so both sources return the same static catalogue here and the
 * specific production bug cannot reproduce. These assertions guard the
 * *regression* — a page that renders a product but titles it "not found" is
 * incoherent regardless of which catalogue it came from, and that incoherence
 * is checkable offline.
 *
 * Proving the live fix needs the real store: `scripts/verify-production.mjs`
 * fetches a Shopify-only handle and asserts the same properties there.
 */

const HANDLE = 'arc-band-titanium'

test.describe('Product metadata', () => {
  test('title names the product, never "Product Not Found"', async ({ page }) => {
    await page.goto(`/products/${HANDLE}`)

    const h1 = page.getByRole('heading', { level: 1 })
    await expect(h1).toBeVisible()
    const rendered = (await h1.textContent())?.trim() ?? ''
    expect(rendered.length).toBeGreaterThan(0)

    const title = await page.title()
    expect(title).not.toMatch(/product not found/i)
    // The page rendered this product; the tab must agree it exists.
    expect(title.toLowerCase()).toContain(rendered.toLowerCase())
  })

  test('Open Graph tags describe the product, not the site default', async ({ page }) => {
    await page.goto(`/products/${HANDLE}`)

    const ogTitle = await page.locator('meta[property="og:title"]').getAttribute('content')
    expect(ogTitle, 'og:title is missing — the share card falls back to site defaults').toBeTruthy()
    expect(ogTitle).not.toMatch(/product not found/i)
    // 'Product' exactly was what the OG image rendered for every real product.
    expect(ogTitle?.trim()).not.toBe('Product')

    const ogDescription = await page
      .locator('meta[property="og:description"]')
      .getAttribute('content')
    expect(ogDescription?.trim().length ?? 0).toBeGreaterThan(0)
  })

  test('the Open Graph image route returns a real PNG', async ({ request }) => {
    // The route threw at request time for every crawl — compiling, deploying,
    // and failing only when something actually asked for the image.
    const res = await request.get(`/products/${HANDLE}/opengraph-image`)

    expect(res.status()).toBe(200)
    expect(res.headers()['content-type']).toContain('image/png')
    // A Satori failure can still yield a 200 with a near-empty body.
    expect((await res.body()).byteLength).toBeGreaterThan(1000)
  })

  test('a nonexistent product does not render as a product', async ({ page }) => {
    await page.goto('/products/this-product-does-not-exist')
    await expect(page.getByRole('heading', { level: 1 })).not.toContainText(/titanium/i)
  })

  /**
   * **The `noindex` mitigation is gone, because the thing it mitigated is gone.**
   *
   * What stood here asserted that `/products/<unknown>` carried `noindex, nofollow`. The
   * reasoning was sound at the time and is worth keeping on the record: that URL answered
   * **HTTP 200** while rendering `not-found.tsx`, and no code in the page could change it —
   * Next returns 200 for streamed responses, and the route could not use
   * `dynamicParams = false` without hard-404ing any product newly added in Shopify Admin.
   * So the *harm* was addressed instead of the status, with `noindex`, which removes a URL
   * from the index where a `robots.txt` disallow would not.
   *
   * After [ADR 034](../docs/adr/034-the-catalogue-is-the-source.md) the handle set is closed
   * — nobody can add a product anywhere but this repository — so `dynamicParams = false`
   * makes the status honest and Next's own 404 renders. `generateMetadata` is never reached
   * for an unknown handle, so there is no `noindex` to assert and asserting one would fail
   * for correct behaviour.
   *
   * `e2e/retired-routes.spec.ts` owns the replacement, and it is a stronger claim: the
   * status code itself, read with `request.get()`. A 404 needs no meta tag to stay out of an
   * index.
   */
  test('a nonexistent product is a real 404, which needs no noindex', async ({ request }) => {
    const response = await request.get('/products/this-product-does-not-exist', {
      maxRedirects: 0,
    })

    expect(
      response.status(),
      'An unknown handle answered 200. That is a soft 404: the page says "not found" while ' +
        'the status line says the URL is fine, so a crawler indexes it. Check that ' +
        '`dynamicParams = false` is still exported from products/[handle]/page.tsx.'
    ).toBe(404)
  })

  test('a real product is NOT noindex', async ({ page }) => {
    // The counterpart risk, and the more damaging direction: a noindex that leaked onto
    // real products would quietly deindex the entire catalogue.
    await page.goto(`/products/${HANDLE}`)

    const robots = await page.locator('meta[name="robots"]').evaluateAll((tags) =>
      tags.map((t) => t.getAttribute('content') ?? ''),
    )

    expect(robots.every((c) => !/noindex/.test(c)), `robots tags: ${robots.join(' | ')}`).toBe(
      true,
    )
  })

  test('an unknown collection is a real 404, not a soft one', async ({ page }) => {
    // Collections are a closed set, so `dynamicParams = false` rejects unknown params
    // before rendering begins — which is the one place the status is still ours to set.
    const res = await page.goto('/shop/not-a-collection')
    expect(res?.status()).toBe(404)
  })

  test('a real collection still renders', async ({ page }) => {
    // dynamicParams = false is only safe while every real collection is in
    // generateStaticParams. If one is ever missed, it 404s — and that looks like a routing
    // bug rather than a missing entry.
    const res = await page.goto('/shop/rings')
    expect(res?.status()).toBe(200)
  })
})

test.describe('Search', () => {
  test('finds a product by a term in its title', async ({ page }) => {
    await page.goto('/search?q=titanium')

    // Searched the static catalogue from the browser before this change, so it
    // could not find any product actually for sale.
    await expect(page.getByText(/result(s)? for "titanium"/i)).toBeVisible()
    await expect(page.locator('a[href^="/products/"]').first()).toBeVisible()
  })

  test('an empty query invites a search rather than listing everything', async ({ page }) => {
    // `searchProducts('')` matches every product, so the empty case is answered
    // before it is ever called. Regressing that turns a landing state into an
    // accidental full-catalogue dump.
    await page.goto('/search')

    await expect(page.getByText(/start typing to search/i)).toBeVisible()
    await expect(page.locator('a[href^="/products/"]')).toHaveCount(0)
  })
})
