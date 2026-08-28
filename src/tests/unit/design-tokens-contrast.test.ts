import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { compositeOver, contrastRatio } from '@/lib/utils/contrast'

/**
 * WCAG 2.1 contrast enforcement for the T4 palette.
 *
 * The homepage shipped `--titanium` (#9DA7AF, 2.25:1 on `--bg`) as 10-12px body
 * copy in eight places. axe caught two of them, twenty-five minutes into an E2E
 * run, on the one page it scans for serious violations — and only after the
 * regression had already reached production.
 *
 * A contrast ratio is arithmetic over two hex values. It does not need a
 * browser, and it should not cost a browser: this runs in the fast gate, in
 * milliseconds, and covers every documented pairing rather than whatever
 * happens to be rendered on the four pages the a11y spec visits.
 *
 * Tokens are read from globals.css rather than duplicated here, so the test
 * cannot drift from the stylesheet it is guarding.
 */

const GLOBALS_CSS = path.resolve(__dirname, '../../app/globals.css')

/** Parses `--token: #RRGGBB;` declarations out of the stylesheet. */
function readTokens(): Record<string, string> {
  const css = readFileSync(GLOBALS_CSS, 'utf8')
  const tokens: Record<string, string> = {}
  for (const match of css.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})\b/g)) {
    tokens[match[1]] = match[2].toUpperCase()
  }
  return tokens
}

const tokens = readTokens()

const token = (name: string): string => {
  const value = tokens[name]
  if (!value) {
    throw new Error(
      `Design token --${name} is missing from globals.css. If it was renamed, update this test — it is the contract, not a copy.`
    )
  }
  return value
}

/**
 * Every pairing the design system actually uses for *text*, with the level it
 * has to clear. 4.5:1 is the AA floor for body copy; 3:1 applies to large text
 * (>= 24px, or >= 18.66px bold).
 *
 * Deliberately absent: `--titanium`, `--sage` and `--ash` on light backgrounds.
 * Those are accent and border tokens. `--titanium` is 2.25:1 on `--bg` — it is
 * why `--titanium-text` exists — `--sage` is 2.36:1, worse, which is why
 * `--sage-text` exists, and `--ash` only ever carries the decorative ordinals,
 * which are exempt under WCAG 1.4.3 and excluded in e2e/a11y.spec.ts.
 *
 * `--sage` was absent from this list for a different reason until 2026-08-25: it
 * was absent from the whole file. Nobody had decided it was an accent — it was
 * simply never classified, and shipped as 9-13px text in four places at ratios
 * between 1.97:1 and 2.36:1. `every colour token is classified` below is the
 * fix for the category, not just for sage.
 */
const TEXT_PAIRINGS: Array<{
  label: string
  foreground: string
  background: string
  minimum: number
}> = [
  // Light surfaces
  { label: 'ink on bg (primary text)', foreground: 'ink', background: 'bg', minimum: 4.5 },
  { label: 'ink on nacre (card text)', foreground: 'ink', background: 'nacre', minimum: 4.5 },
  {
    label: 'graphite on bg (secondary text)',
    foreground: 'graphite',
    background: 'bg',
    minimum: 4.5,
  },
  {
    label: 'graphite on nacre (secondary text on cards)',
    foreground: 'graphite',
    background: 'nacre',
    minimum: 4.5,
  },
  {
    label: 'titanium-text on bg (metadata, eyebrows, footer)',
    foreground: 'titanium-text',
    background: 'bg',
    minimum: 4.5,
  },
  {
    label: 'titanium-text on nacre (badges, card metadata)',
    foreground: 'titanium-text',
    background: 'nacre',
    minimum: 4.5,
  },
  {
    label: 'sage-text on bg (cart "Free", contact success, .badge-new on the PDP)',
    foreground: 'sage-text',
    background: 'bg',
    minimum: 4.5,
  },
  {
    label: 'sage-text on nacre (.badge-new over a card tile)',
    foreground: 'sage-text',
    background: 'nacre',
    minimum: 4.5,
  },

  // Dark surfaces
  {
    label: 'on-dark on black (campaign band)',
    foreground: 'on-dark',
    background: 'black',
    minimum: 4.5,
  },
  {
    label: 'on-dark on ink (mobile nav overlay)',
    foreground: 'on-dark',
    background: 'ink',
    minimum: 4.5,
  },
  { label: 'on-dark on mid (dark hover)', foreground: 'on-dark', background: 'mid', minimum: 4.5 },
  {
    label: 'mist on black (muted text on dark)',
    foreground: 'mist',
    background: 'black',
    minimum: 4.5,
  },
  {
    label: 'titanium on ink (mobile nav tagline)',
    foreground: 'titanium',
    background: 'ink',
    minimum: 4.5,
  },
]

describe('T4 design tokens', () => {
  it('parses the palette out of globals.css', () => {
    // Guards the whole file: a parser that silently matches nothing would make
    // every assertion below vacuous.
    expect(Object.keys(tokens).length).toBeGreaterThanOrEqual(11)
    expect(tokens.bg).toBe('#F7F5F1')
    expect(tokens.ink).toBe('#1A1714')
  })

  it('defines a text-safe titanium distinct from the titanium accent', () => {
    expect(token('titanium-text')).not.toBe(token('titanium'))
  })

  it('keeps the raw titanium accent out of AA text range on light backgrounds', () => {
    // Documents *why* --titanium-text exists. If someone ever lightens --bg or
    // darkens --titanium enough for this to pass, the extra token can go — and
    // this failure is the prompt to reconsider it.
    expect(contrastRatio(token('titanium'), token('bg'))).toBeLessThan(4.5)
  })

  it('defines a text-safe sage distinct from the sage accent', () => {
    expect(token('sage-text')).not.toBe(token('sage'))
  })

  it('keeps the raw sage accent out of AA text range on light backgrounds', () => {
    // Same role as the titanium assertion above, and the same prompt if it ever
    // starts passing. --sage is 2.36:1 on --bg — worse than the titanium case
    // that motivated the split — and carried label copy anyway.
    expect(contrastRatio(token('sage'), token('bg'))).toBeLessThan(4.5)
  })

  it('keeps sage-text off dark surfaces', () => {
    // The naming invites the mistake: --titanium-text and --sage-text sound like
    // general-purpose text tokens, and neither is. --sage-text is 2.72:1 on
    // --ink. --on-dark and --mist are the dark-surface tokens.
    expect(contrastRatio(token('sage-text'), token('ink'))).toBeLessThan(4.5)
  })
})

/**
 * Tokens that carry no text and therefore need no ratio. Every entry is a claim
 * someone made on purpose; the test below refuses to let a token be neither
 * listed here nor covered by a pairing.
 */
const ACCENT_ONLY = new Set([
  'sage', // 2.36:1 on --bg — borders and tints only. See --sage-text.
  'ash', // borders, dividers, and the decorative ordinals (WCAG 1.4.3 exempt).
])
// Everything else in the palette is already named by TEXT_PAIRINGS, as a
// foreground or as a surface, so listing it here too would be noise.
//
// --titanium is deliberately *not* here, and the third test below is what
// caught the first draft of this list putting it here: it is an accent on light
// backgrounds but genuine text on --ink (the mobile nav tagline), so it is
// classified by that pairing. "Accent-only" has to mean carries no text
// anywhere, or it becomes a way to excuse the next --sage.

describe('every colour token is classified', () => {
  /**
   * The gap that let --sage ship as 1.97:1 text was not a wrong assertion — it
   * was a missing one. TEXT_PAIRINGS is hand-maintained, so a token absent from
   * it is silently unguarded, and the parse guard only counts tokens rather than
   * accounting for them. This makes the list total: a new token must be declared
   * either as text (with the surfaces it sits on) or as accent-only, and there
   * is no third option that quietly means "unverified".
   *
   * Deliberately not an assertion about contrast. It asserts that somebody
   * decided, which is the thing that was actually missing.
   */
  it('is either a text pairing or explicitly accent-only', () => {
    const covered = new Set<string>()
    for (const { foreground, background } of TEXT_PAIRINGS) {
      covered.add(foreground)
      covered.add(background)
    }

    const unclassified = Object.keys(tokens).filter(
      (name) => !covered.has(name) && !ACCENT_ONLY.has(name)
    )

    expect(
      unclassified,
      `These colour tokens are in globals.css but neither carry a checked text\n` +
        `pairing nor appear in ACCENT_ONLY:\n  ${unclassified.join('\n  ')}\n\n` +
        'Add a row to TEXT_PAIRINGS naming the surfaces it renders text on, or add\n' +
        'it to ACCENT_ONLY with a comment saying what it is for. A token that is\n' +
        'neither is unverified, which is how --sage shipped at 1.97:1.'
    ).toEqual([])
  })

  it('does not let ACCENT_ONLY excuse a token that carries text', () => {
    // Guards the guard: ACCENT_ONLY is an escape hatch, so it must not be usable
    // to silence a token that TEXT_PAIRINGS also covers as a foreground. If both
    // were true the classification would be meaningless.
    const textForegrounds = new Set(TEXT_PAIRINGS.map((p) => p.foreground))
    const contradictory = [...ACCENT_ONLY].filter((name) => textForegrounds.has(name))

    expect(
      contradictory,
      `Listed as accent-only while also used as text: ${contradictory.join(', ')}`
    ).toEqual([])
  })

  it('names only tokens that exist', () => {
    // An ACCENT_ONLY entry for a renamed or deleted token would silently shrink
    // the set of things this file checks.
    const missing = [...ACCENT_ONLY].filter((name) => !(name in tokens))
    expect(
      missing,
      `ACCENT_ONLY names tokens absent from globals.css: ${missing.join(', ')}`
    ).toEqual([])
  })
})

/**
 * Tokens that must never appear as a `color:` anywhere, on any surface.
 *
 * This exists because the ratio tests above cannot see it. They prove the token
 * *values* are sound; nothing proved that components use the right one. Measured:
 * reverting `.badge-new`'s colour to `var(--sage)` left all of the assertions
 * above green, because a contrast test reads hex out of globals.css and has no
 * idea which token a rule references. The split is advisory until something
 * checks usage — which is precisely how `--sage` carried label copy for months
 * while a test file dedicated to contrast sat beside it.
 *
 * Only `--sage` is listed, and the two absences are deliberate rather than lazy:
 *
 *   - `--titanium` is legitimate text on `--ink` (the mobile nav tagline), so a
 *     blanket ban would be wrong and a surface-aware version needs to know each
 *     usage's background — which this cannot see.
 *   - `--ash` carries the decorative `01/02/03` ordinals in MaterialsSection,
 *     exempt under WCAG 1.4.3 and already excluded by selector in a11y.spec.ts.
 *
 * `--sage` has no such case: it is a border and tint colour with no legitimate
 * text use at any size, on any background in this palette.
 */
const NEVER_A_TEXT_COLOUR = ['sage']

const SRC = path.resolve(__dirname, '../..')

function tsxFiles(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry)
    if (statSync(full).isDirectory()) {
      if (entry === 'node_modules' || entry === '.next') continue
      tsxFiles(full, found)
    } else if (entry.endsWith('.tsx')) {
      found.push(full)
    }
  }
  return found
}

describe('accent tokens are not used as text colours', () => {
  for (const name of NEVER_A_TEXT_COLOUR) {
    it(`--${name} never appears as a color declaration`, () => {
      // `color:` only — `background-color`, `border-color`, `borderColor` and
      // `fill` are all legitimate uses of an accent and must not be flagged. The
      // negative lookbehind is what keeps `background-color` out.
      const pattern = new RegExp(`(?<![-\\w])color:\\s*'?var\\(--${name}\\)`, 'g')
      const offenders: string[] = []

      const css = readFileSync(GLOBALS_CSS, 'utf8').split('\n')
      css.forEach((line, index) => {
        if (pattern.test(line)) offenders.push(`globals.css:${index + 1} ${line.trim()}`)
        pattern.lastIndex = 0
      })

      for (const file of tsxFiles(SRC)) {
        readFileSync(file, 'utf8')
          .split('\n')
          .forEach((line, index) => {
            if (pattern.test(line)) {
              offenders.push(`${path.relative(SRC, file)}:${index + 1} ${line.trim()}`)
            }
            pattern.lastIndex = 0
          })
      }

      expect(
        offenders,
        `--${name} is an accent token and is being used as a text colour:\n  ` +
          offenders.join('\n  ') +
          `\n\nUse --${name}-text instead. --${name} stays correct for borders, ` +
          'tints and fills.'
      ).toEqual([])
    })
  }
})

describe('T4 text contrast meets WCAG 2.1 AA', () => {
  for (const { label, foreground, background, minimum } of TEXT_PAIRINGS) {
    it(`${label} is at least ${minimum}:1`, () => {
      const ratio = contrastRatio(token(foreground), token(background))
      expect(
        Number(ratio.toFixed(2)),
        `--${foreground} (${token(foreground)}) on --${background} (${token(background)}) is ${ratio.toFixed(2)}:1, below the ${minimum}:1 minimum`
      ).toBeGreaterThanOrEqual(minimum)
    })
  }
})

/**
 * Surfaces built by layering a translucent tint over a token. Checking the text
 * against the underlying token is not enough — and is how the bestseller badge
 * shipped at 4.39:1 while measuring 4.74:1 against bare --nacre.
 */
describe('Composited surfaces meet WCAG 2.1 AA', () => {
  it('bestseller badge label on its tinted background is at least 4.5:1', () => {
    // ProductBadge/Badge: 12% --titanium over the --nacre card tile.
    const badgeBackground = compositeOver(token('titanium'), token('nacre'), 0.12)
    const ratio = contrastRatio(token('titanium-text'), badgeBackground)
    expect(
      Number(ratio.toFixed(2)),
      `--titanium-text on the composited badge background is ${ratio.toFixed(2)}:1`
    ).toBeGreaterThanOrEqual(4.5)
  })

  // Two badge implementations, two grounds. ProductBadge (globals.css .badge-*)
  // renders on a --nacre card tile; ui/Badge renders in a HorizontalScroll strip
  // whose section background is --bg. Both are asserted because the composite is
  // different and a single check would leave one of them unguarded — which is
  // the shape of the original defect.
  it('new badge label on its tint over a card tile is at least 4.5:1', () => {
    const badgeBackground = compositeOver(token('sage'), token('nacre'), 0.12)
    const ratio = contrastRatio(token('sage-text'), badgeBackground)
    expect(
      Number(ratio.toFixed(2)),
      `--sage-text on 12% --sage over --nacre is ${ratio.toFixed(2)}:1`
    ).toBeGreaterThanOrEqual(4.5)
  })

  it('new badge label on its tint over the page background is at least 4.5:1', () => {
    const badgeBackground = compositeOver(token('sage'), token('bg'), 0.12)
    const ratio = contrastRatio(token('sage-text'), badgeBackground)
    expect(
      Number(ratio.toFixed(2)),
      `--sage-text on 12% --sage over --bg is ${ratio.toFixed(2)}:1`
    ).toBeGreaterThanOrEqual(4.5)
  })
})

/**
 * The palette CLAUDE.md documents must be the palette `globals.css` defines.
 *
 * `CLAUDE.md` carries a token table — one row per colour, with its hex — and a paragraph
 * stating the ratios that justify the two `-text` siblings. Both are read by every person
 * and every agent working in this repository, and until 2026-08-28 the table listed
 * `--titanium-text` as `#5E6870`.
 *
 * That is not merely a stale value. It is the value this codebase **rejected**: the
 * comment beside the real token records that `#5E6870` measured 4.39:1 on the bestseller
 * badge's composited tint and quietly failed AA, which is why the shipped token is
 * `#59636B`. The documented ratio next to it — 5.64:1 — is correct for `#59636B` and
 * wrong for `#5E6870`, which is 5.23:1 on `--bg`. Somebody updated the number and not the
 * swatch, and nothing compared the two.
 *
 * The tests above already read tokens from `globals.css` rather than restating them, "so
 * the test cannot drift from the stylesheet it is guarding". The documentation had no such
 * protection, and documentation is what a reader reaches for first.
 *
 * See [ADR 019](../../../docs/adr/019-an-unclassified-entry-is-an-unverified-one.md).
 */
describe('the documented palette is the real palette', () => {
  const CLAUDE_MD = readFileSync(path.resolve(__dirname, '../../../CLAUDE.md'), 'utf8')

  /** `| \`--token\` | #RRGGBB | … |` rows from the design-system table. */
  const documentedTokens = new Map<string, string>()
  for (const row of CLAUDE_MD.matchAll(/^\|\s*`--([\w-]+)`\s*\|\s*(#[0-9a-fA-F]{6})\s*\|/gm)) {
    documentedTokens.set(row[1], row[2].toUpperCase())
  }

  it('found the token table', () => {
    // Without this the two comparisons below pass over an empty map — the shape of green
    // that proves nothing, which is the failure this whole family of tests exists for.
    expect(documentedTokens.size).toBeGreaterThan(8)
  })

  it.each([...documentedTokens.keys()])('--%s has the hex CLAUDE.md claims', (name) => {
    expect(
      token(name),
      `CLAUDE.md documents --${name} as ${documentedTokens.get(name)}, but globals.css ` +
        `defines it as ${tokens[name]}. Whichever a reader found first is the answer they ` +
        `got, and one of them is a colour this project does not ship.`
    ).toBe(documentedTokens.get(name))
  })

  it('documents every token globals.css defines for the palette', () => {
    // The reverse direction: a token added to the stylesheet and not to the table is
    // unclassified in the place people actually read, which is how --sage shipped as
    // text in four places.
    for (const name of Object.keys(tokens)) {
      // Geometry, spacing, easing and duration tokens are not colours and have no row.
      if (!/^[0-9a-fA-F]{6}$/.test(tokens[name].slice(1))) continue
      expect(
        documentedTokens.has(name),
        `globals.css defines --${name} (${tokens[name]}) and CLAUDE.md's palette table ` +
          `does not list it.`
      ).toBe(true)
    }
  })

  /**
   * Ratio claims in the contrast-rule paragraph, e.g. ``--titanium` at 2.25:1` and
   * ``--titanium-text` (5.64:1)`. Matched within a bounded window after the token name so
   * the extraction is defined rather than hopeful, and the count is asserted below so the
   * scan's coverage is a number rather than a silence.
   */
  const documentedRatios: Array<{ name: string; claimed: number }> = []
  for (const claim of CLAUDE_MD.matchAll(/`--([\w-]+)`[^\n]{0,12}?\(?(\d\.\d{2}):1/g)) {
    documentedRatios.push({ name: claim[1], claimed: Number.parseFloat(claim[2]) })
  }

  it('found the ratio claims', () => {
    expect(documentedRatios.length).toBeGreaterThanOrEqual(4)
  })

  it.each(documentedRatios.map((r) => [`--${r.name} at ${r.claimed}:1`, r] as const))(
    'CLAUDE.md claims %s, and it measures that',
    (_label, { name, claimed }) => {
      // Every ratio in that paragraph is stated against --bg.
      const measured = contrastRatio(token(name), token('bg'))
      expect(
        measured,
        `CLAUDE.md says --${name} is ${claimed}:1 on --bg. It measures ` +
          `${measured.toFixed(2)}:1. A wrong ratio in the one paragraph explaining which ` +
          `token carries text is worse than no ratio: it reads as a measurement.`
      ).toBeCloseTo(claimed, 1)
    }
  )
})
