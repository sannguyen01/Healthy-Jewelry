import { beforeAll, describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import type { ReactElement } from 'react'
import type { Metadata } from 'next'
import {
  COMMERCIAL_TERMS,
  countCommercialTerms,
  inventoryDrift,
  total,
  type TermCounts,
} from '@/tests/support/commercialTerms'
import { filesUnder, jsonStrings, read, sourceStrings, visibleText } from '@/tests/support/renderedStrings'
import { rawClaims, rawCollections, rawProducts } from '@/lib/catalog/manifest'
import type { ClaimsRegistry } from '@/lib/catalog/claims-schema'
import TermsPage, { metadata as termsMetadata } from '@/app/terms/page'
import ShippingPage, { metadata as shippingMetadata } from '@/app/shipping/page'
import LegalPage, { metadata as legalMetadata } from '@/app/legal/page'
import FAQPage, { metadata as faqMetadata } from '@/app/faq/page'
import StoresPage, { metadata as storesMetadata } from '@/app/stores/page'
import AboutPage, { metadata as aboutMetadata } from '@/app/about/page'

/**
 * **The legal-review inventory: commercial terms are held, not edited.**
 *
 * `/terms`, `/shipping` and `/legal`, the FAQ answers that restate them, the `/stores` line
 * that repeats the shipping offer and the `/about` card that repeats the warranty state
 * contractual terms of sale — free shipping, a thirty-day returns and exchange window, a
 * refund route, a lifetime warranty, a dispatch time — for a business that takes no orders
 * on this site. Whether each still holds, and in what words, is for an adviser qualified in
 * Vietnamese consumer law (masterplan **WS-H**), not for engineers. WS-B (claims) changed
 * only the sentences in them that asserted a *material property* ("implant-grade", "do not
 * corrode under normal wear"), and neutralised the metadata descriptions, which are search
 * snippets rather than terms.
 *
 * So this file does not judge the text. It **counts** it, per file and per term, and pins
 * every count with equality ([ADR 021](../../../docs/adr/021-a-metric-with-only-one-direction.md)).
 * A term added, removed or reworded out of the lexicon fails here, and the failure is the
 * prompt: a change to commercial terms goes through WS-H, then the pin moves in the same
 * commit as the adviser's decision.
 *
 * Three questions, in order:
 *
 * 1. **The inventory** — the rendered *body* of each page above, Nav and Footer excluded
 *    (the footer's "Shipping & Returns" link is a label, not a term), measured as a visitor
 *    reads it.
 * 2. **The snippets** — every inventoried route's metadata description carries no `offer`
 *    term. It may name its topic ("returned or exchanged"); it may not restate the offer.
 * 3. **Containment** — no *other* rendered source file and no catalogue record states an
 *    offer term, so a returns window cannot spread to the homepage or a product description
 *    without joining this inventory first.
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

// The body is the inventory; the chrome is shared by every page and is not a term.
vi.mock('@/components/layout/Nav', () => ({ Nav: () => null, default: () => null }))
vi.mock('@/components/layout/Footer', () => ({ Footer: () => null, default: () => null }))

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode; [key: string]: unknown }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}))

function bodyText(page: () => ReactElement): string {
  const { container, unmount } = render(page())
  const text = visibleText(container)
  unmount()
  return text
}

// ── The inventory ──────────────────────────────────────────────────────────

interface InventoryEntry {
  route: string
  page: () => ReactElement
  metadata: Metadata
  /** Rendered body, per term. Measured 2026-09-26 after WS-B; moved only with a WS-H decision. */
  counts: TermCounts
}

const INVENTORY: Record<string, InventoryEntry> = {
  'src/app/terms/page.tsx': {
    route: '/terms',
    page: () => <TermsPage />,
    metadata: termsMetadata,
    counts: { returns: 1, warranty: 5, 'delivery-time': 1 },
  },
  'src/app/shipping/page.tsx': {
    route: '/shipping',
    page: () => <ShippingPage />,
    metadata: shippingMetadata,
    counts: { 'free-shipping': 4, returns: 16, refund: 1, dispatch: 1, 'delivery-time': 6 },
  },
  'src/app/legal/page.tsx': {
    route: '/legal',
    page: () => <LegalPage />,
    metadata: legalMetadata,
    counts: { warranty: 3 },
  },
  'src/app/faq/page.tsx': {
    route: '/faq',
    page: () => <FAQPage />,
    metadata: faqMetadata,
    counts: { 'free-shipping': 2, returns: 5, dispatch: 1, 'delivery-time': 4, 'how-to-buy': 1 },
  },
  'src/app/stores/page.tsx': {
    route: '/stores',
    page: () => <StoresPage />,
    metadata: storesMetadata,
    counts: { 'free-shipping': 1, 'delivery-time': 1 },
  },
  'src/app/about/page.tsx': {
    route: '/about',
    page: () => <AboutPage />,
    metadata: aboutMetadata,
    counts: { warranty: 2 },
  },
}

const HOLD =
  'Commercial terms on this page are held for legal review (masterplan WS-H) and are not ' +
  'edited in an engineering change. If this edit is a WS-H decision, move the pin in the same ' +
  'commit and name the decision in the message; if it is not, revert the wording.'

describe('the legal-review inventory holds every commercial term, by file and by term', () => {
  it.each(Object.entries(INVENTORY))('%s', (file, entry) => {
    const measured = countCommercialTerms(bodyText(entry.page))
    const drift = inventoryDrift(entry.counts, measured)
    for (const term of COMMERCIAL_TERMS) {
      expect(
        measured[term.id] ?? 0,
        `${entry.route} (${file}) · "${term.id}"\n${JSON.stringify(drift)}\n\n${HOLD}`
      ).toBe(entry.counts[term.id] ?? 0)
    }
    expect(total(measured), `${entry.route} total`).toBe(total(entry.counts))
  })

  it('the inventory is not vacuous: every term is held somewhere, and the pages render', () => {
    // A lexicon term no page carries would be a pin that can never move — dead weight that
    // reads as coverage. And a page that rendered nothing would pin zeros forever.
    const held = new Set(Object.values(INVENTORY).flatMap((e) => Object.keys(e.counts)))
    expect([...held].sort()).toEqual(COMMERCIAL_TERMS.map((t) => t.id).sort())
    for (const entry of Object.values(INVENTORY)) {
      expect(bodyText(entry.page).length, entry.route).toBeGreaterThan(500)
    }
  })
})

// ── The snippets ───────────────────────────────────────────────────────────

describe('a search snippet describes its page and does not restate the offer', () => {
  it.each(Object.entries(INVENTORY))('%s description', (_file, entry) => {
    const description = String(entry.metadata.description ?? '')
    expect(description.length, `${entry.route} has no description`).toBeGreaterThan(20)
    const offers = countCommercialTerms(description, ['offer'])
    // /legal's is the one exception, and it is pinned rather than allowed: "disclaimer of
    // warranties" names the page's disclaimer section, which is the opposite of an offer.
    expect(offers, `${entry.route}: "${description}"`).toEqual(entry.route === '/legal' ? { warranty: 1 } : {})
  })

  /** Verbatim, the descriptions these routes carried until 2026-09-26. */
  const RETIRED = [
    'Free shipping on all Healthy Jewelry orders worldwide. 7–14 day international delivery. 30-day returns.',
    'Terms of Service for Healthy Jewelry. Lifetime warranty against corrosion. Free returns within 30 days.',
    'Healthy Jewelry is arranged through ambassadors and shipped worldwide with free delivery. Showroom appointments available; flagship store coming 2026.',
  ]

  it.each(RETIRED)('the retired snippet is caught: %s', (description) => {
    expect(total(countCommercialTerms(description, ['offer']))).toBeGreaterThan(0)
  })
})

// ── Containment ────────────────────────────────────────────────────────────

/**
 * Not scanned, each for a stated reason:
 * - the inventoried pages themselves — measured above, rendered;
 * - `src/app/privacy/**` — a data-protection notice owned by WS-G, whose one day count ("we
 *   will respond within 30 days") is a statutory response window, not a term of sale;
 * - `src/app/api/**` — route handlers answer with JSON, not a page.
 */
const CONTAINMENT_FILES = filesUnder(['src/app', 'src/components', 'src/config', 'src/lib/data'], /\.tsx?$/).filter(
  (f) => !(f in INVENTORY) && !f.startsWith('src/app/privacy/') && !f.startsWith('src/app/api/')
)

describe('no other surface states an offer term', () => {
  it('finds the modules to scan', () => {
    // A path mistake would make every case below vacuously green. 50 on 2026-09-26.
    expect(CONTAINMENT_FILES.length).toBeGreaterThan(40)
    expect(CONTAINMENT_FILES).toContain('src/components/product/ProductDetail.tsx')
    expect(CONTAINMENT_FILES).toContain('src/config/navigation.ts')
  })

  it.each(CONTAINMENT_FILES)('%s', (file) => {
    const offers = countCommercialTerms(sourceStrings(file, read(file)).join(' '), ['offer'])
    expect(offers, `${file} states a commercial term outside the legal-review inventory.\n\n${HOLD}`).toEqual({})
  })

  it('no catalogue record, and no rendered field of the claims registry', () => {
    const registry = rawClaims as ClaimsRegistry
    const rendered = [
      ...[...rawProducts, ...rawCollections].flatMap((r) => jsonStrings(r).map((s) => s.text)),
      ...registry.claims.flatMap((c) => [c.wording, c.fallback]),
      ...registry.materialSpecs.map((s) => s.designation),
    ]
    expect(countCommercialTerms(rendered.join(' | '), ['offer'])).toEqual({})
  })
})

// ── The counter, pointed at known answers (ADR 024) ────────────────────────

describe('the counter', () => {
  it('every term fires on the wording it was generalised from', () => {
    for (const term of COMMERCIAL_TERMS) {
      expect(countCommercialTerms(term.from)[term.id], term.id).toBeGreaterThan(0)
    }
  })

  it.each([
    'Return home',
    'neither may return without a composition document',
    'How a piece arranged with a Healthy Jewelry ambassador is delivered, returned or exchanged.',
    'The terms that govern use of this website, and pieces arranged with a Healthy Jewelry ambassador.',
  ])('states no offer: %s', (text) => {
    expect(countCommercialTerms(text, ['offer'])).toEqual({})
  })

  it('an added term is drift, and so is a removed one', () => {
    const pinned = { warranty: 3 }
    expect(inventoryDrift(pinned, { warranty: 3 })).toEqual([])
    expect(inventoryDrift(pinned, { warranty: 3, 'free-shipping': 1 })).toEqual([
      { term: 'free-shipping', pinned: 0, measured: 1 },
    ])
    expect(inventoryDrift(pinned, {})).toEqual([{ term: 'warranty', pinned: 3, measured: 0 }])
  })

  it('a sentence added to a held page moves its count (the pin can fail)', () => {
    const shipping = countCommercialTerms(bodyText(INVENTORY['src/app/shipping/page.tsx'].page))
    const edited = countCommercialTerms(
      bodyText(INVENTORY['src/app/shipping/page.tsx'].page) + ' Refunds within 14 days.'
    )
    expect(inventoryDrift(shipping, edited).map((d) => d.term)).toEqual(['refund', 'delivery-time'])
  })
})
