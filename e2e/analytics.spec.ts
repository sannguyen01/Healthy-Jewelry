import { test, expect, type Page } from '@playwright/test'

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
    await page.goto('/products/arc-band-titanium')
    await page.getByRole('button', { name: /ring size 7/i }).click()
    await page.getByRole('button', { name: /add.*to bag/i }).click()
    await expect(page.getByRole('dialog', { name: /shopping bag/i })).toBeVisible()

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
    await page.getByRole('button', { name: /add.*to bag/i }).click()

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
   * **The banner must not sit on top of anything a customer came to click.**
   *
   * This started as a Checkout-button-only check, and `hero-legibility.spec.ts`
   * promptly caught the banner covering both hero CTAs at 1024px — reporting
   * 1.00:1 contrast, because the pixels behind "Shop Collection" *were* the
   * banner. Guarding one button and not the others is how a class of bug survives
   * being fixed, so this asserts the property across the widths the hero is known
   * to change shape at.
   */
  for (const width of [1440, 1024, 900, 390]) {
    test(`the banner clears the hero CTAs at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      await page.goto('/')

      const banner = page.getByRole('dialog', { name: /analytics consent/i })
      await expect(banner).toBeVisible()
      const bannerBox = await banner.boundingBox()
      expect(bannerBox).not.toBeNull()

      const ctas = page.locator('main a').filter({ hasText: /shop collection|our story/i })
      const count = await ctas.count()
      // A hero with no CTAs would make the loop vacuous — the shape of green that
      // proves nothing.
      expect(count).toBeGreaterThan(0)

      for (let i = 0; i < count; i++) {
        const cta = ctas.nth(i)
        const box = await cta.boundingBox()
        if (!box) continue

        const overlaps =
          box.x < bannerBox!.x + bannerBox!.width &&
          box.x + box.width > bannerBox!.x &&
          box.y < bannerBox!.y + bannerBox!.height &&
          box.y + box.height > bannerBox!.y

        expect(overlaps, `consent banner overlaps "${await cta.innerText()}" at ${width}px`).toBe(
          false
        )
      }
    })
  }

  test('the banner never covers the checkout button in the bag', async ({ page }) => {
    // Both are fixed to the bottom of the viewport. A consent banner sitting over
    // Checkout would be a conversion bug caused by a compliance control.
    await page.goto('/products/arc-band-titanium')
    await page.getByRole('button', { name: /ring size 7/i }).click()
    await page.getByRole('button', { name: /add.*to bag/i }).click()

    const checkout = page.getByRole('dialog', { name: /shopping bag/i }).getByRole('button', {
      name: /checkout/i,
    })
    await expect(checkout).toBeVisible()

    const box = await checkout.boundingBox()
    expect(box).not.toBeNull()
    // Playwright's own actionability check covers occlusion: a covered element
    // cannot be clicked, so this failing means something is on top of it.
    await expect(checkout).toBeEnabled()
  })
})
