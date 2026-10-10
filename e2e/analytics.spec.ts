import { test, expect, type Page } from './support/test'

/**
 * **Nothing is measured until someone says yes.**
 *
 * The store ships to 29 countries, fourteen of them in the EU, so a consent gate
 * that fails open is not a preference — it is a compliance problem wearing the
 * costume of a feature. `analytics.test.ts` pins the gate as a pure function;
 * this pins the thing that actually matters, which is whether a *real browser on
 * a real page* puts anything on the wire before the visitor has answered.
 *
 * That distinction is the whole reason this file exists. A unit test cannot see a
 * `sendBeacon` fired from a component that forgot to route through the façade,
 * and "eleven of twelve call sites are gated" looks exactly like twelve.
 */

/** Every request the page makes to the analytics sink. */
function recordAnalyticsRequests(page: Page): string[] {
  const hits: string[] = []
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/api/analytics') hits.push(request.method())
  })
  return hits
}

test.describe('Analytics consent', () => {
  test('the banner appears on a first visit', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('dialog', { name: /analytics consent/i })).toBeVisible()
  })

  test('offers Allow and Decline with equal weight', async ({ page }) => {
    await page.goto('/')
    const banner = page.getByRole('dialog', { name: /analytics consent/i })

    // A "reject" hidden behind a link is a dark pattern whatever the copy says,
    // so both are real buttons.
    await expect(banner.getByRole('button', { name: /^allow$/i })).toBeVisible()
    await expect(banner.getByRole('button', { name: /^decline$/i })).toBeVisible()
  })

  test('sends nothing at all before the visitor answers', async ({ page }) => {
    const hits = recordAnalyticsRequests(page)

    // A full browsing session — the events that would fire if the gate leaked.
    // `product_viewed` fires on load and the size picker is still interactive. The bag
    // seeding and drawer step are gone with the cart; this test was never about those,
    // it asserts the transport sends *nothing at all* before consent.
    await page.goto('/products/arc-band-titanium')
    await page.getByRole('button', { name: /ring size 7/i }).click()

    expect(hits, 'analytics fired before consent was given').toEqual([])
  })

  test('still sends nothing after Decline', async ({ page }) => {
    const hits = recordAnalyticsRequests(page)

    await page.goto('/')
    await page.getByRole('dialog', { name: /analytics consent/i })
      .getByRole('button', { name: /^decline$/i })
      .click()

    await page.goto('/products/arc-band-titanium')
    await page.getByRole('button', { name: /ring size 7/i }).click()

    expect(hits, 'analytics fired after the visitor declined').toEqual([])
  })

  test('sends after Allow — otherwise the gate is just an off switch', async ({ page }) => {
    const hits = recordAnalyticsRequests(page)

    await page.goto('/')
    await page.getByRole('dialog', { name: /analytics consent/i })
      .getByRole('button', { name: /^allow$/i })
      .click()

    await page.goto('/products/arc-band-titanium')
    // The granted branch is the one that never runs in CI unless something like
    // this runs it. A consent gate observed only saying "no" is not a gate, it is
    // a feature that does not work.
    await expect.poll(() => hits.length, { message: 'no analytics after consent' }).toBeGreaterThan(0)
  })

  test('the answer sticks across navigations', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('dialog', { name: /analytics consent/i })
      .getByRole('button', { name: /^decline$/i })
      .click()

    await page.goto('/shop')
    // Re-asking someone who already answered is the most common way a consent
    // banner becomes the thing people hate about a site.
    await expect(page.getByRole('dialog', { name: /analytics consent/i })).toHaveCount(0)
  })

  /**
   * **Withdrawing consent is as easy as giving it.**
   *
   * Until 2026-09-27 the banner appeared once, and the only way to take an Allow back was
   * clearing this site's data in the browser. "Measurement preferences" in the footer now
   * reopens the same prompt, and `track()` reads the stored answer on every call — so the
   * assertion is behavioural: the beacon count must stop moving the moment Decline is pressed.
   */
  test('a visitor can withdraw from the footer, and the next page sends nothing', async ({ page }) => {
    const hits = recordAnalyticsRequests(page)

    await page.goto('/')
    await page.getByRole('dialog', { name: /analytics consent/i }).getByRole('button', { name: /^allow$/i }).click()
    await page.goto('/products/arc-band-titanium')
    await expect.poll(() => hits.length, { message: 'no analytics after consent' }).toBeGreaterThan(0)

    await page.getByTestId('measurement-preferences').first().click()
    const banner = page.getByRole('dialog', { name: /analytics consent/i })
    await expect(banner).toBeVisible()
    await expect(banner).toContainText(/currently allowed/i)
    await expect(banner.getByRole('button', { name: /^allow$/i })).toHaveAttribute('aria-pressed', 'true')
    await banner.getByRole('button', { name: /^decline$/i }).click()
    await expect(banner).toHaveCount(0)

    const before = hits.length
    await page.goto('/products/disc-studs-titanium')
    await page.waitForLoadState('networkidle')
    expect(hits.length, 'analytics fired after the visitor withdrew consent').toBe(before)
  })

  test('the withdrawal control is on every page footer and on the privacy page', async ({ page }) => {
    // Literal navigations, one per page, so spec-anchor-contract can resolve each of them.
    const footerControl = () => page.locator('footer').getByTestId('measurement-preferences')
    await page.goto('/')
    await expect(footerControl(), '/').toHaveCount(1)
    await page.goto('/shop')
    await expect(footerControl(), '/shop').toHaveCount(1)
    await page.goto('/privacy')
    await expect(footerControl(), '/privacy').toHaveCount(1)
    await expect(page.locator('main').getByTestId('measurement-preferences')).toHaveCount(1)
  })

  /**
   * **A search puts no words on the wire.** The beacon carried the query until 2026-09-27; it
   * now carries the collections and metals the query named. Asserted on the request body a
   * real browser sends, for a query shaped like the thing it must never carry.
   */
  test('a search beacon carries what was named, never what was typed', async ({ page }) => {
    const bodies: string[] = []
    await page.route('**/api/analytics', async (route) => {
      bodies.push(route.request().postData() ?? '')
      await route.fulfill({ status: 204 })
    })

    await page.goto('/')
    await page.getByRole('dialog', { name: /analytics consent/i }).getByRole('button', { name: /^allow$/i }).click()
    // `customer@example.com ring`, percent-encoded as a literal the anchor scan can resolve.
    await page.goto('/search?q=customer%40example.com%20ring')
    await expect.poll(() => bodies.some((b) => b.includes('search_performed'))).toBe(true)

    const search = JSON.parse(bodies.find((b) => b.includes('search_performed')) as string)
    expect(search).toEqual({ name: 'search_performed', resultCount: 0, facets: ['rings'] })
    for (const body of bodies) expect(body).not.toContain('customer@example.com')
  })

  /**
   * **The banner must not sit on top of anything a visitor came to read or click in the hero.**
   *
   * This started as a Checkout-button-only check, and `hero-legibility.spec.ts` promptly caught the banner
   * covering both hero CTAs at 1024px — reporting 1.00:1 contrast, because the pixels behind the button
   * *were* the banner. Guarding one button and not the others is how a class of bug survives being fixed, so
   * this asserts the property across the widths the hero is known to change shape at, and for every piece of
   * the hero's copy, not only the actions: since ADR 054 the copy sits in the lower part of a phone's first
   * screen, exactly where a bottom-anchored notice lands, so the hero rides above the notice's published
   * height. (The matrix over all eleven widths, including the phones too short for both, is in
   * `hero-legibility.spec.ts`.)
   */
  for (const width of [1440, 1024, 900, 390]) {
    test(`the banner clears the hero's copy and actions at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      await page.goto('/')

      const banner = page.getByRole('dialog', { name: /analytics consent/i })
      await expect(banner).toBeVisible()
      // The hero rides above the notice's height once the notice has published it.
      await page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))))
      await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running'))
      const bannerBox = await banner.boundingBox()
      expect(bannerBox).not.toBeNull()

      const hero = page.locator('main > section').first()
      const nodes = [
        hero.getByText(/grade 23 titanium · niobium · 316l steel/i),
        hero.getByRole('heading', { level: 1 }),
        hero.getByText(/no stones\. no fillers/i),
        hero.getByRole('link'),
      ]
      let measured = 0
      for (const node of nodes) {
        const count = await node.count()
        for (let i = 0; i < count; i++) {
          const target = node.nth(i)
          const box = await target.boundingBox()
          if (!box) continue
          measured++

          const overlaps =
            box.x < bannerBox!.x + bannerBox!.width &&
            box.x + box.width > bannerBox!.x &&
            box.y < bannerBox!.y + bannerBox!.height &&
            box.y + box.height > bannerBox!.y

          expect(overlaps, `consent banner overlaps "${(await target.innerText()).trim()}" at ${width}px`).toBe(false)
        }
      }
      // A hero with nothing to measure would make the loop vacuous — the shape of green that proves nothing.
      expect(measured).toBeGreaterThanOrEqual(5)
    })
  }

  /*
   * 'the banner never covers the checkout button in the bag' was here.
   *
   * Two fixed-to-bottom elements, one of which could hide the other — a conversion bug
   * caused by a compliance control. There is no Checkout button and no bag.
   *
   * The generalisable half survives above: the loop over CTAs at several widths still
   * asserts the banner overlaps nothing it should not. Any new bottom-anchored control
   * belongs in that list, which is why it is a list rather than a test per control.
   */
})
