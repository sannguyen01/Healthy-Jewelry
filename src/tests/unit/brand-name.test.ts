import { describe, it, expect } from 'vitest'
import { filesUnder, jsonStrings, read } from '@/tests/support/renderedStrings'
import { rawClaims, rawCollections, rawProducts } from '@/lib/catalog/manifest'
import type { ClaimsRegistry } from '@/lib/catalog/claims-schema'
import { LEGAL_ENTITY_NAME, SITE_NAME, SITE_URL } from '@/config/site'

const { splitPositions, languageOf } = await import('../../../scripts/lib/commerce-contract.mjs')

/**
 * **One brand, one spelling, one place it is written.**
 *
 * Until 2026-10-04 the header said "HEALTHY JEWELLERY" and the footer beneath it said
 * "Healthy Jewelry" — on the same page, a few hundred pixels apart. The page titles, the share
 * cards and the contact email said "Jewelry"; the 410 pages put "Jewellery" in the tab and
 * "Jewelry" in the paragraph under it. Nobody chose either; each surface was typed by hand, so
 * each was spelled however its author spelled it that day. The owner chose "Healthy Jewellery",
 * which is also how the domain is spelled.
 *
 * So the rule is not "spell it right" — that is a memo — it is **"do not type it"**: every
 * display goes through `SITE_NAME`, and a literal of *either* spelling in rendered code fails
 * here. A retyped correct spelling is the same defect waiting for the next rename.
 *
 * What is scanned is *code*, positions the shared commerce-contract lexer classifies as code
 * rather than comment, so file headers that say "Healthy Jewelry — ..." are history, not copy.
 * Test files are not scanned: they quote retired copy as fixtures on purpose.
 */

const OLD = /healthy[\s-]+jewelry/i
const NEW = /healthy[\s-]+jewellery/i

/**
 * Where the old spelling stays, each for a stated reason. A file listed here that no longer
 * contains it fails too: an allowance that outlives its subject is a hole with a label on it.
 */
const OLD_SPELLING_ALLOWED: Record<string, string> = {
  'src/config/site.ts':
    'LEGAL_ENTITY_NAME: the registered company. Whether it has one "l" or two is a fact about a registration, and counsel\'s to change (WS-H).',
  'src/app/legal/page.tsx':
    'A legal instrument naming the company, its address and its trademarks. Held for WS-H, not restyled.',
  'src/app/terms/page.tsx':
    'The contracting party in the terms of use, warranty and liability text. Held for WS-H.',
  'src/app/privacy/page.tsx': 'The data controller in a data-protection notice owned by WS-G.',
  'src/app/shipping/page.tsx':
    'A held page in the legal-review inventory (legal-review-inventory.test.tsx). Its wording moves with the adviser, not with a rename.',
}

/** Where the new spelling may be typed: the constant itself, and nowhere else. */
const NEW_SPELLING_ALLOWED: Record<string, string> = {
  'src/config/site.ts': 'SITE_NAME is defined here.',
}

/**
 * Claim wordings carrying the old spelling. A pending claim renders its fallback, and its
 * wording is the claims reviewer's text, not this sweep's. The day it is approved, the wording
 * renders, so the allowance is conditional on the claim still being unapproved.
 */
const PENDING_CLAIMS_ALLOWED: Record<string, string> = {
  'faq-continuous-wear': '"no need to remove your Healthy Jewelry for sleep": pending; reviewer to correct on approval.',
}

const SOURCES = filesUnder(['src', 'e2e'], /\.(tsx?|mjs|css)$/).filter((f) => !f.startsWith('src/tests/'))

/** Every line of code (not comment) in `file` that matches `pattern`. */
function codeHits(file: string, source: string, pattern: RegExp): string[] {
  const { code } = splitPositions(source, languageOf(file)) as { code: string[] }
  return code.flatMap((line, i) => (pattern.test(line) ? [`${file}:${i + 1}: ${line.trim()}`] : []))
}

function sweep(pattern: RegExp, allowed: Record<string, string>) {
  const stray: string[] = []
  const used = new Set<string>()
  for (const file of SOURCES) {
    const hits = codeHits(file, read(file), pattern)
    if (hits.length === 0) continue
    if (file in allowed) used.add(file)
    else stray.push(...hits)
  }
  return { stray, unused: Object.keys(allowed).filter((f) => !used.has(f)) }
}

describe('the brand name is written once', () => {
  it('finds the sources to sweep', () => {
    // A path mistake would make every case below vacuously green. 127 on 2026-10-04.
    expect(SOURCES.length).toBeGreaterThan(100)
    expect(SOURCES).toContain('src/components/layout/Footer.tsx')
    expect(SOURCES).toContain('e2e/navigation.spec.ts')
    expect(SOURCES).not.toContain('src/tests/unit/brand-name.test.ts')
  })

  it('the display name and the legal name are what the owner and counsel set', () => {
    expect(SITE_NAME).toBe('Healthy Jewellery')
    expect(LEGAL_ENTITY_NAME).toBe('Healthy Jewelry')
  })

  it('no rendered code types the old spelling outside the held legal pages', () => {
    const { stray, unused } = sweep(OLD, OLD_SPELLING_ALLOWED)
    expect(stray, `Use SITE_NAME (display) or LEGAL_ENTITY_NAME (the company):\n${stray.join('\n')}`).toEqual([])
    expect(unused, 'allowances whose file no longer carries the old spelling — delete them').toEqual([])
  })

  it('no rendered code retypes the new spelling either', () => {
    const { stray, unused } = sweep(NEW, NEW_SPELLING_ALLOWED)
    expect(stray, `Use SITE_NAME instead of typing the name:\n${stray.join('\n')}`).toEqual([])
    expect(unused).toEqual([])
  })

  it('no catalogue record and no rendered claim text carries the old spelling', () => {
    const registry = rawClaims as ClaimsRegistry
    const records = [...rawProducts, ...rawCollections].flatMap((r) => jsonStrings(r).map((s) => s.text))
    expect(records.filter((t) => OLD.test(t))).toEqual([])
    expect(registry.claims.filter((c) => OLD.test(c.fallback)).map((c) => c.id)).toEqual([])

    const wordings = registry.claims.filter((c) => OLD.test(c.wording))
    expect(wordings.map((c) => c.id).sort()).toEqual(Object.keys(PENDING_CLAIMS_ALLOWED).sort())
    for (const claim of wordings) {
      expect(claim.decision.state, `${claim.id} would render the old spelling once approved`).not.toBe('approved')
    }
  })
})

describe('the sweep can fail (ADR 024)', () => {
  it('flags JSX text, a string and a template, and ignores a comment', () => {
    const source = [
      '// Healthy Jewelry — a file header is history',
      'const a = <p>Healthy Jewelry</p>',
      "const b = 'HEALTHY JEWELRY'",
      'const c = `${x} Healthy-Jewelry`',
      '/* Healthy Jewelry in a block comment */',
    ].join('\n')
    expect(codeHits('src/x.tsx', source, OLD).map((h) => h.split(':')[1])).toEqual(['2', '3', '4'])
  })

  it('tells the two spellings apart', () => {
    expect(OLD.test('Healthy Jewellery')).toBe(false)
    expect(NEW.test('Healthy Jewelry')).toBe(false)
    // An identifier or a domain is not the name: no separator, so neither pattern fires.
    expect(OLD.test('HealthyJewelry')).toBe(false)
    expect(NEW.test(SITE_URL)).toBe(false)
  })
})
