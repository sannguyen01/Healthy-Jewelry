import { beforeAll, describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import type { ReactElement } from 'react'
import { CLAIM_LEXICON, findClaimTerms, type LexiconHit } from '@/lib/catalog/claim-lexicon'
import { approvedWordingSpans, resolveClaim } from '@/lib/catalog/claims'
import type { ClaimsRegistry } from '@/lib/catalog/claims-schema'
import { getAllProducts, getClaimsRegistry } from '@/lib/catalog'
import { rawClaims, rawCollections, rawProducts } from '@/lib/catalog/manifest'
import { filesUnder, jsonStrings, read, sourceStrings, visibleText } from '@/tests/support/renderedStrings'
import { ProductDetail } from '@/components/product/ProductDetail'
import { ProductCard } from '@/components/product/ProductCard'
import { Footer } from '@/components/layout/Footer'
import { productJsonLd, organizationJsonLd } from '@/components/seo/JsonLd'
import HomePage, { generateMetadata as homeMetadata } from '@/app/page'
import MaterialsPage, { metadata as materialsMetadata } from '@/app/materials/page'
import FAQPage, { metadata as faqMetadata } from '@/app/faq/page'
import AboutPage, { metadata as aboutMetadata } from '@/app/about/page'
import LegalPage, { metadata as legalMetadata } from '@/app/legal/page'
import TermsPage, { metadata as termsMetadata } from '@/app/terms/page'
import ShippingPage, { metadata as shippingMetadata } from '@/app/shipping/page'
import StoresPage, { metadata as storesMetadata } from '@/app/stores/page'
import { metadata as shopMetadata } from '@/app/shop/page'
import { metadata as layoutMetadata } from '@/app/layout'

/**
 * **No claim renders outside approved wording.**
 *
 * The claims registry decides what may be said about the metals. This file decides whether
 * anything is being said *around* it — a health, skin, imaging, regulatory, corrosion or
 * durability claim written straight into a page, a component, a config constant, a
 * catalogue description or a metadata field, where no reviewer and no document ever see it.
 *
 * Modelled on `price-absence-contract.test.tsx`, and for the same reason it asks twice:
 *
 * - **rendered output** — the pages and components a visitor sees, their metadata and their
 *   structured data — proves what today's surfaces do;
 * - **source** — every string literal and JSX text in `src/app`, `src/components`,
 *   `src/config`, `src/lib/data`, and every rendered string in `src/content` — proves that
 *   no *other* module, including one added next month, carries a claim as copy.
 *
 * A term is allowed only inside an approved claim's wording (none today — enforce now) or an
 * exemption below, each with a reason and each required to still match something.
 */

// ── Environment ────────────────────────────────────────────────────────────

beforeAll(() => {
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
      takeRecords() {
        return []
      }
      root = null
      rootMargin = ''
      thresholds = []
    }
  )
})

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode; [key: string]: unknown }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}))

/**
 * `layout.tsx` calls the font loaders at module scope, and outside the Next compiler they are
 * not functions. Only its `metadata` export is read here — the keywords and default
 * description are the widest-reaching claim surface the site has — so a face with no
 * letterforms is enough.
 */
vi.mock('next/font/google', () => {
  const face = () => ({ className: '', variable: '', style: { fontFamily: '' } })
  return { Barlow_Condensed: face, DM_Sans: face }
})

// ── The allowance ──────────────────────────────────────────────────────────

const NOW = new Date()
const REGISTRY = getClaimsRegistry()

/**
 * Legal instruments that name a lexicon term without asserting it. WS-H's to revise, not
 * this workstream's — so they are exempted by exact span, file and route, with the reason
 * written here, and each must still match (an exemption outliving its text is an old note
 * that reads as a considered decision — ADR 021).
 */
const LEGAL_EXEMPTIONS: ReadonlyArray<{ file: string; route: string; span: string; reason: string }> = [
  {
    file: 'src/app/legal/page.tsx',
    route: '/legal',
    span: 'The tagline “Metal that works with your body” is the proprietary brand copy of Healthy Jewelry.',
    reason:
      'A trademark notice names the mark; it does not assert what the mark says. The line itself is a ' +
      'pending claim and no longer renders anywhere else.',
  },
  {
    file: 'src/app/legal/page.tsx',
    route: '/legal',
    span:
      'This information is not a substitute for professional medical advice regarding biocompatibility for ' +
      'specific medical conditions. Consult a medical professional if you have concerns about metal ' +
      'sensitivity or implanted devices.',
    reason: 'A disclaimer negates a claim rather than making one; removing it would make the page less careful.',
  },
]

const ALLOWED = [...approvedWordingSpans(REGISTRY, NOW)]
const allowedFor = (where: string) => [
  ...ALLOWED,
  ...LEGAL_EXEMPTIONS.filter((e) => e.file === where || e.route === where).map((e) => e.span),
]

function describeHits(hits: LexiconHit[]): string {
  return hits.map((h) => `  [${h.term}] "${h.match}" … ${h.context}`).join('\n')
}

function expectNoClaims(text: string, where: string) {
  const hits = findClaimTerms(text, allowedFor(where))
  expect(
    hits,
    `${where} renders a claim outside approved wording:\n${describeHits(hits)}\n\n` +
      `A health, skin, imaging, regulatory or corrosion statement belongs in ` +
      `src/content/claims/claims.json, where it renders only once a named reviewer has ` +
      `approved it against a document. Route it through claimText() or rewrite it as a ` +
      `specification.`
  ).toEqual([])
}

// ── The detector, pointed at known answers (ADR 024) ───────────────────────

describe('the lexicon catches every phrasing that was live, and nothing that is not a claim', () => {
  /** Verbatim from the site as it stood on 2026-09-25. */
  const WAS_LIVE = [
    '·IMPLANT GRADE·',
    '·HYPOALLERGENIC·',
    '·MRI SAFE·',
    'Healthy Jewelry — Implant-Grade Titanium',
    'Grade 23 titanium. Mirror-polished arc profile. Hypoallergenic.',
    '316L surgical steel disc charm. Mirror-polished, nickel-free.',
    'Anodized niobium belcher chain. No clasp allergens.',
    'Cuffs and bangles. No tarnish. Ever.',
    'Lifetime color stability',
    'FDA-recognized',
    'Medical grade',
    'Low carbon content prevents sensitization over extended wear.',
    'do not leach ions that trigger contact dermatitis',
    'Are these metals safe for sensitive skin?',
    'built for people with metal sensitivities',
    'Metal that works with your body.',
    'Hypoallergenic, corrosion-proof, and designed to last a lifetime.',
    'Skin-safe',
    'The same alloy used in surgical implants and aerospace structures.',
    'the human body simply does not react to it. No corrosion, no leaching, no sensitization.',
    'Grade 23 titanium passes through the body without reaction.',
    'It does not corrode, leach, or sensitize.',
    'If it corrodes, we replace it. It will not — but the warranty exists',
    'implant-grade titanium, niobium, and 316L surgical steel do not corrode under normal wear conditions.',
    'the same standard used in medical devices.',
    'if this metal is trusted inside the body',
    'the body accepts them without reaction',
    'Zero nickel',
    'naturally biocompatible',
  ]

  it.each(WAS_LIVE)('flags %s', (line) => {
    expect(findClaimTerms(line).length, line).toBeGreaterThan(0)
  })

  const NOT_CLAIMS = [
    'Avoid harsh chemicals, bleach, and abrasive cleaners.',
    '316L Surgical Steel',
    'Grade 23 titanium (Ti-6Al-4V ELI)',
    'If it corrodes, we replace it.',
    'All Healthy Jewelry pieces carry a lifetime warranty against corrosion, tarnishing, and metal degradation.',
    'Always tell your radiologist or medical team about any jewelry or metal you are wearing before an MRI procedure.',
    'We do not collect sensitive personal data such as national ID numbers, health records,',
    'Documentation on skin contact is being reviewed.',
    'Corrosion documentation is being reviewed.',
    'Metal, named exactly.',
  ]

  it.each(NOT_CLAIMS)('does not flag %s', (line) => {
    expect(findClaimTerms(line), line).toEqual([])
  })

  it('every lexicon term fires on the phrasing it was generalised from', () => {
    for (const term of CLAIM_LEXICON) {
      expect(findClaimTerms(term.from).map((h) => h.term), term.id).toContain(term.id)
    }
  })
})

describe('an allowed span permits exactly itself (ADR 020: the test can fail, and can pass)', () => {
  const HYPO_APPROVED: ClaimsRegistry = {
    ...REGISTRY,
    claims: REGISTRY.claims.map((c) =>
      c.id === 'hypoallergenic'
        ? {
            ...c,
            evidence: [
              {
                documentId: 'DOC-TI-001',
                title: 'Patch-test report, Grade 23 titanium',
                appliesTo: { kind: 'material', materials: ['titanium'] },
                reviewer: 'A. Reviewer',
                reviewedOn: '2026-09-01',
              },
            ],
            decision: { state: 'approved', reviewer: 'A. Reviewer', decidedOn: '2026-09-10' },
          }
        : c
    ),
  }
  const titanium = { kind: 'material', material: 'titanium' } as const
  const AT = new Date('2026-09-26T12:00:00Z')

  it('an injected claim in source is caught', () => {
    const injected = sourceStrings('src/components/probe.tsx', `export const P = () => <p>Hypoallergenic and nickel-free.</p>`)
    expect(findClaimTerms(injected.join(' '), allowedFor('src/components/probe.tsx')).map((h) => h.term)).toEqual([
      'hypoallergenic',
      'nickel-free',
    ])
  })

  it('the same words in a comment are not copy, and are not caught', () => {
    const commented = sourceStrings('src/components/probe.tsx', `// was: Hypoallergenic and nickel-free\nexport const P = 1`)
    expect(findClaimTerms(commented.join(' '))).toEqual([])
  })

  it('an approved, evidenced claim renders its wording — and that wording is allowed', () => {
    const resolved = resolveClaim(HYPO_APPROVED, 'hypoallergenic', titanium, AT)
    expect(resolved.rendered).toBe('wording')
    const chip = `·${resolved.text}·`
    expect(findClaimTerms(chip, approvedWordingSpans(HYPO_APPROVED, AT))).toEqual([])
  })

  it('the same chip with the real registry — nothing approved — is caught', () => {
    expect(findClaimTerms('·Hypoallergenic·', approvedWordingSpans(REGISTRY, AT)).map((h) => h.term)).toEqual([
      'hypoallergenic',
    ])
  })

  it('approval permits the wording, not a sentence built around it', () => {
    const text = 'Hypoallergenic. Also nickel-free.'
    expect(findClaimTerms(text, approvedWordingSpans(HYPO_APPROVED, AT)).map((h) => h.term)).toEqual(['nickel-free'])
  })

  it('an approval past its expiry allows nothing', () => {
    const lapsed: ClaimsRegistry = {
      ...HYPO_APPROVED,
      claims: HYPO_APPROVED.claims.map((c) =>
        c.id === 'hypoallergenic' && c.decision.state === 'approved'
          ? { ...c, decision: { ...c.decision, expiresOn: '2026-09-20' } }
          : c
      ),
    }
    expect(approvedWordingSpans(lapsed, AT)).toEqual([])
  })

  /**
   * The same two answers through the real render path, not a hand-built chip: the registry
   * module is swapped for one where `hypoallergenic` is approved against a titanium
   * document, the catalogue reloads it through `loadClaimsRegistry()` (so the approval must
   * also survive the schema), and a titanium product page is rendered from the result.
   *
   * - Against the swapped registry's own allow-list, the page is clean: an approved,
   *   evidenced claim renders and this file does not object.
   * - Against today's registry's allow-list, the *same rendered page* fails. That is the
   *   injected-claim case for rendered output: a claim reaching a page without an approval
   *   behind it is exactly what this file exists to catch.
   */
  it('through a real product page: approved renders and passes, unapproved is caught', async () => {
    vi.resetModules()
    vi.doMock('@/lib/catalog/manifest', async (importOriginal) => ({
      ...(await importOriginal<typeof import('@/lib/catalog/manifest')>()),
      rawClaims: HYPO_APPROVED,
    }))
    try {
      const catalog = await import('@/lib/catalog')
      const { ProductDetail: Detail } = await import('@/components/product/ProductDetail')
      const product = catalog.getAllProducts().find((p) => p.material === 'titanium')
      expect(product, 'the catalogue holds no titanium piece to render').toBeDefined()
      const text = textOf(<Detail product={product!} />)
      const now = new Date()

      // Non-vacuous: the approved wording really reached the page.
      expect(text).toContain('Hypoallergenic')
      expect(findClaimTerms(text, approvedWordingSpans(catalog.getClaimsRegistry(), now))).toEqual([])
      expect(findClaimTerms(text, approvedWordingSpans(REGISTRY, now)).map((h) => h.term)).toContain('hypoallergenic')
    } finally {
      vi.doUnmock('@/lib/catalog/manifest')
      vi.resetModules()
    }
  })
})

// ── Rendered output ────────────────────────────────────────────────────────

/** Rendered text with element boundaries kept — see `visibleText` for why not `textContent`. */
function textOf(element: ReactElement): string {
  const { container, unmount } = render(element)
  const text = visibleText(container)
  unmount()
  return text
}

describe('no rendered page makes a claim', () => {
  const PAGES: Array<[string, () => ReactElement]> = [
    ['/', () => <HomePage />],
    ['/materials', () => <MaterialsPage />],
    ['/faq', () => <FAQPage />],
    ['/about', () => <AboutPage />],
    ['/legal', () => <LegalPage />],
    ['/terms', () => <TermsPage />],
    ['/shipping', () => <ShippingPage />],
    ['/stores', () => <StoresPage />],
  ]

  it.each(PAGES)('%s', (route, page) => {
    const text = textOf(page())
    expect(text.length, `${route} rendered nothing to check`).toBeGreaterThan(500)
    expectNoClaims(text, route)
  })

  it.each(getAllProducts().map((p) => [p.handle, p] as const))('/products/%s', (handle, product) => {
    expectNoClaims(textOf(<ProductDetail product={product} />), `/products/${handle}`)
    expectNoClaims(textOf(<ProductCard product={product} />), `ProductCard ${handle}`)
    expectNoClaims(JSON.stringify(productJsonLd(product)), `Product JSON-LD ${handle}`)
  })

  it('the footer', () => {
    expectNoClaims(textOf(<Footer />), 'Footer')
  })

  it('the organisation JSON-LD', () => {
    expectNoClaims(JSON.stringify(organizationJsonLd()), 'Organization JSON-LD')
  })

  it.each([
    ['layout', layoutMetadata],
    ['/', homeMetadata()],
    ['/materials', materialsMetadata],
    ['/faq', faqMetadata],
    ['/about', aboutMetadata],
    ['/legal', legalMetadata],
    ['/terms', termsMetadata],
    ['/shipping', shippingMetadata],
    ['/stores', storesMetadata],
    ['/shop', shopMetadata],
  ] as const)('%s metadata — title, description, keywords, share cards', (where, metadata) => {
    expectNoClaims(JSON.stringify(metadata), `${where} metadata`)
  })

  it('every legal exemption still matches the page it exempts', () => {
    const legal = textOf(<LegalPage />).replace(/\s+/g, ' ')
    for (const exemption of LEGAL_EXEMPTIONS) {
      expect(legal, `stale exemption: ${exemption.span}`).toContain(exemption.span)
    }
  })
})

// ── Source ─────────────────────────────────────────────────────────────────

/**
 * Every TS/TSX file that can put words on a page. `src/lib/catalog` is excluded because it
 * is the registry's own resolver and names claim ids; `src/lib/analysis` is test-only.
 */
const SOURCE_DIRS = ['src/app', 'src/components', 'src/config', 'src/lib/data'] as const
const SOURCE_FILES = filesUnder(SOURCE_DIRS, /\.tsx?$/)

describe('no source module carries a claim as copy', () => {
  it('finds the modules to scan', () => {
    // A path mistake would make the assertion below vacuously green.
    expect(SOURCE_FILES.length).toBeGreaterThan(60)
    expect(SOURCE_FILES).toContain('src/components/product/ProductDetail.tsx')
    expect(SOURCE_FILES).toContain('src/lib/data/hj-data.ts')
  })

  it.each(SOURCE_FILES)('%s', (file) => {
    // Joined with spaces, so a phrase split across JSX lines — the hero set "Metal that /
    // works with / your body." on three — is still one phrase.
    expectNoClaims(sourceStrings(file, read(file)).join(' '), file)
  })

  it('every legal exemption still matches its source file', () => {
    for (const exemption of LEGAL_EXEMPTIONS) {
      const text = sourceStrings(exemption.file, read(exemption.file)).join(' ').replace(/\s+/g, ' ')
      expect(text, `stale exemption in ${exemption.file}`).toContain(exemption.span)
    }
  })
})

describe('no content record carries a claim', () => {
  it('products and collections — every string is rendered somewhere', () => {
    rawProducts.forEach((record, i) => {
      for (const { path, text } of jsonStrings(record)) expectNoClaims(text, `product[${i}].${path.join('.')}`)
    })
    rawCollections.forEach((record, i) => {
      for (const { path, text } of jsonStrings(record)) expectNoClaims(text, `collection[${i}].${path.join('.')}`)
    })
  })

  /**
   * In the registry, only the always-rendered fields are held to the lexicon: a fallback
   * renders whenever the claim is not approved, and a designation renders always. Wording is
   * the proposal and is supposed to carry the claim; a standard renders only once documented;
   * review notes and evidence titles never render.
   */
  it('the registry’s fallbacks and designations', () => {
    const registry = rawClaims as ClaimsRegistry
    for (const claim of registry.claims) expectNoClaims(claim.fallback, `claims.${claim.id}.fallback`)
    for (const spec of registry.materialSpecs) expectNoClaims(spec.designation, `materialSpecs.${spec.material}.designation`)
  })

  it('and the registry’s proposed wordings really are claims — the lexicon sees them', () => {
    // If none of these matched, the lexicon would be too narrow to protect the fallbacks.
    const registry = rawClaims as ClaimsRegistry
    const flagged = registry.claims.filter((c) => findClaimTerms(c.wording).length > 0)
    expect(flagged.length).toBeGreaterThanOrEqual(15)
  })
})
