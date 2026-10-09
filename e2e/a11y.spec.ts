import { test, expect, type Page } from './support/test'
import AxeBuilder from '@axe-core/playwright'

/**
 * No element is excluded from these scans. Until ADR 051 (B4) the homepage's oversized `01 / 02 / 03`
 * ordinals were `--ash` on `--bg` (1.36:1), exempt from WCAG 1.4.3 as decoration, and carried
 * `data-decorative` so this file could exclude them by a narrow attribute match. They are text at
 * `--ink-2` in the label voice now, beside a metal's provenance dot, and clear 4.5:1 like everything
 * else, so the exemption went with them. An escape hatch nothing uses is one a failure can hide in.
 */

const CORE_PAGES = [
  { name: 'Homepage', path: '/' },
  { name: 'Shop', path: '/shop' },
  { name: 'Product detail', path: '/products/arc-band-titanium' },
  { name: 'Contact', path: '/contact' },
]

/**
 * Scanning mid-animation reads blended colours, not the ones that ship. The
 * hero and the scroll-reveal sections fade their content in, and axe faithfully
 * measures whatever is on screen — `--graphite` part-way through a fade from
 * `--bg` computes as #d8d5d1 and reports a contrast failure that does not exist
 * once the transition lands. `globals.css` already collapses every transition
 * under `prefers-reduced-motion`, so this both removes the flake and exercises a
 * path the site genuinely ships.
 */
test.use({ contextOptions: { reducedMotion: 'reduce' } })

/**
 * The hero additionally drives its stagger from JS timers, so its children pass
 * through opacity 0 before landing on 1 even with transitions collapsed. axe
 * skips fully transparent elements, so that is harmless — but waiting for them
 * makes the scan deterministic rather than dependent on when axe happens to run.
 *
 * Scoped deliberately to the hero: a blanket "nothing is at opacity 0" wait
 * never resolves, because plenty of elements are legitimately transparent for
 * good — hover-only product spec overlays, closed drawers — and polling for them
 * simply burns the timeout.
 */
async function waitForHeroToSettle(page: Page): Promise<void> {
  const heroContent = page.locator('.hj-hero-content')
  if ((await heroContent.count()) === 0) return
  await page.waitForFunction(() => {
    const content = document.querySelector('.hj-hero-content')
    if (!content) return true
    return Array.from(content.children).every((child) => getComputedStyle(child).opacity === '1')
  })
}

test.describe('Accessibility — critical violations', () => {
  for (const { name, path } of CORE_PAGES) {
    test(`${name}: zero critical axe violations`, async ({ page }) => {
      await page.goto(path)
      // Wait for main content to be rendered
      await expect(page.locator('main')).toBeVisible()
      await waitForHeroToSettle(page)

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
    await expect(page.locator('main')).toBeVisible()
    await waitForHeroToSettle(page)

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
