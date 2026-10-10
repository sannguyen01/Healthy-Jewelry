import { test, expect, type Page } from './support/test'
import AxeBuilder from '@axe-core/playwright'

/**
 * WCAG 2.1 AA, on every page and in the states a visitor reaches, in both projects (a desktop and a phone).
 *
 * It was four pages, `critical` impact only, and the homepage alone at `serious`. Widened 2026-10-09 to
 * every page route, the open menu and the contact form in error, with **no impact level exempt**: a
 * `moderate` finding (the search page had no `<h1>`) is a finding. An audit at that width found, beyond
 * what the narrow scan could see, a missing skip link (2.4.1), two sideways-scrolling tables a keyboard
 * could not reach (2.1.1), form fields that did not say what they were for (1.3.5), form errors that were
 * not announced (4.1.3), and a 404 with no landmarks and the home page's title.
 *
 * No element is excluded from these scans. The large faint ordinals are generated content now, so they are
 * not text and there is nothing to exclude; an escape hatch nothing uses is one a failure can hide in.
 *
 * **And axe is not the whole of it.** axe reads the DOM's text; a screen reader is handed the browser's
 * *accessibility tree*. They disagreed: every piece link on `/shop`, the collection pages and `/search`
 * (29 of them) had **no accessible name** in Chrome's tree — an `<article>` inside the `<a>` — and axe passed
 * all of them. The name census below reads the tree itself, through the protocol.
 */

const PAGES = [
  { name: 'Homepage', path: '/' },
  { name: 'Shop', path: '/shop' },
  { name: 'Collection', path: '/shop/earrings' },
  { name: 'Product detail', path: '/products/arc-hoops-titanium' },
  { name: 'About', path: '/about' },
  { name: 'Materials', path: '/materials' },
  { name: 'Search results', path: '/search?q=titanium' },
  { name: 'Search, no query', path: '/search' },
  { name: 'Contact', path: '/contact' },
  { name: 'FAQ', path: '/faq' },
  { name: 'Shipping', path: '/shipping' },
  { name: 'Terms', path: '/terms' },
  { name: 'Privacy', path: '/privacy' },
  { name: 'Legal', path: '/legal' },
  { name: 'Stores', path: '/stores' },
  { name: 'Not found', path: '/this-page-does-not-exist', status: 404 },
]

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice']

/**
 * Scanning mid-animation reads blended colours, not the ones that ship. The hero and the scroll-reveal
 * sections fade their content in, and axe faithfully measures whatever is on screen — `--graphite`
 * part-way through a fade from `--bg` computes as #d8d5d1 and reports a contrast failure that does not
 * exist once the transition lands. `globals.css` already collapses every transition under
 * `prefers-reduced-motion`, so this both removes the flake and exercises a path the site genuinely ships.
 */
test.use({ contextOptions: { reducedMotion: 'reduce' } })

/**
 * The hero enters on a CSS stagger, so its children pass through opacity 0 on the way to 1 unless motion is
 * reduced — and the consent notice and the scroll-reveal sections animate too. axe skips fully transparent
 * elements, so that is harmless, but waiting for the animations to finish makes the scan deterministic
 * rather than dependent on when axe happens to run. "No animation is running" resolves on every page; a
 * blanket "nothing is at opacity 0" never does, because plenty of elements are legitimately transparent —
 * hover-only specifications, closed drawers. (This waited for the hero's inline JS `transition` until
 * ADR 054 made the entrance CSS.)
 */
async function waitForHeroToSettle(page: Page): Promise<void> {
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running'))
}

/**
 * The consent notice is part of what a first-time visitor sees, so the scans run with it up and with it
 * answered. It renders after hydration (the answer lives in localStorage, which the server cannot read), so
 * "is it there?" is asked by waiting for it, not by counting once: counting raced the mount in two of 112 runs
 * and skipped the click.
 */
const consent = (page: Page) => page.getByRole('dialog', { name: 'Analytics consent' })

async function awaitConsentNotice(page: Page): Promise<void> {
  await expect(consent(page)).toBeVisible()
}

async function answerConsent(page: Page): Promise<void> {
  await awaitConsentNotice(page)
  await page.getByRole('button', { name: 'Decline' }).click()
  await expect(consent(page)).toHaveCount(0)
}

async function scan(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(TAGS).analyze()
  return results.violations.map(
    (v) => `[${v.impact}] ${v.id}: ${v.help}\n      ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join('\n      ')}`
  )
}

test.describe('Accessibility — every page, any impact', () => {
  for (const { name, path, status } of PAGES) {
    test(`${name}: no axe violation, with the consent notice up and once answered`, async ({ page }) => {
      const response = await page.goto(path)
      if (status) expect(response?.status()).toBe(status)
      await expect(page.locator('main#main')).toBeVisible()
      await waitForHeroToSettle(page)

      await awaitConsentNotice(page)
      expect(await scan(page), `${name}, consent notice showing`).toEqual([])
      await answerConsent(page)
      expect(await scan(page), `${name}, consent answered`).toEqual([])
    })
  }
})

test.describe('Accessibility — states', () => {
  test('the open menu has no axe violation', async ({ page }) => {
    await page.goto('/')
    await answerConsent(page)
    await page.getByRole('button', { name: /menu/i }).first().click()
    await expect(page.locator('.hj-menu-link').first()).toBeVisible()
    await page.waitForTimeout(500)
    expect(await scan(page)).toEqual([])
  })

  test('the contact form in error has no axe violation, and moves focus to the first invalid field', async ({ page }) => {
    await page.goto('/contact')
    await answerConsent(page)
    await page.getByRole('button', { name: /send message/i }).click()
    await expect(page.getByRole('alert').first()).toBeVisible()
    // WCAG 3.3.1: focus lands where the first problem is, so its message is read with it.
    await expect(page.locator('#cf-name')).toBeFocused()
    expect(await scan(page)).toEqual([])
  })

  test('the contact form says what its fields are for (autocomplete, WCAG 1.3.5)', async ({ page }) => {
    await page.goto('/contact')
    await expect(page.locator('#cf-name')).toHaveAttribute('autocomplete', 'name')
    await expect(page.locator('#cf-email')).toHaveAttribute('autocomplete', 'email')
  })
})

test.describe('Accessibility — the tree a screen reader is handed', () => {
  /**
   * Every link and control that is exposed has a name. Read from Chrome's accessibility tree, not the DOM:
   * an `<article>` inside an `<a>` left 29 piece links nameless while axe, reading text, passed them.
   */
  const NAMED_ROLES = new Set(['link', 'button', 'textbox', 'combobox', 'searchbox', 'checkbox', 'radio', 'tab'])

  for (const { name, path } of PAGES.filter((p) => !p.status)) {
    test(`${name}: every link and control has an accessible name`, async ({ page }) => {
      await page.goto(path)
      await expect(page.locator('main#main')).toBeVisible()
      await answerConsent(page)
      const cdp = await page.context().newCDPSession(page)
      try {
        await cdp.send('Accessibility.enable')
        const { nodes } = await cdp.send('Accessibility.getFullAXTree')
        const nameless = nodes
          .filter((n) => !n.ignored && n.role && NAMED_ROLES.has(String(n.role.value)))
          .filter((n) => !String(n.name?.value ?? '').trim())
          .map((n) => `${String(n.role?.value)} (${(n.properties ?? []).find((p) => p.name === 'url')?.value?.value ?? n.nodeId})`)
        const total = nodes.filter((n) => !n.ignored && n.role && NAMED_ROLES.has(String(n.role.value))).length
        expect(total, `${path} exposes links and controls to measure`).toBeGreaterThan(3)
        expect(nameless).toEqual([])
      } finally {
        await cdp.detach()
      }
    })
  }

  test('a piece link is named for the piece, badge and metal included, not for its hover specification', async ({ page }) => {
    await page.goto('/shop')
    await answerConsent(page)
    const link = page.getByRole('link', { name: /Arc Band/ }).first()
    await expect(link).toBeVisible()
    const name = (await link.getAttribute('aria-label')) ?? (await link.innerText())
    expect(name).toMatch(/Arc Band/i)
    // The specification ("2 mm · 1.8 g") is decorative to a screen reader: it came first in the DOM and
    // made every name begin with a measurement.
    await expect(page.locator('.hj-card-link [data-spec]').first()).toHaveAttribute('aria-hidden', 'true')
  })

  test('every page has exactly one h1', async ({ page }) => {
    const bad: string[] = []
    for (const { path } of PAGES) {
      await page.goto(path)
      await expect(page.locator('main#main')).toBeVisible()
      const count = await page.locator('h1:visible').count()
      if (count !== 1) bad.push(`${path}: ${count}`)
    }
    expect(bad).toEqual([])
  })

  test('the 404 has the site\'s landmarks and says what it is in its title', async ({ page }) => {
    await page.goto('/this-page-does-not-exist')
    await expect(page.locator('header').first()).toBeVisible()
    await expect(page.locator('main#main')).toHaveCount(1)
    await expect(page.locator('footer')).toBeVisible()
    await expect(page).toHaveTitle(/not found/i)
  })
})

test.describe('Accessibility — bypass blocks (WCAG 2.4.1)', () => {
  for (const { name, path } of PAGES.filter((p) => !p.status).slice(0, 6)) {
    test(`${name}: the first Tab stop is a skip link that lands in the main content`, async ({ page }) => {
      await page.goto(path)
      await answerConsent(page)
      await page.keyboard.press('Tab')
      const skip = page.getByRole('link', { name: 'Skip to content' })
      await expect(skip).toBeFocused()
      // It is off screen until focused, then fully on it.
      const box = await skip.boundingBox()
      expect(box && box.y >= 0 && box.y + box.height <= 200, `skip link is on screen when focused: ${JSON.stringify(box)}`).toBe(true)
      await page.keyboard.press('Enter')
      await expect(page.locator('main#main')).toBeFocused()
    })
  }

  test('every page has a main landmark that is the skip link\'s target', async ({ page }) => {
    for (const { path } of PAGES) {
      await page.goto(path)
      await expect(page.locator('main#main'), path).toHaveCount(1)
    }
  })
})
