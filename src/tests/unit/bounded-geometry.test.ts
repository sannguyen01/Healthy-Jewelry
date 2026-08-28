import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { parseSource } from '@/lib/analysis/tsAstScan'
import {
  collectInlineSizes,
  collectCssSizes,
  isRelative,
  isZero,
  type SizedElement,
} from '@/lib/analysis/sizedElements'

/**
 * **No box may have a floor with no ceiling, and none may have two authorities on its
 * size.**
 *
 * ## Why this is a category and not two bugs
 *
 * [ADR 013](../../../docs/adr/013-a-protection-that-can-only-grow.md): every guardrail on
 * the hero copy card was satisfied *better* the larger the card grew — its containment
 * check, its rendered-contrast check, axe's verdict over imagery. A larger card is a
 * better answer to all of them. So the codified pressure pointed in exactly one
 * direction, and the end state that direction leads to is a photograph that is decoration
 * behind a floating memo, with every check green the whole way.
 *
 * [ADR 017](../../../docs/adr/017-a-box-that-could-not-be-both.md): `min-height: 480px`
 * and `aspect-ratio: 1/1` on one element is not a floor plus a ratio, it is two competing
 * authorities. The min-height won and the ratio derived the width from it, so a 480px box
 * rendered at every viewport and hung 184px past a 320px screen — invisibly, since
 * `overflow-x: hidden` means no scrollbar and no symptom.
 *
 * Both were found by a person looking. Two is where a defect becomes a category, which is
 * the same argument the colour-token audit makes: the fix is not to check this box, it is
 * to check every box.
 *
 * ## What is deliberately *not* checked
 *
 * A bare `max-width` needs no classification. A ceiling with no floor is the safe
 * asymmetry — it can only make a box smaller, and nothing in this repository's history
 * has ever gone wrong that way. Requiring an entry for all ~90 of them would produce
 * ninety rows reading "BOUNDED — has a max", and a table nobody reads is how `--sage`
 * got missed in the first place.
 *
 * Relative floors (`100dvh`, `70vh`, `100%`) are bounded by the viewport or the container
 * by construction, so they are classified automatically rather than by hand.
 *
 * The audit was also run across `e2e/**` and found nothing: `product-image-fit.spec.ts`
 * already pairs `MIN_MARK_EXTENT` with `MAX_MARK_EXTENT`, and the two remaining measured
 * floors — the hero's in-frame fraction and the imagery opacity floor — have no
 * meaningful ceiling, because more of each is strictly better. A lint rule forbidding a
 * bare `toBeGreaterThan` on a measurement would fire on exactly those two and nothing
 * else. See [ADR 021](../../../docs/adr/021-a-metric-with-only-one-direction.md).
 */

const ROOT = resolve(__dirname, '../../..')

/**
 * Absolute floors and ratios, each classified. The three states are exhaustive by
 * construction — same rule as `TEXT_PAIRINGS` ∪ `ACCENT_ONLY`, and for the same reason.
 *
 * - `bounded`  — something on the same element caps it.
 * - `intrinsic` — the container or the content caps it, and the entry says which.
 * - `unbounded` — genuinely uncapped, with the reason that is acceptable here.
 *
 * Keyed `file | property | value`, which is stable across edits that move a line.
 */
const CLASSIFIED: Record<string, { state: 'bounded' | 'intrinsic' | 'unbounded'; why: string }> = {
  'src/components/contact/ContactForm.tsx | minHeight | 140px': {
    state: 'intrinsic',
    why: 'A <textarea>. Its height is the user\'s to change by dragging, and the floor only stops it opening as a single line. Capping it would fight the resize handle.',
  },
  'src/app/about/page.tsx | minHeight | 260px': {
    state: 'intrinsic',
    why: 'A pull-quote panel in a grid track. The grid row bounds it; the floor stops a two-word quote collapsing to a strip.',
  },
  'src/components/layout/CartDrawer.tsx | minWidth | 16px': {
    state: 'intrinsic',
    why: 'The quantity badge. Its width is content-driven and the floor keeps a single digit circular; the content is at most three characters.',
  },
  'src/app/cart/page.tsx | minWidth | 20px': {
    state: 'intrinsic',
    why: 'Same quantity badge on the cart page. Bounded by its content for the same reason.',
  },
  'src/app/account/page.tsx | minWidth | 140px': {
    state: 'intrinsic',
    why: 'A button in a flex row. The floor keeps two buttons matching; the flex container caps the width.',
  },
  'src/app/materials/page.tsx | minWidth | 160px': {
    state: 'intrinsic',
    why: 'A spec label column in a wrapping flex row. The floor sets the wrap point; the row caps the width.',
  },
  'src/components/home/CollectionGrid.tsx | aspectRatio | 3 / 4': {
    state: 'bounded',
    why: 'The tile is a grid cell, so its width comes from the track and the ratio derives height from a width that is already bounded. This is the safe direction of ADR 017: a ratio is only dangerous when the axis it derives *from* is unbounded.',
  },
  'src/components/home/MaterialsSection.tsx | aspectRatio | 3 / 4': {
    state: 'bounded',
    why: 'Declared alongside `width: 200px` on the same element, so the deriving axis is fixed.',
  },
  'src/app/globals.css | aspectRatio | 1 / 1': {
    state: 'bounded',
    why: 'The product tile. `max-width: var(--hj-product-tile-max)` caps the deriving axis — the ceiling ADR 017 added, and the reason the ratio is safe here.',
  },
}

function tsxFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...tsxFiles(full))
    else if (full.endsWith('.tsx') && !full.includes('.test.')) out.push(full)
  }
  return out
}

const elements: SizedElement[] = [
  ...[join(ROOT, 'src/components'), join(ROOT, 'src/app')]
    .flatMap(tsxFiles)
    .flatMap((file) =>
      collectInlineSizes(parseSource(file, readFileSync(file, 'utf8')), relative(ROOT, file))
    ),
  ...collectCssSizes(readFileSync(join(ROOT, 'src/app/globals.css'), 'utf8'), 'src/app/globals.css'),
]

/** The declarations that need a classification: absolute floors and every ratio. */
function needsClassification(element: SizedElement): Array<[string, string]> {
  const entries: Array<[string, string]> = []
  for (const [property, value] of Object.entries(element.sizes)) {
    if (property === 'aspectRatio') {
      entries.push([property, value])
      continue
    }
    if (!property.startsWith('min')) continue
    if (isZero(value) || isRelative(value)) continue
    entries.push([property, value])
  }
  return entries
}

const keyOf = (element: SizedElement, property: string, value: string) =>
  `${element.file} | ${property} | ${value}`

describe('the scan found the geometry', () => {
  it('finds sized elements', () => {
    expect(elements.length).toBeGreaterThan(50)
  })

  it('finds both inline styles and stylesheet rules', () => {
    // A parser that quietly stopped seeing one of the two would halve this audit's
    // coverage and report success.
    expect(elements.some((e) => e.file.endsWith('.tsx'))).toBe(true)
    expect(elements.some((e) => e.file.endsWith('.css'))).toBe(true)
  })

  it('finds the two elements the ADRs are about', () => {
    // Pinning the scan against known ground. If a refactor moved the product tile out of
    // globals.css this audit would go green over a smaller world.
    const tile = elements.find((e) => e.context.includes('hj-product-tile'))
    expect(tile, 'the product tile rule is no longer visible to this scan').toBeDefined()
    expect(tile?.sizes.aspectRatio).toBe('1 / 1')
    expect(tile?.sizes.maxWidth).toBe('var(--hj-product-tile-max)')
  })
})

describe('a floor without a ceiling is classified', () => {
  const unclassified = elements.flatMap((element) =>
    needsClassification(element)
      .filter(([property, value]) => {
        // A max on the same axis is a ceiling, and needs no entry.
        const axis = property === 'aspectRatio' ? 'maxWidth' : property.replace('min', 'max')
        if (element.sizes[axis]) return false
        if (property === 'aspectRatio' && (element.sizes.width || element.sizes.height)) return false
        return !(keyOf(element, property, value) in CLASSIFIED)
      })
      .map(([property, value]) => `${keyOf(element, property, value)}  (${element.context})`)
  )

  it('nothing is unclassified', () => {
    expect(
      unclassified,
      'These declarations set a floor, or a ratio, with nothing on the same element ' +
        'capping the axis it grows along — and no entry in CLASSIFIED saying why that is ' +
        'acceptable.\n\n' +
        'Add one: `bounded` if something else caps it, `intrinsic` if the container or ' +
        'the content does (say which), `unbounded` with the reason it may grow freely.\n\n' +
        'There is no fourth state. A metric that only ever passes more easily in one ' +
        'direction is not a constraint — ADR 013 — and the hero card grew for five ' +
        'rebuilds with every check green.'
    ).toEqual([])
  })

  it('every classification describes something that still exists', () => {
    // The fossil direction. A classification outliving its declaration reads as a
    // considered decision and is an old note.
    const live = new Set(
      elements.flatMap((element) =>
        needsClassification(element).map(([property, value]) => keyOf(element, property, value))
      )
    )
    for (const key of Object.keys(CLASSIFIED)) {
      expect(live, `CLASSIFIED describes "${key}", which no element declares`).toContain(key)
    }
  })

  it('every classification gives a reason, not a label', () => {
    for (const [key, entry] of Object.entries(CLASSIFIED)) {
      expect(entry.why.length, `${key}: the reason is too short to be one`).toBeGreaterThan(40)
    }
  })
})

describe('no element has two authorities on its size', () => {
  it.each(elements.map((e) => [`${e.file} — ${e.context}`, e] as const))(
    '%s',
    (_label, element) => {
      const hasRatio = 'aspectRatio' in element.sizes
      const hasFloor =
        ('minHeight' in element.sizes && !isZero(element.sizes.minHeight)) ||
        ('minWidth' in element.sizes && !isZero(element.sizes.minWidth))

      expect(
        hasRatio && hasFloor,
        `${element.file} (${element.context}) declares both aspect-ratio and a minimum ` +
          `dimension on the same element.\n\n` +
          `That is not a floor with a ratio, it is two competing authorities: the minimum ` +
          `wins, the ratio derives the other axis from it, and the box stops responding to ` +
          `its container at every viewport below the size that combination implies.\n\n` +
          `The product tile shipped exactly this and rendered 480x480 at every width, ` +
          `hanging 184px past a 320px viewport with no scrollbar to reveal it, because ` +
          `globals.css sets overflow-x: hidden. See ADR 017.`
      ).toBe(false)
    }
  )
})
