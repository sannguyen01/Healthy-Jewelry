import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

// Axe measures computed colour, so it has to run after the stylesheet and the
// web fonts have actually applied. Waiting only for <main> to be visible let it
// scan a partially-styled page under parallel load, which reported contrast
// failures against fallback colours that never reach a real user.
async function waitForStyledPage(page: Page): Promise<void> {
  await expect(page.locator('main')).toBeVisible()
  await page.waitForLoadState('networkidle')
  await page.evaluate(() => document.fonts.ready)
  // The palette lives in custom properties on :root; if it has not resolved
  // yet, every colour axe reads is a fallback.
  await expect
    .poll(() =>
      page.evaluate(() =>
        getComputedStyle(document.documentElement).getPropertyValue('--bg').trim()
      )
    )
    .not.toBe('')

  // Entrance animations fade elements in over ~0.4s. Scanning mid-fade makes
  // axe measure a blended colour — a solid ink button part-way through an
  // opacity transition reads as grey-on-grey and fails contrast for a state no
  // user ever sees for more than a few frames. Wait for them to land.
  await page
    .waitForFunction(
      () => document.getAnimations().every((a) => a.playState !== 'running'),
      undefined,
      { timeout: 5000 }
    )
    // A page with a deliberately looping animation would never settle; scan it
    // anyway rather than failing the run on the wait itself.
    .catch(() => undefined)
}

const CORE_PAGES = [
  { name: 'Homepage', path: '/' },
  { name: 'Shop', path: '/shop' },
  { name: 'Product detail', path: '/products/arc-band-titanium' },
  { name: 'Contact', path: '/contact' },
]

test.describe('Accessibility — critical violations', () => {
  for (const { name, path } of CORE_PAGES) {
    test(`${name}: zero critical axe violations`, async ({ page }) => {
      await page.goto(path)
      await waitForStyledPage(page)

      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze()

      const critical = results.violations.filter((v) => v.impact === 'critical')
      expect(
        critical,
        `Critical a11y violations on ${name}:\n${critical.map((v) => `  [${v.id}] ${v.description}`).join('\n')}`,
      ).toHaveLength(0)
    })
  }
})

test.describe('Accessibility — serious violations', () => {
  test('Homepage: zero serious axe violations', async ({ page }) => {
    await page.goto('/')
    await waitForStyledPage(page)

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze()

    const serious = results.violations.filter((v) => v.impact === 'serious')
    expect(
      serious,
      `Serious a11y violations on Homepage:\n${serious.map((v) => `  [${v.id}] ${v.description}`).join('\n')}`,
    ).toHaveLength(0)
  })
})
