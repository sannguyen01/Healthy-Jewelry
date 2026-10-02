/**
 * The claim lexicon — the words that mark a health, skin, imaging, regulatory, corrosion or
 * durability claim — and the pure detector `claim-lexicon.test.tsx` runs over rendered
 * output and source.
 *
 * ## Why a word list, and what it can and cannot see
 *
 * [ADR 007](../../../docs/adr/007-regex-guardrails-have-unknown-coverage.md) is blunt about
 * word lists: their coverage is unknown. This one is here anyway, for the reason
 * `browse-only-copy.test.tsx` gives for its own: the alternative is nothing, and every
 * pattern below is generalised from a phrasing that was **live** on this site until
 * 2026-09-26 — the known-answer table in the test is those strings verbatim. It is a floor.
 * A claim phrased in words nobody has used yet ("kind to skin", "gentle on ears") passes it,
 * which is why the registry, not this list, is the control: a claim is supposed to arrive as
 * a record, and this list catches the ones that arrive as copy instead.
 *
 * ## Allowed spans, not an allowed-word list
 *
 * A term is permitted only inside an *approved claim's wording* (or an explicit, reasoned
 * exemption such as a legal disclaimer). The detector removes those exact spans from the
 * text and scans what is left, so "Hypoallergenic" is allowed where an approved claim
 * rendered it and nowhere else — including in the sentence right beside it.
 *
 * Pure and dependency-free: it runs in a test, and nothing here may reach a client bundle
 * by accident with a validator attached.
 */

export interface LexiconTerm {
  id: string
  pattern: RegExp
  /** The live phrasing this term was generalised from. */
  from: string
}

/**
 * Case-insensitive, word-bounded where a bare stem would over-match: `\bleach` so that
 * "bleach" in a care instruction is not a leaching claim; `sensiti[sz]` so that
 * "sensitive personal data" on /privacy is not a sensitisation claim.
 */
export const CLAIM_LEXICON: readonly LexiconTerm[] = [
  { id: 'hypoallergenic', pattern: /hypo-?allergen/i, from: 'Hypoallergenic' },
  { id: 'allergen', pattern: /\ballerg/i, from: 'No clasp allergens' },
  { id: 'biocompatible', pattern: /bio-?compatib/i, from: 'naturally biocompatible' },
  { id: 'implant-grade', pattern: /implant[\s-]*grade/i, from: 'Implant-Grade Titanium' },
  { id: 'surgical-implant', pattern: /surgical\s+implant/i, from: 'used in surgical implants' },
  { id: 'medical-implant', pattern: /medical\s+(?:implant|device)/i, from: 'the same standard used in medical devices' },
  { id: 'implantable', pattern: /\bimplantable\b/i, from: 'implantable medical devices' },
  { id: 'mri-safe', pattern: /\bmri[\s-]*safe/i, from: '·MRI SAFE·' },
  { id: 'fda', pattern: /\bfda\b/i, from: 'FDA-recognized' },
  { id: 'nickel-free', pattern: /nickel[\s-]*free|zero\s+nickel|no\s+nickel|negligible\s+nickel/i, from: 'Mirror-polished, nickel-free' },
  { id: 'skin-safe', pattern: /skin[\s-]*safe/i, from: 'Skin-safe: Yes' },
  { id: 'sensitive-skin', pattern: /sensitive\s+skin/i, from: 'safe for sensitive skin?' },
  { id: 'metal-sensitivity', pattern: /metal\s+sensitivit/i, from: 'built for people with metal sensitivities' },
  { id: 'leach', pattern: /\bleach/i, from: 'do not leach ions' },
  { id: 'sensitisation', pattern: /sensiti[sz]/i, from: 'prevents sensitization' },
  { id: 'dermatitis', pattern: /dermatitis/i, from: 'trigger contact dermatitis' },
  { id: 'no-reaction', pattern: /(?:does|do)\s+not\s+react|without\s+reaction|no\s+reaction/i, from: 'the body simply does not react to it' },
  { id: 'corrosion-proof', pattern: /corrosion[\s-]*proof|no\s+corrosion/i, from: 'Hypoallergenic, corrosion-proof' },
  {
    id: 'does-not-corrode',
    pattern: /(?:does|do|will|would|can)\s+not\s+(?:ever\s+)?corrode|(?:cannot|won't|doesn't|don't)\s+(?:ever\s+)?corrode|never\s+corrode/i,
    from: 'do not corrode under normal wear conditions',
  },
  { id: 'it-will-not', pattern: /\bit\s+will\s+not\b/i, from: 'If it corrodes, we replace it. It will not' },
  { id: 'no-tarnish', pattern: /no\s+tarnish|never\s+tarnish|(?:will|does)\s+not\s+tarnish|tarnish[\s-]*free/i, from: 'No tarnish. Ever.' },
  { id: 'colour-stability', pattern: /lifetime\s+colou?r|colou?r[\s-]*stab/i, from: 'Lifetime color stability' },
  { id: 'medical-grade', pattern: /medical[\s-]*grade/i, from: 'Medical grade' },
  { id: 'positioning', pattern: /works?\s+with\s+your\s+body/i, from: 'Metal that works with your body.' },
  { id: 'body-accepts', pattern: /(?:trusted|validated)\s+(?:inside|in)\s+the\s+(?:human\s+)?body|body\s+accepts/i, from: 'the body accepts them without reaction' },
]

export interface LexiconHit {
  term: string
  match: string
  /** A few words either side, so a failure names the sentence. */
  context: string
}

/** Collapse runs of whitespace, so a phrase split across JSX lines is still one phrase. */
export function normaliseWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

/**
 * Every lexicon term in `text` that is not inside an allowed span.
 *
 * Allowed spans are removed before scanning — replaced with a separator so the words either
 * side cannot join into a new match — and matching is case-insensitive while span removal
 * is exact, so an approved wording permits itself and not a paraphrase.
 */
export function findClaimTerms(text: string, allowed: readonly string[] = []): LexiconHit[] {
  let remaining = normaliseWhitespace(text)
  for (const span of allowed.map(normaliseWhitespace).filter(Boolean)) {
    remaining = remaining.split(span).join(' | ')
  }

  const hits: LexiconHit[] = []
  for (const term of CLAIM_LEXICON) {
    // `matchAll` demands the global flag. A Set, because `new RegExp(src, 'gig')` throws.
    const global = new RegExp(term.pattern.source, [...new Set(`${term.pattern.flags}g`)].join(''))
    for (const m of remaining.matchAll(global)) {
      const at = m.index
      hits.push({
        term: term.id,
        match: m[0],
        context: remaining.slice(Math.max(0, at - 40), at + m[0].length + 40),
      })
    }
  }
  return hits
}
