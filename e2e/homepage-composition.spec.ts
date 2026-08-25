import { test, expect, type Page } from '@playwright/test'

/**
 * The homepage as a composition, rather than as a bag of sections.
 *
 * Every other homepage assertion in this suite is a single-element existence check, and each
 * one passes no matter what surrounds it. That is not an oversight in any individual spec —
 * it is what per-component testing *is*. The consequence is that the page's sequence, the
 * thing `CLAUDE.md` documents as a design decision, has never been verified at all: until
 * 2026-08-25 you could delete `<MaterialsSection />` and all twelve tests in
 * `homepage.spec.ts` still passed (measured, not supposed).
 *
 * The failure mode this file is built against is the one ADR 013 names: a guardrail that is
 * satisfied *better* the more of something you add. Add a fourth identical scroll strip and
 * every existing assertion gets greener — more product links, more material names, more
 * everything. Nothing anywhere asks whether the fourth strip said something the first three
 * had not.
 *
 * So the questions here are all comparative, and none of them can be answered from inside one
 * section:
 *
 *   1. Sequence — is the documented order what actually renders?
 *   2. Distinctness — do the three strips carry different products, or restate each other?
 *   3. Truthfulness — does a strip labelled with a material contain that material?
 *   4. Structure — is there one page-level heading outline, or five unrelated fragments?
 *   5. Rhythm — does the single dark interruption fall where a page's turn should fall?
 *
 * Deliberately *not* here: aesthetic judgement. "Does this build toward anything" is not a
 * property a test can hold. What a test can hold is the evidence a human needs to answer it —
 * that the strips are distinct, that the labels are true, that the sequence is the intended
 * one — so the creative question is argued over real structure rather than over a guess.
 */

/** The documented sequence, from CLAUDE.md's "Homepage Section Sequence". */
const EXPECTED_SEQUENCE = [
  'hero',
  'strip:BESTSELLING',
  'campaign-band',
  'strip:NEW ARRIVALS',
  'collection-grid',
  'strip:TITANIUM',
  'materials',
] as const

/**
 * Identifies each top-level section by what it renders, in document order.
 *
 * By content rather than by test id, matching `hero-legibility.spec.ts`: the markup can be
 * restructured freely and a failure still names the thing a visitor would have seen change.
 * A section that matches nothing comes back as `unknown`, which fails the sequence assertion
 * loudly instead of being silently skipped — the `--hj-hero-fade` lesson.
 */
async function sectionSequence(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const sections = [...document.querySelectorAll('main > section')]
    return sections.map((section) => {
      const text = section.textContent ?? ''
      if (section.querySelector('h1')) return 'hero'
      if (/science before aesthetics/i.test(text)) return 'campaign-band'
      if (/built from the inside out/i.test(text)) return 'materials'
      const eyebrow = section.querySelector('.label-eyebrow')?.textContent?.trim() ?? ''
      if (/^collections$/i.test(eyebrow)) return 'collection-grid'
      if (eyebrow) return `strip:${eyebrow}`
      return 'unknown'
    })
  })
}

/** Every product handle rendered inside each scroll strip, keyed by the strip's label. */
async function stripContents(page: Page): Promise<Array<{ label: string; handles: string[] }>> {
  return page.evaluate(() => {
    const strips: Array<{ label: string; handles: string[] }> = []
    for (const section of document.querySelectorAll('main > section')) {
      const eyebrow = section.querySelector('.label-eyebrow')?.textContent?.trim() ?? ''
      if (!eyebrow || /^collections$/i.test(eyebrow)) continue
      const handles = [...section.querySelectorAll('a[href^="/products/"]')]
        .map((link) => (link as HTMLAnchorElement).getAttribute('href') ?? '')
        .map((href) => href.replace('/products/', '').split(/[?#]/)[0])
        .filter(Boolean)
      if (handles.length > 0) strips.push({ label: eyebrow, handles })
    }
    return strips
  })
}

test.describe('Homepage composition', () => {
  // The strips fade in on intersection (`useReveal`), and the reveal is one-shot. Collapsing
  // it is the same treatment hero-legibility.spec.ts uses, and exercises a path the site
  // genuinely ships rather than a test-only one.
  test.use({ contextOptions: { reducedMotion: 'reduce' } })

  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/')
    await expect(page.locator('main')).toBeVisible()
  })

  test('renders the documented section sequence, in order', async ({ page }) => {
    const sequence = await sectionSequence(page)

    expect(
      sequence,
      `The homepage sequence changed.\n` +
        `  rendered: ${sequence.join(' → ')}\n` +
        `  expected: ${EXPECTED_SEQUENCE.join(' → ')}\n` +
        'If this is intentional, update CLAUDE.md\'s "Homepage Section Sequence" and this ' +
        'list together — the sequence is a design decision, and a decision that only one of ' +
        'them knows about is how the two drift apart.'
    ).toEqual([...EXPECTED_SEQUENCE])
  })

  test('every section is identified — none renders as unknown', async ({ page }) => {
    // Guards the guard. `sectionSequence` recognises sections by their copy, so a section
    // that changed its heading would return `unknown` — and a sequence of unknowns would
    // make the assertion above fail for the wrong reason, or a future variant pass for one.
    const sequence = await sectionSequence(page)

    expect(sequence.length, 'no top-level sections found under <main>').toBeGreaterThan(0)
    expect(
      sequence.filter((name) => name === 'unknown'),
      'a homepage section could not be identified by its content — teach sectionSequence ' +
        'about it rather than leaving it anonymous'
    ).toEqual([])
  })

  test('the three scroll strips show different products', async ({ page }) => {
    // The three strips are the same component with the same layout, card, reveal and
    // "View All" destination — the products are the entire difference between them. When
    // this was written the TITANIUM strip was 50% repeats: orbit-pendant-titanium (already
    // in BESTSELLING, carrying its Bestseller badge in both) and drop-pendant-surgical-steel
    // (already in NEW ARRIVALS), because the three lists were computed independently and
    // never compared. See src/lib/utils/homepageStrips.ts.
    const strips = await stripContents(page)
    expect(strips.length, 'expected three product strips on the homepage').toBe(3)

    const places = new Map<string, string[]>()
    for (const strip of strips) {
      for (const handle of new Set(strip.handles)) {
        places.set(handle, [...(places.get(handle) ?? []), strip.label])
      }
    }
    const repeated = [...places.entries()].filter(([, labels]) => labels.length > 1)

    expect(
      repeated.map(([handle, labels]) => `${handle} appears in ${labels.join(' and ')}`),
      'The homepage shows the same product in more than one strip. Three visually identical ' +
        'strips are only three sections if their contents differ; repeat a card and the page ' +
        'is restating itself in a form that looks like new information.'
    ).toEqual([])
  })

  test('a strip labelled with a material contains only that material', async ({ page }) => {
    // TITANIUM used to be getProductsByCollection('necklaces'), so it contained a 316L steel
    // pendant and a niobium chain — each rendering its own material line, "316L Surgical
    // Steel" and "Niobium", directly beneath the word TITANIUM. Every card was correct; only
    // the relationship between the label and its contents was wrong, which is exactly what a
    // per-component test cannot see.
    const offenders = await page.evaluate(() => {
      const MATERIALS = ['titanium', 'niobium', 'surgical steel']
      const found: string[] = []
      for (const section of document.querySelectorAll('main > section')) {
        const label = section.querySelector('.label-eyebrow')?.textContent?.trim() ?? ''
        const claimed = MATERIALS.find((m) => label.toLowerCase() === m)
        if (!claimed) continue
        for (const card of section.querySelectorAll('a[href^="/products/"]')) {
          const text = (card.textContent ?? '').toLowerCase()
          const shown = MATERIALS.filter((m) => text.includes(m))
          // A card naming a different material than its strip claims. Titanium is a
          // substring of nothing else here, so a plain includes() is unambiguous.
          if (shown.length > 0 && !shown.includes(claimed)) {
            const handle = (card.getAttribute('href') ?? '').replace('/products/', '')
            found.push(`${label} strip contains ${handle} (${shown.join(', ')})`)
          }
        }
      }
      return found
    })

    expect(
      offenders,
      'A strip is labelled with one material and showing another. The label is a claim the ' +
        'cards underneath it either support or contradict.'
    ).toEqual([])
  })

  test('the page has one heading outline, not five fragments', async ({ page }) => {
    // A page-level property by definition: no section can be wrong about this alone. The
    // homepage's outline is what a screen-reader user navigates by, and the three product
    // strips contribute no heading at all — "BESTSELLING" is a <span class="label-eyebrow">
    // — so the products are absent from that outline entirely. Recorded here as the exactly
    // one h1 rule plus a non-empty outline; promoting the strips to real headings is a
    // separate, deliberate change.
    const outline = await page.evaluate(() =>
      [...document.querySelectorAll('main h1, main h2, main h3')].map((h) => ({
        level: Number(h.tagName[1]),
        text: (h.textContent ?? '').trim().slice(0, 40),
      }))
    )

    const h1s = outline.filter((h) => h.level === 1)
    expect(
      h1s.map((h) => h.text),
      'the homepage must have exactly one h1'
    ).toHaveLength(1)
    expect(outline.length, 'no headings found under <main>').toBeGreaterThan(1)

    // No heading may skip a level on the way down — an h3 arriving with no h2 above it is a
    // fragment rather than an outline.
    const skips: string[] = []
    let previous = 1
    for (const heading of outline) {
      if (heading.level > previous + 1) {
        skips.push(`h${previous} → h${heading.level} at "${heading.text}"`)
      }
      previous = heading.level
    }
    expect(skips, 'the homepage heading outline skips a level').toEqual([])
  })

  test('the single dark interruption falls in the first half of the page', async ({ page }) => {
    // CLAUDE.md: void-white is dominant, with exactly one dark interruption. Both halves of
    // that are page-level claims — "exactly one" cannot be checked from inside the band, and
    // "interruption" means it lands early enough to break the rhythm it is interrupting
    // rather than reading as a footer.
    const { darkCount, position } = await page.evaluate(() => {
      const sections = [...document.querySelectorAll('main > section')]
      const isDark = (el: Element) => {
        const [r, g, b] = (getComputedStyle(el).backgroundColor.match(/\d+/g) ?? ['255']).map(
          Number
        )
        return 0.2126 * r + 0.7152 * (g ?? r) + 0.0722 * (b ?? r) < 60
      }
      const dark = sections.filter(isDark)
      const pageHeight = document.documentElement.scrollHeight
      const top = dark[0] ? dark[0].getBoundingClientRect().top + window.scrollY : -1
      return { darkCount: dark.length, position: top / pageHeight }
    })

    expect(darkCount, 'the homepage should have exactly one dark section').toBe(1)
    expect(
      Number(position.toFixed(3)),
      `the dark band sits at ${(position * 100).toFixed(1)}% of page height — it is meant to ` +
        'interrupt the sequence, not conclude it'
    ).toBeLessThan(0.5)
  })
})
