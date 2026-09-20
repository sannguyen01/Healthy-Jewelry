import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseSource, importsFrom } from '@/lib/analysis/tsAstScan'
import { BROWSE_ONLY_STATEMENT, ORDER_REFERENCE_HINT } from '@/config/site'

/**
 * **What the site says about how it sells, held against what it can do.**
 *
 * ## The gap this closes
 *
 * PR #75 removed Add to Bag on 2026-09-19. PR #82 retired `/cart`, `/checkout` and
 * `/account`. Neither touched a word of copy, and nothing could have noticed: prose has no
 * type checker, and every reconciliation this repository owns checks *numbers* in
 * documents (`doc-numeric-claims`), *claims about controls* (`control-registry`) or
 * *rendered geometry* (the E2E suite). A sentence that describes a capability is none of
 * those.
 *
 * So for a window, `/terms` listed Visa, Mastercard, PayPal and bank transfer as accepted
 * payment methods on a site that processes no payments; `/shipping` opened "All orders ship
 * free" with no way to place one; `/faq` told a customer to email "with your order number"
 * from an order-confirmation email this site never sends; and `/stores` — the page somebody
 * reads to find out how to actually get one — said the brand was "available exclusively
 * online".
 *
 * Meanwhile `/checkout` answered 410 with "This catalogue no longer accepts online orders."
 * Five pages, two answers.
 *
 * ## What is checked, and what deliberately is not
 *
 * This does **not** check that the copy reads well, or that the terms are the right terms.
 * It checks two things a machine can:
 *
 *   1. every page that describes the order lifecycle carries `BrowseOnlyNotice`, which is
 *      the one place the statement lives;
 *   2. no page claims a capability this deployment does not have — a cart, a checkout, a
 *      payment form, or an order number issued by this site.
 *
 * The second is a word list, which [ADR 007](../../../docs/adr/007-regex-guardrails-have-unknown-coverage.md)
 * is blunt about: unknown coverage. It is here anyway because the alternative is nothing,
 * and because the specific phrasings it catches are the ones that were actually wrong. It
 * is a floor, not a proof — which is why it names that limitation rather than implying
 * completeness.
 */

const APP = join(process.cwd(), 'src/app')

/** Pages that describe how a piece is obtained, and therefore carry the statement. */
const TRANSACTIONAL_PAGES = ['terms', 'shipping', 'faq'] as const

/** Pages that describe the brand's reach and must not contradict it. */
const ALL_COPY_PAGES = [
  ...TRANSACTIONAL_PAGES,
  'privacy',
  'legal',
  'contact',
  'stores',
  'about',
  'materials',
] as const

const source = (page: string) => readFileSync(join(APP, page, 'page.tsx'), 'utf8')

describe('the browse-only statement has one home', () => {
  it.each(TRANSACTIONAL_PAGES)('/%s renders BrowseOnlyNotice', (page) => {
    const path = join(APP, page, 'page.tsx')
    const imported = importsFrom(parseSource(path, source(page)), '@/components/ui/BrowseOnlyNotice')
    expect(
      imported.map((b) => b.imported),
      `/${page} describes the order lifecycle and does not carry the browse-only notice. ` +
        `A visitor reading it has no way to learn that this site takes no orders.`
    ).toContain('BrowseOnlyNotice')

    expect(source(page)).toContain('<BrowseOnlyNotice />')
  })

  it('no page restates the statement instead of importing it', () => {
    // Two copies of one sentence is how `/terms` and `/checkout` ended up saying opposite
    // things. A distinctive fragment is enough to catch a paste.
    const fragment = 'does not take orders on this site'
    for (const page of ALL_COPY_PAGES) {
      expect(
        source(page).includes(fragment),
        `/${page} contains the statement's text rather than <BrowseOnlyNotice />.`
      ).toBe(false)
    }
  })

  it('the statement says what is true as well as what is not', () => {
    // "No online orders" alone reads as a fault. The next step has to be in the same
    // breath, or the notice converts a customer into a dead end.
    expect(BROWSE_ONLY_STATEMENT).toMatch(/ambassador/i)
    expect(BROWSE_ONLY_STATEMENT).toMatch(/contact/i)
  })

  it('the order-reference hint names something a customer actually holds', () => {
    // Not "your order number": this site issues none.
    expect(ORDER_REFERENCE_HINT).not.toMatch(/order number/i)
    expect(ORDER_REFERENCE_HINT).toMatch(/ambassador|email address/i)
  })
})

describe('no page claims a capability this deployment does not have', () => {
  /**
   * Each entry is a phrasing that was live and wrong, generalised only as far as the
   * evidence supports. Deliberately narrow: a rule that flagged the word "order" would
   * fire on "a piece you have arranged", "order of magnitude" and every legitimate
   * sentence about fulfilment, and would be switched off within a week.
   */
  const FORBIDDEN: Array<{ pattern: RegExp; why: string }> = [
    {
      pattern: /your (?:shopping )?cart/i,
      why: 'there is no cart; /cart answers 308 to /shop',
    },
    {
      pattern: /\bat checkout\b|\bduring checkout\b|\bproceed to checkout\b/i,
      why: 'there is no checkout; /checkout answers 410',
    },
    {
      pattern: /we accept the following payment methods/i,
      why: 'this site processes no payments, so it accepts none',
    },
    {
      pattern: /\b(?:visa|mastercard|paypal)\b/i,
      why: 'naming a card scheme claims this site takes card payments',
    },
    {
      pattern: /with your order number/i,
      why: 'this site sends no order-confirmation email, so there is no order number from it',
    },
    {
      pattern: /available exclusively online/i,
      why: 'the brand sells through ambassadors; this is the reverse of the truth',
    },
    {
      pattern: /add to (?:bag|cart)/i,
      why: 'the control was removed in PR #75',
    },
  ]

  /**
   * Comments are skipped, and it is load-bearing: several of these pages now carry a block
   * explaining *which* wrong sentence was removed and why, quoting it. A scan that counted
   * those would make the record of the fix the offence, and the only way to go green would
   * be to delete the explanation.
   */
  function prose(page: string): string {
    let inBlock = false
    return source(page)
      .split('\n')
      .filter((line) => {
        const t = line.trimStart()
        if (inBlock) {
          if (t.includes('*/')) inBlock = false
          return false
        }
        if (t.startsWith('//')) return false
        if (t.startsWith('/*') || t.startsWith('{/*')) {
          if (!t.includes('*/')) inBlock = true
          return false
        }
        return !t.startsWith('*')
      })
      .join('\n')
  }

  it('finds copy to check', () => {
    // A path mistake would make every assertion below vacuously green.
    for (const page of ALL_COPY_PAGES) {
      expect(prose(page).length, `/${page} read as empty`).toBeGreaterThan(500)
    }
  })

  it.each(ALL_COPY_PAGES)('/%s', (page) => {
    const text = prose(page)
    const found = FORBIDDEN.filter((rule) => rule.pattern.test(text)).map(
      (rule) => `${rule.pattern} — ${rule.why}`
    )
    expect(found, `/${page} claims something this deployment cannot do:\n  ${found.join('\n  ')}`).toEqual(
      []
    )
  })

  it('the rule set can actually fire', () => {
    // ADR 024: a detector whose passing state is an empty array and which has never been
    // shown failing is a first draft. These are the exact strings that were live.
    const wasLive = [
      'We accept the following payment methods:',
      'Credit and debit cards (Visa, Mastercard)',
      'Email support@healthyjewellery.com with your order number to initiate a return.',
      'Healthy Jewelry is available exclusively online.',
      'your name as provided during checkout or contact',
    ]
    for (const line of wasLive) {
      expect(
        FORBIDDEN.some((rule) => rule.pattern.test(line)),
        `nothing in FORBIDDEN catches: ${line}`
      ).toBe(true)
    }
  })

  it('does not fire on the copy that replaced it', () => {
    const nowLive = [
      'Pieces are arranged directly with a Healthy Jewelry ambassador.',
      'Shipping is free on every piece, wherever it is going.',
      'A confirmed arrangement is dispatched within 1 business day.',
      'Payment for a piece is arranged directly with your ambassador.',
      'Arranged in person, through a Healthy Jewelry ambassador.',
    ]
    for (const line of nowLive) {
      expect(
        FORBIDDEN.some((rule) => rule.pattern.test(line)),
        `a legitimate sentence is flagged: ${line}`
      ).toBe(false)
    }
  })
})
