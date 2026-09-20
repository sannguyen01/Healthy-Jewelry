import { beforeAll, describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { ProductCard } from '@/components/product/ProductCard'
import { ProductDetail } from '@/components/product/ProductDetail'
import { HorizontalScroll } from '@/components/home/HorizontalScroll'
import { productJsonLd } from '@/components/seo/JsonLd'
import { makeProduct } from '@/tests/support/catalogFixtures'

/**
 * **No surface publishes a price, because there is nothing to pay and nothing to pay it
 * with.**
 *
 * ## This file was `currency-consistency.test.tsx`, and the rule it enforced got simpler
 *
 * The original defect: the site rendered `$` on every price on every surface,
 * unconditionally — `formatPrice(price, 'USD')` in the card and the detail page, bare `$`
 * template literals in the cart drawer and cart page, and `priceCurrency: 'USD'` in the
 * Product JSON-LD that feeds Google Shopping — while `mapShopifyProduct` discarded
 * `priceRange.minVariantPrice.currencyCode` entirely, so the real currency never reached
 * the UI to contradict it. For a store selling in VND that is a hundred-fold misquote,
 * shown at the moment a customer decides whether to buy and published to search engines
 * before they arrive.
 *
 * The rule was therefore "every price must carry the currency Shopify will actually
 * charge". The catalogue publishes no prices at all, so the rule collapses into a stronger
 * and far cheaper one: **no price, in any currency, anywhere.** A guard that had to
 * understand `formatPrice` argument positions, balanced parens and template interpolation
 * now only has to find a currency symbol.
 *
 * ## Why the source scan survives the rename
 *
 * Every behavioural assertion below renders a component and reads its text, which proves
 * what today's components do. The scan proves something a render cannot: that no *other*
 * module — a page, a route, a helper, one somebody adds next month — prints money. The
 * original file needed both for exactly this reason, and the reason has not changed.
 *
 * ## What is deliberately still allowed
 *
 * `src/lib/utils/formatPrice.ts` still exists and is exempt. It has no application caller;
 * WS-4c removes it together with `src/lib/catalog/types.ts`, which still imports
 * `CurrencyCode` from it. A helper nothing calls cannot print a price on a page.
 */

/**
 * `HorizontalScroll` reveals on scroll through `useReveal`, which constructs an
 * `IntersectionObserver`. jsdom does not implement one, so rendering the strip throws
 * before it can be read. Stubbed rather than mocked away: what this file asserts is the
 * strip's *text*, and a `useReveal` replaced by a mock would be a strip that never mounts
 * its children.
 */
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
  default: ({
    href,
    children,
    ...props
  }: {
    href: string
    children: React.ReactNode
    [key: string]: unknown
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}))

/** Every symbol `formatPrice` could ever have produced, plus the codes themselves. */
const CURRENCY_SYMBOL = /[$€£¥₫]/
const CURRENCY_CODE = /\b(?:USD|VND|EUR|GBP)\b/

/**
 * The same question asked of **source** rather than of rendered text, and it needs its own
 * rule because `$` means three different things in TypeScript source.
 *
 * | shape | what it is | money? |
 * |---|---|---|
 * | `` `/shop/${handle}` `` | template interpolation | no |
 * | `/^[a-f0-9]{6}$/` | regex end-of-string anchor | no |
 * | `` `$${total}` `` | a literal dollar before an interpolation | **yes** |
 * | `>${product.price}<` | a literal dollar in JSX text | **yes** |
 * | `'$89.00'` | a literal amount | **yes** |
 *
 * `CURRENCY_SYMBOL` above is correct on *rendered* output, where none of the first two can
 * appear. Run over source it matched 40-odd log messages, sitemap XML lines and cache-tag
 * builders — a guard that fires on all of them is one somebody switches off.
 *
 * The first three clauses below are carried over verbatim from `currency-consistency`'s
 * `printsBareCurrency`, which was written against the six surfaces that printed dollars
 * without going through the formatter at all. The fourth is new and is the one that matters
 * now: with no formatter left, a price that comes back comes back as a literal.
 *
 * The non-dollar symbols need none of this — nothing in JavaScript uses `€`, `£`, `¥` or
 * `₫` for anything but money.
 */
const NON_DOLLAR_CURRENCY = /[€£¥₫]/
const PRICE_WORD = /\b(?:price|total|subtotal|amount|cost)\b/i

function printsCurrency(line: string): boolean {
  if (NON_DOLLAR_CURRENCY.test(line)) return true

  // `` `$${total}` `` — a literal dollar immediately before an interpolation.
  if (/\$\$\{/.test(line)) return true

  // `'$89.00'` or `<span>$89</span>` — a dollar directly on an amount.
  if (/\$\s*\d/.test(line)) return true

  // `${product.price}` as JSX text: a dollar the browser renders, followed by an
  // expression naming a price. A line containing a backtick may be an ordinary template
  // and is left alone — that ambiguity costs nothing, since the `$$` rule above already
  // covers the template form.
  if (!line.includes('`') && /(?:^|>)\s*\$\{[^}]*\}/.test(line)) {
    return PRICE_WORD.test(line)
  }

  return false
}

const product = makeProduct({ badge: 'bestseller' })

function expectNoMoney(text: string, where: string) {
  expect(text, `${where} renders a currency symbol`).not.toMatch(CURRENCY_SYMBOL)
  expect(text, `${where} renders a currency code`).not.toMatch(CURRENCY_CODE)
}

describe('no rendered surface shows a price', () => {
  it('ProductCard shows no money', () => {
    const { container } = render(<ProductCard product={product} />)
    expectNoMoney(container.textContent ?? '', 'ProductCard')
  })

  it('ProductDetail shows no money', () => {
    const { container } = render(<ProductDetail product={product} />)
    expectNoMoney(container.textContent ?? '', 'ProductDetail')
  })

  it('HorizontalScroll shows no money', () => {
    // The strips were one of the six surfaces that printed a bare `$` in a template
    // literal rather than going through the formatter at all.
    const { container } = render(<HorizontalScroll label="BESTSELLING" products={[product]} />)
    expectNoMoney(container.textContent ?? '', 'HorizontalScroll')
  })
})

describe('structured data makes no commerce claim', () => {
  it('Product JSON-LD publishes no offer, price, currency or availability', () => {
    // This asserted `priceCurrency === 'VND'` — that a VND store must not advertise dollars
    // to Google Shopping. The concern was right and is now served better by publishing
    // nothing: PR #75 removed Add to Bag on 2026-09-19, so from that day an `Offer`
    // carrying a price and `InStock` was telling search engines a transaction existed that
    // did not. Removing the block took `pnpm verify:browse-only` from 52 findings to 1.
    const jsonLd = productJsonLd(product)
    expect(jsonLd.offers).toBeUndefined()
    expect(JSON.stringify(jsonLd)).not.toMatch(/[$€£¥₫]|VND|USD|priceCurrency|InStock|offers/)
  })

  it('Product JSON-LD still says what the object is', () => {
    // Removing the commerce claims must not hollow out the entry: name, brand and material
    // are claims about the object and remain true.
    const jsonLd = productJsonLd(product)
    expect(jsonLd['@type']).toBe('Product')
    expect(jsonLd.name).toBeTruthy()
    expect(jsonLd.description).toBeTruthy()
    expect(jsonLd.material).toBeTruthy()
    expect((jsonLd.brand as Record<string, unknown>).name).toBeTruthy()
  })
})

// ── Source: no module may print money ──────────────────────────────────────

const SRC = path.resolve(__dirname, '../..')

/**
 * Files that may legitimately name a currency.
 *
 * `formatPrice.ts` is the helper itself; its locale table and VND minor-unit rule are what
 * it is *for*. It has no application caller and leaves with `catalog/types.ts` in WS-4c.
 *
 * `catalog/types.ts` is the Shopify wire format — `Money`, `priceRange`, `currencyCode` —
 * and describes a payload nothing fetches any more. Same removal.
 *
 * Neither is rendered by anything, which is the property that matters: this scan is about
 * what reaches a page.
 */
const EXEMPT = new Set(['lib/utils/formatPrice.ts', 'lib/catalog/types.ts'])

function sourceFiles(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry)
    if (statSync(full).isDirectory()) {
      if (entry === 'node_modules' || entry === '.next' || entry === 'tests') continue
      sourceFiles(full, found)
    } else if (/\.tsx?$/.test(entry)) {
      const rel = path.relative(SRC, full)
      if (!EXEMPT.has(rel)) found.push(full)
    }
  }
  return found
}

interface Offence {
  file: string
  line: number
  text: string
}

/**
 * Scan every non-exempt source line, skipping comments.
 *
 * Comments are skipped deliberately and it is load-bearing here: half the components in
 * this codebase now carry a block saying *"The price row was here"*, naming the thing that
 * was removed and why. A scan that counted those would make the removal itself the
 * offence, and the only way to go green would be to delete the record of what happened.
 */
function scan(test: (line: string) => boolean): Offence[] {
  const offences: Offence[] = []
  let inBlockComment = false
  for (const file of sourceFiles(SRC)) {
    readFileSync(file, 'utf8')
      .split('\n')
      .forEach((text, index) => {
        const trimmed = text.trimStart()
        if (inBlockComment) {
          if (trimmed.includes('*/')) inBlockComment = false
          return
        }
        if (trimmed.startsWith('//')) return
        if (trimmed.startsWith('/*') || trimmed.startsWith('{/*')) {
          if (!trimmed.includes('*/')) inBlockComment = true
          return
        }
        if (trimmed.startsWith('*')) return
        if (test(text)) {
          offences.push({ file: path.relative(SRC, file), line: index + 1, text: text.trim() })
        }
      })
    inBlockComment = false
  }
  return offences
}

function report(offences: Offence[]): string {
  return offences.map((o) => `  ${o.file}:${o.line}  ${o.text}`).join('\n')
}

/**
 * **The detector, pointed at known answers.**
 *
 * Every assertion in the block below is an *absence*, and an absence is exactly what a
 * broken detector also reports.
 * [ADR 024](../../../docs/adr/024-a-tool-never-pointed-at-a-known-answer.md) is this
 * repository's record of what that costs: of three probes written in one week, every defect
 * landed in the one whose decision was never run against a case with a known answer.
 *
 * The first version of `printsCurrency` here matched `$` unconditionally and reported forty
 * template literals; the second excluded `${` and still reported every regex ending in `$`.
 * Both were visible immediately because the suite went red. A rule that erred the other way
 * — too narrow — would have gone green and proved nothing, which is the failure this table
 * exists to make impossible.
 */
describe('the source rule tells money from punctuation', () => {
  it.each([
    ['a literal amount', "const label = '$89.00'"],
    ['a dollar before an interpolation', 'const label = `$${total}`'],
    ['a dollar in JSX text', '        >${product.price}<'],
    ['dong', "const label = '₫1.450.000'"],
    ['euro', 'const label = `€${amount}`'],
    ['pound', "return '£12'"],
  ])('flags %s', (_label, line) => {
    expect(printsCurrency(line)).toBe(true)
  })

  it.each([
    ['a template interpolation', 'revalidatePath(`/shop/${collection.handle}`, "page")'],
    ['a regex end anchor', "const RE = /^[0-9a-fA-F]{6}$/"],
    ['an escaped dollar in a regex', "if (/\\$\\{/.test(line)) return true"],
    ['a log line', 'console.warn(`[webhooks] rejected: ${reason}`)'],
    ['ordinary prose', '  return product.materialLabel.toUpperCase()'],
  ])('does not flag %s', (_label, line) => {
    expect(printsCurrency(line)).toBe(false)
  })
})

describe('no module prints money', () => {
  it('finds source files to scan at all', () => {
    // Without this, a path mistake would make every assertion below vacuously green — the
    // same failure `secret-exposure.test.ts` and `cache-tag-contract.test.ts` both guard.
    expect(sourceFiles(SRC).length).toBeGreaterThan(30)
  })

  it('no module calls a price formatter', () => {
    const offences = scan((line) => /\bformat(?:Price|CompareAtPrice|PriceVND)\s*\(/.test(line))
    expect(
      offences,
      `a price formatter is called again:\n${report(offences)}\n\n` +
        `There are no prices. If one has come back, ADR 034 and the browse-only decision ` +
        `need revisiting before this test is changed.`
    ).toEqual([])
  })

  it('no module writes a currency symbol into rendered output', () => {
    const offences = scan(printsCurrency)
    expect(offences, `currency symbol in source:\n${report(offences)}`).toEqual([])
  })

  it('no module names a currency code', () => {
    const offences = scan((line) => CURRENCY_CODE.test(line))
    expect(offences, `currency code in source:\n${report(offences)}`).toEqual([])
  })

  /**
   * The gap the old rule closed by looking at a screenshot rather than at the code: the
   * cart drawer rendered `{product.price}` — the raw string, on its own JSX line — so the
   * line item read "112.00" while the total two elements below read "$112.00". No
   * formatter to inspect and no symbol to match; an unformatted price is invisible to a
   * guard that only looks for *wrong* formatting.
   *
   * Kept, because a price reintroduced as a bare number is the cheapest way for one to
   * come back, and the symbol rules above would not see it.
   */
  it('no module renders a bare price-named expression', () => {
    const BARE_PRICE_EXPRESSION =
      /^\{\s*[\w.[\]]*\b(?:price|compareAtPrice|total|subtotal|amount)\b[\w.[\]]*\s*\}$/i
    const offences = scan((line) => BARE_PRICE_EXPRESSION.test(line.trim()))
    expect(
      offences,
      `price rendered as a bare value — money must never print as a number:\n${report(offences)}`
    ).toEqual([])
  })

  it('productJsonLd carries no commerce field', () => {
    // The source-level half of the JSON-LD assertion above, pointed at the whole family so
    // a future edit reintroducing any of them turns this red rather than quietly
    // re-advertising a checkout that does not exist.
    const source = readFileSync(path.join(SRC, 'components/seo/JsonLd.tsx'), 'utf8')
    const productBlock = source.slice(
      source.indexOf('export function productJsonLd'),
      source.indexOf('export function organizationJsonLd')
    )
    expect(productBlock.length).toBeGreaterThan(100) // the slice actually found the function
    for (const forbidden of ['offers:', 'priceCurrency', 'availability', 'schema.org/InStock']) {
      expect(productBlock, `productJsonLd reintroduced ${forbidden}`).not.toContain(forbidden)
    }
  })
})
