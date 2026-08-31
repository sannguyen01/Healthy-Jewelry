import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { contrastRatio } from '@/lib/utils/contrast'

import { ROOT, agentFacingDocuments, missingAgentDocuments } from '../support/agentDocs'

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

const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')

/**
 * Documents that describe current state, and are therefore swept completely.
 *
 * This was a two-item allowlist — `CLAUDE.md` and `docs/testing-strategy.md` — and the
 * scope was the defect. `.claude/skills/project-conventions/SKILL.md` sat outside it and
 * carried "443 unit tests and 11 E2E spec files" from 2026-08-01 until 2026-08-30, by which
 * point the real figures were 1913 and 17. Measured against a baseline stale by a factor of
 * four, a catastrophic collapse from 1913 down to 600 still reads as growth: a stale
 * baseline does not weaken the check, it inverts it.
 *
 * The scope now comes from the same shared module `agent-doc-claims.test.ts` reads, so the
 * two reconcilers cannot again disagree about which documents are worth checking — which is
 * exactly how that file ended up being the only one neither of them covered.
 */
const LIVE_DOCUMENTS = agentFacingDocuments()

/**
 * Numeric tokens: a number with a unit, ratio, or counted noun.
 *
 * `files?` is here because the sweep that exists to catch a stale count could not see
 * "17 spec files" — the count sitting immediately beside the one it was written for. A
 * classifier blind to half of a sentence's claims is the ADR 019 third state again: not
 * passing, not failing, simply unexamined.
 *
 * The `{0,2}` word gap is there for the same reason, and it is the sharper case. The unit
 * had to be *adjacent* to the number, so **every single figure in the stale baseline was
 * invisible to this sweep** — "1913 unit tests", "488 E2E tests", "443 unit tests",
 * "11 E2E spec files", "17 spec files". Only "74 files" happened to be written without an
 * intervening word. The one document this check most needed to reach was also phrased in
 * the one way it could not read.
 *
 * Per [ADR 007](../../../docs/adr/007-regex-guardrails-have-unknown-coverage.md) this still
 * has unknown coverage: three intervening words hides a number again. Measured before
 * widening, the gap surfaces exactly those five figures across the whole corpus and no
 * false positives — which is evidence about today's prose, not a guarantee about tomorrow's.
 */
const NUMERIC =
  /(?<![\w.])(\d+(?:\.\d+)?)\s*(?:[\w+/-]+\s+){0,2}(px|:1|%|ms\b|min\b|tests?\b|files?\b)/g

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
/** Spec files on disk, which is the only thing that can answer "did the suite shrink?". */
function countFiles(dir: string, match: (name: string) => boolean): number {
  let n = 0
  for (const entry of readdirSync(join(ROOT, dir))) {
    const full = join(ROOT, dir, entry)
    if (statSync(full).isDirectory()) n += countFiles(join(dir, entry), match)
    else if (match(entry)) n += 1
  }
  return n
}

const CONVENTIONS = '.claude/skills/project-conventions/SKILL.md'
const LOOP_BUDGET_SKILL = '.claude/skills/loop-budget/SKILL.md'

/** The one number in a document that another document also states. */
function stated(doc: string, pattern: RegExp): string {
  return String(read(doc).match(pattern)?.[1])
}

const LIVE: Array<{ doc: string; context: string; claimed: string; actual: () => string }> = [
  {
    // `claimed` restates the figure the document carries rather than deriving it, and that
    // is the point: a `claimed` computed from the same source as `actual` compares a value
    // to itself and passes forever. Written out, the pair fails in both directions — the
    // tree grows and the document is stale, or the document is edited and the tree did not
    // move. The first draft of this entry was the circular version, and it sailed through a
    // mutation that changed the document to say 600.
    //
    // The count whose staleness was the entire defect. It read 443 for four weeks against a
    // real 1913, and nothing compared it to anything — the fix at the time was prose telling
    // readers not to trust it. This is the comparison that prose stood in for.
    doc: CONVENTIONS,
    context: '**76 unit spec files**',
    claimed: '76',
    actual: () => String(countFiles('src/tests', (f) => /\.test\.tsx?$/.test(f))),
  },
  {
    doc: CONVENTIONS,
    context: '**17 E2E spec files**',
    claimed: '17',
    actual: () => String(countFiles('e2e', (f) => /\.spec\.ts$/.test(f))),
  },
  {
    doc: CONVENTIONS,
    context: '(80%+ required, per CLAUDE.md)',
    claimed: '80',
    actual: () => String(read('vitest.config.ts').match(/lines:\s*(\d+)/)?.[1]),
  },
  {
    // Two documents state one budget policy. loop-constraints.md is the binding one and the
    // skill is what a loop actually executes, so they have to agree — and until 2026-08-31
    // the binding file stated only the 80% rule, omitting the hard stop the skill enforces.
    doc: 'loop-constraints.md',
    context: 'If token spend hits 80% of daily cap',
    claimed: '80',
    actual: () => stated(LOOP_BUDGET_SKILL, /spend ≥ (\d+)% of the pattern's daily cap/),
  },
  {
    doc: 'loop-constraints.md',
    context: 'If token spend hits 100% of daily cap',
    claimed: '100',
    actual: () => stated(LOOP_BUDGET_SKILL, /spend ≥ (\d+)% or `loop-pause-all`/),
  },
  {
    doc: LOOP_BUDGET_SKILL,
    context: "spend ≥ 80% of the pattern's daily cap",
    claimed: '80',
    actual: () => stated('loop-constraints.md', /token spend hits (\d+)% of daily cap, switch/),
  },
  {
    doc: LOOP_BUDGET_SKILL,
    context: 'spend ≥ 100% or `loop-pause-all`',
    claimed: '100',
    actual: () => stated('loop-constraints.md', /token spend hits (\d+)% of daily cap, exit/),
  },
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
  // The recorded totals. Frozen on purpose: nothing here can re-run the suites, and a
  // number nobody can re-measure must be dated rather than pretended into a live claim.
  { doc: CONVENTIONS, context: 'Measured on `main` at 2026-08-30' },
  { doc: CONVENTIONS, context: '488 E2E tests.' },
  { doc: CONVENTIONS, context: 'This section read "443 unit tests and' },
  { doc: CONVENTIONS, context: '11 E2E spec files" from 2026-08-01' },
  { doc: CONVENTIONS, context: '1913 and 17 — so a collapse from 1913 to 600' },
  { doc: 'docs/go-live-runbook.md', context: 'discarded 75% of the frame at 390px' },
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
  it('every named agent-facing document is on disk', () => {
    // A renamed document must fail here rather than dropping out of the scope. The list
    // used to be filtered by existence, which meant the sweep quietly shrank to fit
    // whatever was still there — a check that stops covering what it was written for
    // without ever going red.
    expect(missingAgentDocuments(), 'named but not found').toEqual([])
  })

  it('the corpus carries numeric tokens', () => {
    // Corpus-level, not per-document: several of these files legitimately contain no
    // numbers at all, and demanding one from each would push authors to invent them.
    // What this catches is the sweep matching nothing, which every assertion below is
    // vacuously true over (ADR 020).
    const total = LIVE_DOCUMENTS.reduce((n, doc) => n + [...read(doc).matchAll(NUMERIC)].length, 0)
    expect(total, 'the whole agent-facing corpus has no numeric tokens').toBeGreaterThan(10)
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
