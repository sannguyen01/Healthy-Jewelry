/**
 * The commercial-terms lexicon — the words that mark a contractual term of sale — and the
 * pure counter `legal-review-inventory.test.tsx` runs over rendered pages and source.
 *
 * ## Why this is a count, not a prohibition
 *
 * The claim lexicon forbids. This one only **measures**, because the text it finds is not
 * engineering's to change. The body of `/terms`, `/shipping` and `/legal`, and the FAQ
 * answers that restate them, are commercial terms — free shipping, a thirty-day returns
 * window, a refund route, a lifetime warranty, a dispatch time — offered by a business that
 * takes no orders on this site. Whether each still holds, and in what words, is a question
 * for an adviser qualified in Vietnamese consumer law (masterplan WS-H), not for a copy edit
 * in a pull request. Rewriting it here would be engineers drafting contract terms; deleting
 * it would leave a returns policy nobody can find for pieces that are still arranged and
 * delivered.
 *
 * So the text stands and is **held**: every occurrence is counted per file and pinned with
 * equality (ADR 021). An edit that adds a term, removes one or moves one fails the pin, and
 * the failure is the prompt to route the change through WS-H rather than through review
 * alone.
 *
 * ## Offer terms and topic terms
 *
 * A search snippet should say what a page is *for*, not restate the terms as an offer:
 * "Free shipping on all … orders worldwide. 7–14 day international delivery. 30-day returns."
 * was `/shipping`'s description until 2026-09-26, and in a results page it reads as an online
 * store. But a page called "Shipping & Returns" cannot be described without naming returns.
 * `offer` terms state a term (free, a number of days, a refund, a warranty, a dispatch time,
 * a purchase route); `topic` terms name a subject. Metadata descriptions are held to zero
 * `offer` terms; the body inventory counts both.
 *
 * Like every word list here, coverage is a floor ([ADR 007](../../../docs/adr/007-regex-guardrails-have-unknown-coverage.md)):
 * each pattern is generalised from wording that is live on the four pages today, pinned to
 * it verbatim in `from`.
 */

export type CommercialTermKind = 'offer' | 'topic'

export interface CommercialTerm {
  id: string
  kind: CommercialTermKind
  pattern: RegExp
  /** The live wording this term was generalised from. */
  from: string
}

export const COMMERCIAL_TERMS: readonly CommercialTerm[] = [
  {
    id: 'free-shipping',
    kind: 'offer',
    pattern:
      /\bfree\s+(?:worldwide\s+|international\s+|size\s+)?(?:shipping|delivery|exchanges?|returns?)\b|\b(?:shipping|delivery)\s+is\s+free\b|\bships?\s+free\b/i,
    from: 'Free shipping on all orders — no minimum.',
  },
  {
    id: 'returns',
    kind: 'topic',
    // The noun and its forms, not the verb: "Return home" on the error page and "may return
    // without a composition document" in a review note are not a returns policy.
    pattern:
      /\breturns\b|\breturn(?:able|ed)\b|\b(?:a|your|the|any)\s+return\b|\breturn\s+(?:label|policy|window|request)s?\b|\bexchang(?:e|es|eable|ed)\b/i,
    from: 'We accept returns within 30 days of delivery',
  },
  { id: 'refund', kind: 'offer', pattern: /\brefund/i, from: 'your refund is processed by' },
  { id: 'warranty', kind: 'offer', pattern: /\bwarrant(?:y|ies)\b/i, from: 'Lifetime Warranty' },
  { id: 'dispatch', kind: 'offer', pattern: /\bdispatch/i, from: 'A confirmed arrangement is dispatched within 1 business day.' },
  {
    id: 'delivery-time',
    kind: 'offer',
    pattern:
      /\bdelivery\s+time\b|\b\d+(?:\s*[–—-]\s*\d+)?[\s-]*(?:business\s+|working\s+)?days?\b|\b(?:one|two|three|five|seven|ten|fourteen|thirty|sixty|ninety)[\s-]+(?:business\s+|working\s+)?days?\b/i,
    from: 'arrives in 7–14 business days internationally',
  },
  { id: 'how-to-buy', kind: 'offer', pattern: /\bhow\s+(?:do|can)\s+i\s+(?:buy|order|purchase)\b/i, from: 'How do I buy something?' },
]

export type TermCounts = Record<string, number>

/** Occurrences of every term in `text`, keyed by term id; terms with no occurrence are omitted. */
export function countCommercialTerms(
  text: string,
  kinds: readonly CommercialTermKind[] = ['offer', 'topic']
): TermCounts {
  const flat = text.replace(/\s+/g, ' ')
  const counts: TermCounts = {}
  for (const term of COMMERCIAL_TERMS) {
    if (!kinds.includes(term.kind)) continue
    const global = new RegExp(term.pattern.source, term.pattern.flags.includes('g') ? term.pattern.flags : `${term.pattern.flags}g`)
    const n = [...flat.matchAll(global)].length
    if (n > 0) counts[term.id] = n
  }
  return counts
}

export function total(counts: TermCounts): number {
  return Object.values(counts).reduce((sum, n) => sum + n, 0)
}

export interface TermDrift {
  term: string
  pinned: number
  measured: number
}

/**
 * Every term whose measured count differs from its pin, in lexicon order — an empty list
 * means the text is exactly as inventoried. A term absent from either side counts as 0, so
 * a term appearing for the first time and one disappearing entirely are both drift.
 */
export function inventoryDrift(pinned: TermCounts, measured: TermCounts): TermDrift[] {
  return COMMERCIAL_TERMS.map((t) => ({
    term: t.id,
    pinned: pinned[t.id] ?? 0,
    measured: measured[t.id] ?? 0,
  })).filter((d) => d.pinned !== d.measured)
}
