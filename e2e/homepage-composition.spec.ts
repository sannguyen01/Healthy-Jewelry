import { test, expect, type Page } from './support/test'
import { afterPaint } from './support/viewportFit'
import { denyConsent } from './support/consent'

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
  'materials',
  'care-band',
  'strip:The pieces',
  'collection-grid',
  'real-moment',
  'follow-up',
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
      if (section.querySelector('h1')) return 'hero'
      const eyebrow = section.querySelector('.label-eyebrow')?.textContent?.trim() ?? ''
      if (/^care\s*&\s*craft$/i.test(eyebrow)) return 'care-band'
      if (/^the moment$/i.test(eyebrow)) return 'real-moment'
      if (/^materials$/i.test(eyebrow)) return 'materials'
      if (section.querySelector('a[href*="instagram"], a[href*="tiktok"]')) return 'follow-up'
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

  test('the product strip shows each product once', async ({ page }) => {
    // The three strips are the same component with the same layout, card, reveal and
    // "View All" destination — the products are the entire difference between them. When
    // this was written the TITANIUM strip was 50% repeats: orbit-pendant-titanium (already
    // in BESTSELLING, carrying its Bestseller badge in both) and drop-pendant-surgical-steel
    // (already in NEW ARRIVALS), because the three lists were computed independently and
    // never compared. See src/lib/utils/homepageStrips.ts.
    const strips = await stripContents(page)
    expect(strips.length, 'expected one product strip on the homepage (ADR 040)').toBe(1)

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

  test('every light-to-light seam carries the same divider', async ({ page }) => {
    // A divider belongs to the *boundary*, not to one of the sections either side of it —
    // and this one belongs to HorizontalScroll, so it appears wherever a strip happens to
    // end rather than wherever two sections meet. The result was three structurally
    // identical light-on-light seams with two treatments: NEW ARRIVALS→CollectionGrid and
    // TITANIUM→MaterialsSection had a hairline (the strip's own borderBottom),
    // CollectionGrid→TITANIUM had none, because CollectionGrid does not draw one. Same two
    // backgrounds, same gap, different rule — visible as an inconsistency and invisible to
    // every per-section test, since each section is individually correct.
    //
    // Two exemptions, both for the same reason — the section already supplies its own edge,
    // so a hairline would be a second boundary drawn over a boundary:
    //
    //   - Either side is dark. The campaign band's own edge is the transition, and a 1px
    //     --ash line against #0A0A0A is not a divider anyone reads. (The strip above the
    //     band still draws one, because a component cannot know what follows it. That is
    //     the cost of the divider living on a section, and it is why this rule is written
    //     about pairs.)
    //   - The hero. It terminates in the photograph at every width (one image-led composition,
    //     ADR 054), so the image edge is the seam. This one was found
    //     by writing the assertion: the rule as first drafted flagged Hero → BESTSELLING
    //     alongside the real defect, and the honest answer was that the hero is genuinely
    //     different rather than that the rule should be loosened until it stopped
    //     complaining.
    const seams = await page.evaluate(() => {
      const luminance = (el: Element) => {
        const [r, g, b] = (getComputedStyle(el).backgroundColor.match(/\d+/g) ?? ['255']).map(
          Number
        )
        return 0.2126 * r + 0.7152 * (g ?? r) + 0.0722 * (b ?? r)
      }
      const hasDivider = (el: Element) => {
        const style = getComputedStyle(el)
        return style.borderBottomStyle !== 'none' && parseFloat(style.borderBottomWidth) > 0
      }
      const sections = [...document.querySelectorAll('main > section')]
      const label = (el: Element) =>
        el.querySelector('.label-eyebrow')?.textContent?.trim() ??
        el.querySelector('h1, h2')?.textContent?.trim().slice(0, 24) ??
        'section'

      return sections.slice(0, -1).map((section, index) => {
        const next = sections[index + 1]
        return {
          seam: `${label(section)} → ${label(next)}`,
          bothLight: luminance(section) >= 60 && luminance(next) >= 60,
          // The hero ends in its photograph, so the image edge is already the boundary.
          endsInPhotograph: section.querySelector('h1') !== null,
          divider: hasDivider(section),
        }
      })
    })

    const lightSeams = seams.filter((seam) => seam.bothLight && !seam.endsInPhotograph)
    expect(lightSeams.length, 'expected several light-on-light seams to compare').toBeGreaterThan(1)

    expect(
      lightSeams.filter((seam) => !seam.divider).map((seam) => seam.seam),
      'These seams join two light sections but draw no divider, while their structural ' +
        'twins do. Whatever the treatment is, it has to be the same one at every equivalent ' +
        'boundary — a rule that depends on which component happens to sit above it is not a ' +
        'rule.'
    ).toEqual([])
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

/**
 * **One container, one left edge, one right edge.**
 *
 * Every band but three sat on the twelve-column grid whose ceiling is 1296px (`.hj-grid`), so from 1440px up their text
 * started at the grid's own edge and nowhere else. The hero's copy, the product strip and the footer each had their own:
 * the hero and the strip's head and first card stood off the *viewport's* gutter (72px at 1920, where the grid's edge is
 * at 312), and the footer was a narrower container of its own (1200px, so its text began 48px in from every band's at
 * 1440). The strip also ran its fourth card 56px past its own "View all", ending 16px short of the viewport's edge: a
 * bleed that looks accidental rather than a scroll that is invited.
 *
 * Measured from the page itself: the reference is where the Materials band's text starts, because that band is on the
 * grid by construction; everything else is held to it.
 */
test.describe('Homepage — one container', () => {
  test.use({ contextOptions: { reducedMotion: 'reduce' } })

  for (const width of [1024, 1280, 1440, 1680, 1920, 2560]) {
    test(`the hero, the strip and the footer sit on the page's edges at ${width}px`, async ({ page, context }) => {
      await denyConsent(context)
      await page.setViewportSize({ width, height: 900 })
      await page.goto('/')
      await expect(page.locator('main')).toBeVisible()
      await page.evaluate(async () => {
        await document.fonts.ready
        // The strip and the footer reveal on intersection, and a lazy photograph holds no room it has not earned
        // until it is near the screen, so the page is walked once from top to bottom, as a visitor would.
        const step = Math.round(window.innerHeight * 0.6)
        for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
          window.scrollTo(0, y)
          await new Promise((r) => setTimeout(r, 60))
        }
        window.scrollTo(0, 0)
      })
      await afterPaint(page)

      const m = await page.evaluate(() => {
        const left = (el: Element | null) => (el ? el.getBoundingClientRect().left : Number.NaN)
        const right = (el: Element | null) => (el ? el.getBoundingClientRect().right : Number.NaN)
        const sections = [...document.querySelectorAll('main > section')]
        const materials = sections[1]
        const strip = sections.find((s) => s.classList.contains('hj-band-strip'))
        const cards = strip ? [...strip.querySelectorAll('.hj-strip-card')] : []
        const footer = document.querySelector('footer')
        const bottomRow = footer ? [...footer.querySelectorAll('*')].filter((e) => e.children.length === 0 && /metal, named exactly/i.test(e.textContent ?? '')) : []
        const heroCopy = document.querySelector('.hj-hero-copy')
        return {
          viewport: document.documentElement.clientWidth,
          referenceLeft: left(materials.querySelector('.label-eyebrow')),
          heroCopyLeft: left(heroCopy),
          stripHeadLeft: left(strip?.querySelector('.hj-strip-head h2') ?? null),
          stripViewAllRight: right(strip?.querySelector('.hj-strip-head a') ?? null),
          cardLefts: cards.map((c) => left(c)),
          cardRights: cards.map((c) => right(c)),
          footerMarkLeft: left(footer?.querySelector('img') ?? null),
          footerRowRight: right(bottomRow[bottomRow.length - 1] ?? null),
        }
      })

      const edge = m.referenceLeft
      const farEdge = m.viewport - edge
      expect(Number.isFinite(edge), 'the Materials band has an eyebrow to measure the page edge from').toBe(true)
      const problems: string[] = []
      const near = (label: string, got: number, want: number) => {
        if (!(Math.abs(got - want) <= 1.5)) problems.push(`${label} is at ${got.toFixed(1)}px; the page's edge is ${want.toFixed(1)}px`)
      }
      near('the hero copy\'s left', m.heroCopyLeft, edge)
      near('the strip\'s heading', m.stripHeadLeft, edge)
      near('the strip\'s "View all" right edge', m.stripViewAllRight, farEdge)
      near('the strip\'s first card', m.cardLefts[0], edge)
      // Four cards fill the container exactly, and the fifth is begun, so the row visibly goes on.
      near('the strip\'s fourth card\'s right edge', m.cardRights[3], farEdge)
      if (!(m.cardLefts[4] > farEdge && m.cardLefts[4] < m.viewport - 16)) {
        problems.push(`the fifth card begins at ${m.cardLefts[4]?.toFixed(1)}px: it should peek between ${farEdge.toFixed(0)}px and ${m.viewport - 16}px so the row reads as one that scrolls`)
      }
      near('the footer\'s mark', m.footerMarkLeft, edge)
      near('the footer\'s last line\'s right edge', m.footerRowRight, farEdge)
      expect(problems, `At ${width}px:\n  ${problems.join('\n  ')}`).toEqual([])
    })
  }
})

/**
 * **No block of running text ends on a line of one word** (the type's job as well as the grid's).
 *
 * Found by looking at the page, not by a test: at 390px the hero's eyebrow broke after "316L" and left "STEEL" alone, the
 * strip's heading sentence left "specification." on its own line, a materials description left "steel." and "coating.", and
 * the care paragraph ended on "piece." — a dozen of them across six widths, because no rule anywhere in the stylesheet asked the
 * browser to care where a line ends. `text-wrap: balance` (short blocks: headings, the eyebrow) and `pretty` (running text)
 * ask it to. They are Chromium's and Safari's today and a no-op elsewhere, which is the right way for a refinement to fail.
 *
 * Measured from the rendered words, not from the CSS: every word of every block is a range, the ranges are grouped into lines by
 * their top edge, and a block of two or more lines whose last line holds one word is reported. The hero's own headline is left
 * out on purpose: its lines are data (`headlineLines`), broken where the copy says, not where the width does.
 */
test.describe('Homepage — no word is left alone on a last line', () => {
  test.use({ contextOptions: { reducedMotion: 'reduce' } })

  for (const width of [320, 360, 390, 768, 1280, 1440]) {
    test(`at ${width}px`, async ({ page, context }) => {
      await denyConsent(context)
      await page.setViewportSize({ width, height: 900 })
      await page.goto('/')
      await expect(page.locator('main')).toBeVisible()
      await page.evaluate(async () => {
        await document.fonts.ready
        const step = Math.round(window.innerHeight * 0.6)
        for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
          window.scrollTo(0, y)
          await new Promise((r) => setTimeout(r, 60))
        }
        window.scrollTo(0, 0)
      })
      await afterPaint(page)

      const orphans = await page.evaluate(() => {
        const found: string[] = []
        const blocks = document.querySelectorAll('main h2, main h3, main p, main li, main figcaption, main .label-eyebrow')
        for (const block of blocks) {
          const words: { text: string; top: number; height: number }[] = []
          const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT)
          for (let node = walker.nextNode(); node; node = walker.nextNode()) {
            const value = node.nodeValue ?? ''
            for (const match of value.matchAll(/\S+/g)) {
              const range = document.createRange()
              range.setStart(node, match.index ?? 0)
              range.setEnd(node, (match.index ?? 0) + match[0].length)
              const rect = range.getBoundingClientRect()
              if (rect.width > 0) words.push({ text: match[0], top: rect.top, height: rect.height })
            }
          }
          // Under four words a break leaves two and one at best (a three-word name in a narrow column), which `balance` already
          // chooses well; the check is for sentences and phrases that have somewhere better to break.
          if (words.length < 4) continue
          const lines: { top: number; words: string[] }[] = []
          for (const word of words) {
            const last = lines[lines.length - 1]
            if (last && Math.abs(last.top - word.top) < word.height / 2) last.words.push(word.text)
            else lines.push({ top: word.top, words: [word.text] })
          }
          if (lines.length >= 2 && lines[lines.length - 1].words.length === 1) {
            const label = `${block.tagName.toLowerCase()}${typeof block.className === 'string' && block.className ? `.${block.className.split(/\s+/)[0]}` : ''}`
            found.push(`${label}: "${lines[lines.length - 1].words[0]}" alone after ${lines.length - 1} line(s) — "${(block.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 50)}"`)
          }
        }
        return found
      })
      expect(orphans, `Words alone on a last line at ${width}px:\n  ${orphans.join('\n  ')}`).toEqual([])
    })
  }
})
