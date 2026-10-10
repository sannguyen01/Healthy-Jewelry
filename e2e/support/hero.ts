import { expect, type Locator, type Page } from './test'
import { afterPaint, animationsFinished, settle } from './viewportFit'

/**
 * Where the home page's first screen is, found by structure and by content rather than by the class names of one
 * composition, so a failure names what a visitor lost: "the primary action is under the notice", not "a selector is
 * missing". Shared by every spec that measures the hero or the bar, so a copy edit breaks one place.
 */

export const hero = (page: Page): Locator => page.locator('main > section').first()
export const heroPhoto = (page: Page): Locator => hero(page).locator('img').first()
export const header = (page: Page): Locator => page.locator('header.hj-header')

/** Everything is placed and still: fonts loaded, the photograph decoded, no animation running. */
export async function settleHero(page: Page): Promise<void> {
  // The page itself first: it can still be on its streamed fallback with the real page in a hidden segment, where every
  // box is zero and a measurement passes having measured nothing (ADR 042).
  await settle(page)
  await expect(heroPhoto(page)).toBeVisible()
  await page.evaluate(async () => {
    await document.fonts.ready
    const img = document.querySelector<HTMLImageElement>('main > section img')
    if (img && !img.complete) await new Promise<void>((r) => { img.onload = img.onerror = () => r() })
    if (img) await img.decode().catch(() => undefined)
  })
  await animationsFinished(page)
  await afterPaint(page)
}

export type Labelled = { label: string; locator: Locator }

/** The text the hero's message depends on. */
export function copyNodes(page: Page): Labelled[] {
  const h = hero(page)
  return [
    { label: 'eyebrow', locator: h.getByText(/grade 23 titanium · niobium · 316l steel/i) },
    { label: 'headline', locator: h.getByRole('heading', { level: 1 }) },
    { label: 'body copy', locator: h.getByText(/no stones\. no fillers/i) },
    // By position, not by label: the labels are pinned by Hero.test.tsx, and a geometry test that fails
    // because a label changed has reported the label, not the geometry.
    { label: 'primary action', locator: h.getByRole('link').first() },
    { label: 'secondary action', locator: h.getByRole('link').nth(1) },
  ]
}

/** The header's controls. Visible ones only: below 769px CONTACT leaves the bar, below 360px the name does. */
export async function headerNodes(page: Page): Promise<Array<Labelled & { kind: 'text' | 'graphic' }>> {
  const bar = header(page)
  const nodes: Array<Labelled & { kind: 'text' | 'graphic' }> = [
    { label: 'MENU control', locator: bar.locator('.hj-menu-btn'), kind: 'text' },
    { label: 'brand name', locator: bar.locator('.hj-lockup-text'), kind: 'text' },
    { label: 'CONTACT link', locator: bar.getByRole('link', { name: /contact/i }), kind: 'text' },
  ]
  const search = bar.getByRole('button', { name: 'Search' })
  // The same button is a word at 769px and up and a magnifying glass below, and the two are held to
  // different ratios (WCAG 1.4.3 for text, 1.4.11 for a graphic).
  const asWord = await search.locator('.hj-desktop-text').isVisible()
  nodes.push({ label: 'search control', locator: search, kind: asWord ? 'text' : 'graphic' })

  const visible: typeof nodes = []
  for (const node of nodes) {
    if (await node.locator.first().isVisible()) visible.push(node)
  }
  return visible
}
