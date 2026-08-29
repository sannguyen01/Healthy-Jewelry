import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { contrastRatio } from '@/lib/utils/contrast'

/**
 * **A number in prose is a claim like any other.**
 *
 * ## Why
 *
 * `CLAUDE.md` documented `--titanium-text` as `#5E6870` — not a stale value, but the one
 * `globals.css` records as measuring 4.39:1 on the badge tint and *failing AA*, which is
 * why the shipped token is `#59636B`. It was found by accident, while writing a mutation
 * for an unrelated sentinel.
 *
 * The fix that followed was targeted at the file where it was noticed, and therefore
 * incomplete: **`docs/testing-strategy.md` carried the same rejected hex, with its own
 * correctly-computed 5.23:1 beside it** — internally consistent, describing a colour this
 * codebase does not use. The exhaustive sweep this file implements is what found the
 * second copy. That is the whole argument for sweeping rather than patching: one
 * incidental discovery does not bound how many others there are.
 *
 * It also found `testing-strategy.md` claiming `premise-checks.test.ts` runs **18 tests**
 * when vitest reports 29.
 *
 * ## What is checked, and what is deliberately not
 *
 * **Live documents** — the ones a reader consults to learn *current* state — are swept
 * completely: every numeric token is either a `LIVE` claim reconciled against its source,
 * or a `HISTORICAL` one naming a past measurement. No third state, per
 * [ADR 019](../../../docs/adr/019-an-unclassified-entry-is-an-unverified-one.md).
 *
 * **ADRs, `STATE.md` and `CHANGELOG.md` are historical by construction** and are not
 * swept. An ADR records what was measured on the day a decision was made; re-measuring it
 * would not correct it, it would falsify it. That is a classification at file granularity
 * rather than an exemption — the reason is stated here, which is what ADR 019 asks.
 */

const ROOT = resolve(__dirname, '../../..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')

/** Documents that describe current state, and are therefore swept completely. */
const LIVE_DOCUMENTS = ['CLAUDE.md', 'docs/testing-strategy.md']

/** Numeric tokens: a number with a unit, ratio, or counted noun. */
const NUMERIC = /(?<![\w.])(\d+(?:\.\d+)?)\s*(px|:1|%|ms\b|min\b|tests?\b)/g

const globals = read('src/app/globals.css')
const token = (name: string): string => {
  const match = globals.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`))
  if (!match) throw new Error(`--${name} is not in globals.css`)
  return match[1].toUpperCase()
}
const cssValue = (name: string): string => {
  const match = globals.match(new RegExp(`--${name}:\\s*([^;]+);`))
  if (!match) throw new Error(`--${name} is not in globals.css`)
  return match[1].trim()
}
const ratioOnBg = (name: string) => Number(contrastRatio(token(name), token('bg')).toFixed(2))

/**
 * Claims about current state, each with the source that decides it.
 *
 * `context` locates the claim; `actual()` resolves the truth. A claim whose context no
 * longer appears fails too — a reconciliation pointing at deleted prose is the fossil
 * pattern applied to this table.
 */
const LIVE: Array<{ doc: string; context: string; claimed: string; actual: () => string }> = [
  {
    doc: 'CLAUDE.md',
    context: '(80%+ coverage required)',
    claimed: '80',
    actual: () => String(read('vitest.config.ts').match(/lines:\s*(\d+)/)?.[1]),
  },
  {
    doc: 'CLAUDE.md',
    context: 'maintain 80%+ coverage',
    claimed: '80',
    actual: () => String(read('vitest.config.ts').match(/lines:\s*(\d+)/)?.[1]),
  },
  {
    doc: 'CLAUDE.md',
    context: '`--hj-product-tile-max` (560px)',
    claimed: '560px',
    actual: () => cssValue('hj-product-tile-max'),
  },
  {
    doc: 'CLAUDE.md',
    context: 'breakpoint at 768px',
    claimed: '768px',
    actual: () =>
      `${read('src/components/layout/Nav.tsx').match(/@media \(max-width: (\d+)px\)/)?.[1]}px`,
  },
  {
    doc: 'CLAUDE.md',
    context: 'breakpoint at 900px',
    claimed: '900px',
    actual: () =>
      `${read('src/components/home/Hero.tsx').match(/@media \(max-width: (\d+)px\)/)?.[1]}px`,
  },
  {
    doc: 'CLAUDE.md',
    context: '`--titanium` at 2.25:1',
    claimed: '2.25',
    actual: () => ratioOnBg('titanium').toFixed(2),
  },
  {
    doc: 'CLAUDE.md',
    context: '`--sage` at 2.36:1',
    claimed: '2.36',
    actual: () => ratioOnBg('sage').toFixed(2),
  },
  {
    doc: 'CLAUDE.md',
    context: '`--titanium-text` (5.64:1)',
    claimed: '5.64',
    actual: () => ratioOnBg('titanium-text').toFixed(2),
  },
  {
    doc: 'CLAUDE.md',
    context: '`--sage-text` (6.02:1)',
    claimed: '6.02',
    actual: () => ratioOnBg('sage-text').toFixed(2),
  },
  {
    doc: 'docs/testing-strategy.md',
    // The claim that was wrong in two documents. Both halves are checked: the hex against
    // globals.css, and the ratio against the hex.
    context: '`--titanium-text` (#59636B, 5.64:1 on `--bg`)',
    claimed: '#59636B|5.64',
    actual: () => `${token('titanium-text')}|${ratioOnBg('titanium-text').toFixed(2)}`,
  },
  {
    doc: 'docs/testing-strategy.md',
    context: 'is 2.25:1 on `--bg`',
    claimed: '2.25',
    actual: () => ratioOnBg('titanium').toFixed(2),
  },
  {
    doc: 'docs/testing-strategy.md',
    // Wrong until 2026-08-29: the doc said 18. Counting `it(` rather than running the
    // suite keeps this in the fast gate; the two agreed when checked by hand.
    context: 'every premise, 29 tests',
    claimed: '29',
    actual: () =>
      String((read('src/tests/unit/premise-checks.test.ts').match(/^\s*it(\.each)?\(/gm) ?? []).length),
  },
]

/**
 * Numbers that record a past measurement. Frozen: re-measuring them would falsify the
 * account rather than correct it.
 *
 * Matched on a context substring so one entry covers a whole sentence.
 */
const HISTORICAL: Array<{ doc: string; context: string }> = [
  { doc: 'CLAUDE.md', context: 'WCAG AA 4.5:1 floor' },
  { doc: 'CLAUDE.md', context: 'measuring 4.39:1 on the bestseller badge' },
  { doc: 'CLAUDE.md', context: 'shipped as 9–13px text at 1.97:1' },
  { doc: 'CLAUDE.md', context: '**≥769px**' },
  { doc: 'CLAUDE.md', context: '**≤768px**' },
  { doc: 'CLAUDE.md', context: 'must fit 320px' },
  { doc: 'CLAUDE.md', context: 'required 414px' },
  { doc: 'CLAUDE.md', context: 'empty and 435px with a bag badge' },
  { doc: 'CLAUDE.md', context: 'This is why the 768px breakpoint' },
  { doc: 'CLAUDE.md', context: 'sweeps 320–1440px' },
  { doc: 'CLAUDE.md', context: '**≥901px**' },
  { doc: 'CLAUDE.md', context: 'at `right: -120px`' },
  { doc: 'CLAUDE.md', context: '**≤900px**' },
  { doc: 'CLAUDE.md', context: 'at 390px the `right center` crop discards 75%' },
  { doc: 'CLAUDE.md', context: '`min-height: 480px`' },
  { doc: 'CLAUDE.md', context: '184px past a 320px viewport' },
  { doc: 'CLAUDE.md', context: 'one `svgScale="70%"`' },
  { doc: 'CLAUDE.md', context: '(lint · type-check · unit · build, ~2 min)' },
  { doc: 'CLAUDE.md', context: '(Playwright, both projects, ~3–5 min)' },
  { doc: 'docs/testing-strategy.md', context: 'desktop + mobile | ~3-5 min' },
  { doc: 'docs/testing-strategy.md', context: 'used as 10-12px body copy' },
  { doc: 'docs/testing-strategy.md', context: '| E2E wall time | 24.2 min | ~3-5 min |' },
  { doc: 'docs/testing-strategy.md', context: '(1.36:1 on `--bg`)' },
  { doc: 'docs/testing-strategy.md', context: 'text on dark surfaces (7.29:1' },
  { doc: 'docs/testing-strategy.md', context: 'it was simply the wrong 25% of the frame' },
  { doc: 'docs/testing-strategy.md', context: 'correct above ~866px' },
  { doc: 'docs/testing-strategy.md', context: 'Testing at 390px and 1280px' },
  { doc: 'docs/testing-strategy.md', context: '1280px and 1440px would have missed it' },
  { doc: 'docs/testing-strategy.md', context: 'not just a width either side of the boundary. 901p' },
]

describe('the sweep found documents to sweep', () => {
  it.each(LIVE_DOCUMENTS)('%s exists and carries numbers', (doc) => {
    const matches = [...read(doc).matchAll(NUMERIC)]
    expect(matches.length, `${doc} has no numeric tokens — has it moved?`).toBeGreaterThan(0)
  })
})

describe('every live claim matches its source', () => {
  it.each(LIVE.map((c) => [`${c.doc}: ${c.context}`, c] as const))('%s', (_label, claim) => {
    const source = read(claim.doc)
    expect(
      source.includes(claim.context),
      `${claim.doc} no longer contains "${claim.context}". Either the prose changed and ` +
        `this entry must follow it, or the claim was deleted and the entry should be too.`
    ).toBe(true)

    expect(
      claim.actual(),
      `${claim.doc} claims "${claim.context}", and the source says ${claim.actual()}.\n\n` +
        `A number in prose is a claim like any other. CLAUDE.md and this file both carried ` +
        `a rejected colour value for weeks because nothing compared them to globals.css.`
    ).toBe(claim.claimed)
  })
})

describe('every number in a live document is classified', () => {
  it.each(LIVE_DOCUMENTS)('%s', (doc) => {
    const source = read(doc)
    const lines = source.split('\n')
    const unclassified: string[] = []

    for (const [index, line] of lines.entries()) {
      for (const match of line.matchAll(NUMERIC)) {
        const covered =
          LIVE.some((c) => c.doc === doc && line.includes(c.context)) ||
          HISTORICAL.some((h) => h.doc === doc && line.includes(h.context))
        if (!covered) unclassified.push(`  line ${index + 1}: "${match[0]}" in — ${line.trim()}`)
      }
    }

    expect(
      unclassified,
      `${doc} contains numeric claims that are neither reconciled nor marked historical:\n\n` +
        `${unclassified.join('\n')}\n\n` +
        `Classify each. LIVE if it describes current state — give the source that decides ` +
        `it. HISTORICAL if it records a past measurement, which is frozen and must not be ` +
        `re-measured.\n\n` +
        `There is no third option: "nobody checked this number" is exactly how a rejected ` +
        `colour value survived in two documents at once.`
    ).toEqual([])
  })
})

describe('the historical list has not fossilised', () => {
  it.each(HISTORICAL.map((h) => [`${h.doc}: ${h.context}`, h] as const))(
    '%s still appears',
    (_label, entry) => {
      // An exemption outliving the prose it exempts reads as a considered decision and is
      // an old note — the same reverse direction every reconciliation in this repo checks.
      expect(
        read(entry.doc).includes(entry.context),
        `HISTORICAL names "${entry.context}" in ${entry.doc}, which no longer contains it`
      ).toBe(true)
    }
  )
})
