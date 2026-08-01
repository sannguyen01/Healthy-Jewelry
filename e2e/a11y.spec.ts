import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

/**
 * Elements carrying `data-decorative` are pure ornament — currently the oversized
 * ordinal numerals in MaterialsSection. They are `aria-hidden`, convey nothing the
 * adjacent heading does not, and are deliberately faint against `--bg`.
 *
 * WCAG 1.4.3 exempts pure decoration from the contrast minimum, so they are
 * excluded here rather than darkened. axe cannot infer intent, so the exemption
 * is declared in one place and applied to every scan below — a recorded,
 * reviewable decision instead of a permanently red check nobody reads.
 *
 * This is deliberately a narrow attribute selector, not a blanket
 * `[aria-hidden="true"]` exclusion: hiding a whole subtree from axe would also
 * hide genuine failures inside it.
 */
const DECORATIVE = '[data-decorative]'

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
      // Wait for main content to be rendered
      await expect(page.locator('main')).toBeVisible()

      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .exclude(DECORATIVE)
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

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .exclude(DECORATIVE)
      .analyze()

    const serious = results.violations.filter((v) => v.impact === 'serious')
    expect(
      serious,
      `Serious a11y violations on Homepage:\n${serious.map((v) => `  [${v.id}] ${v.description}`).join('\n')}`,
    ).toHaveLength(0)
  })
})
