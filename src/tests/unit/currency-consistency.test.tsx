import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { ProductCard } from '@/components/product/ProductCard'
import { ProductDetail } from '@/components/product/ProductDetail'
import { productJsonLd } from '@/components/seo/JsonLd'
import type { HJProduct } from '@/lib/shopify/types'

/**
 * Every price the customer sees must be denominated in the currency Shopify
 * will actually charge.
 *
 * The site rendered `$` on every price on every surface, unconditionally:
 * `formatPrice(price, 'USD')` in the product card and detail page, bare `$`
 * template literals in the cart drawer and cart page, and `priceCurrency:
 * 'USD'` in the Product JSON-LD that feeds Google Shopping. Meanwhile
 * `mapShopifyProduct` discarded `priceRange.minVariantPrice.currencyCode`
 * entirely, so the real currency never reached the UI to contradict it.
 *
 * For a store selling in VND that means advertising "$89.00" and charging
 * ₫89,000 — a hundred-fold misquote, shown in the one place a customer decides
 * whether to buy, and published to search engines before they ever arrive.
 *
 * Nothing else catches this. It is not a type error (the literal is a valid
 * `CurrencyCode`), not a lint error, and every existing test asserted `$`
 * because `$` is what the fallback catalog charges. So this guards from both
 * ends: the behaviour, by rendering a non-USD product and demanding its symbol;
 * and the source, so a future component cannot reintroduce a hardcoded currency
 * without turning this red.
 */

// ── Behaviour: a non-USD product must render its own currency ──────────────

const vndProduct: HJProduct = {
  id: 'gid://shopify/Product/1',
  defaultVariantId: 'gid://shopify/ProductVariant/1',
  handle: 'arc-band-titanium',
  title: 'Arc Band',
  collection: 'rings',
  material: 'titanium',
  tags: ['rings', 'titanium'],
  price: '2290000',
  compareAtPrice: null,
  currencyCode: 'VND',
  badge: null,
  description: 'Grade 23 titanium.',
  spec: '2 mm · 1.8 g',
  svgType: 'ring-arc',
  variants: [],
}

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

/** Intl renders VND as `₫`; any `$` in the same text is the bug. */
function expectDong(text: string) {
  expect(text).toContain('₫')
  expect(text).not.toContain('$')
}

describe('currency reaches the customer', () => {
  it('ProductCard prices a VND product in dong, not dollars', () => {
    render(<ProductCard product={vndProduct} />)
    expectDong(document.body.textContent ?? '')
  })

  it('ProductCard shows a VND sale price and its compare-at in dong', () => {
    render(<ProductCard product={{ ...vndProduct, compareAtPrice: '2990000' }} />)
    const text = document.body.textContent ?? ''
    expectDong(text)
    // Both the live price and the struck-through original, not just the first.
    expect(text.match(/₫/g)?.length).toBeGreaterThanOrEqual(2)
  })

  it('ProductDetail prices a VND product in dong, not dollars', () => {
    render(<ProductDetail product={vndProduct} />)
    expectDong(document.body.textContent ?? '')
  })

  it('VND renders with no decimal places — dong has no minor unit', () => {
    render(<ProductCard product={vndProduct} />)
    // "₫2,290,000.00" would read as a hundredfold error against "₫2,290,000".
    expect(screen.getByText(/₫/).textContent).not.toMatch(/[.,]\d{2}$/)
  })

  it('Product JSON-LD publishes the store currency, not USD', () => {
    const offer = productJsonLd(vndProduct).offers as Record<string, unknown>
    expect(offer.priceCurrency).toBe('VND')
  })

  it('a USD product still renders dollars — the fix is not a blanket swap', () => {
    render(<ProductCard product={{ ...vndProduct, price: '89.00', currencyCode: 'USD' }} />)
    const text = document.body.textContent ?? ''
    expect(text).toContain('$89.00')
    expect(text).not.toContain('₫')
  })
})

// ── Source: no surface may hardcode a currency ─────────────────────────────

const SRC = path.resolve(__dirname, '../..')

/**
 * `formatPrice` and `formatCompareAtPrice` both default to USD, which is the
 * right default for a helper and the wrong one for a price tag. Components must
 * pass the product's own `currencyCode` (or the bag's, via `cartCurrencyCode`)
 * — never a literal, and never omit the argument.
 */
const FORMAT_CALL = /\bformat(?:Price|CompareAtPrice)\(/g

/** A literal in the currency position: `formatPrice(x, 'USD')`. */
const CURRENCY_LITERAL = /,\s*['"](?:USD|VND|EUR|GBP)['"]/

/**
 * The argument list of a call, respecting nesting.
 *
 * A naive `\(([^)]*)\)` stops at the first close paren, so
 * `formatPrice(parseFloat(p.price) * qty, cartCurrency)` reads as the single
 * argument `parseFloat(p.price` — a call that passes a currency reported as one
 * that omits it. Balancing is the difference between a rule and a nuisance.
 */
function argsAt(line: string, openIndex: number): string | null {
  let depth = 0
  for (let i = openIndex; i < line.length; i += 1) {
    if (line[i] === '(') depth += 1
    else if (line[i] === ')') {
      depth -= 1
      if (depth === 0) return line.slice(openIndex + 1, i)
    }
  }
  return null // call wraps across lines; skip rather than guess
}

/** Split on top-level commas only, so nested calls count as one argument. */
function topLevelArgs(args: string): string[] {
  const parts: string[] = []
  let depth = 0
  let current = ''
  for (const char of args) {
    if (char === '(' || char === '[' || char === '{') depth += 1
    else if (char === ')' || char === ']' || char === '}') depth -= 1
    if (char === ',' && depth === 0) {
      parts.push(current)
      current = ''
      continue
    }
    current += char
  }
  if (current.trim() !== '') parts.push(current)
  return parts
}

/**
 * A bare currency symbol printed beside a value, bypassing `formatPrice`
 * entirely — `` `$${total}` `` in a template literal and `${product.price}` as
 * JSX text. This is how the cart drawer, the cart page and the homepage strips
 * printed dollars, so a rule that only inspected `formatPrice` arguments would
 * have declared the site fixed while six surfaces still said `$`.
 *
 * The hard part is that `${` is also ordinary interpolation, so the source
 * bytes of a rendered dollar and of a template placeholder are identical. Three
 * unambiguous shapes cover the real cases without flagging every template
 * string in the repo:
 */
const PRICE_WORD = /\b(?:price|total|subtotal|amount|cost)\b/i

function printsBareCurrency(line: string): boolean {
  // `` `$${total}` `` — a literal dollar immediately before an interpolation.
  if (/\$\$\{/.test(line)) return true

  // `₫{amount}` — no interpolation syntax collides with these symbols.
  if (/[€£₫]\s*\{/.test(line)) return true

  // `${product.price}` as JSX text: a dollar the browser renders, followed by
  // an expression naming a price. A line containing a backtick may be an
  // ordinary template and is left alone — that ambiguity costs nothing here,
  // since the `$$` rule above already covers the template form.
  if (!line.includes('`') && /(?:^|>)\s*\$\{[^}]*\}/.test(line)) {
    return PRICE_WORD.test(line)
  }

  return false
}

/**
 * Files that legitimately name a currency:
 *
 * - `formatPrice.ts` is the helper itself; the defaults and the VND minor-unit
 *   rule live there by definition.
 * - `hj-data.ts` is the static fallback catalog, which has no store behind it
 *   and declares its presentation currency once, in `FALLBACK_CURRENCY`.
 * - `shopify/index.ts` normalises the code arriving from the Storefront API.
 * - Tests assert on currencies, including this one.
 */
const EXEMPT = new Set([
  'lib/utils/formatPrice.ts',
  'lib/data/hj-data.ts',
  'lib/shopify/index.ts',
])

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

function scan(test: (line: string) => boolean): Offence[] {
  const offences: Offence[] = []
  for (const file of sourceFiles(SRC)) {
    readFileSync(file, 'utf8')
      .split('\n')
      .forEach((text, index) => {
        if (text.trimStart().startsWith('*') || text.trimStart().startsWith('//')) return
        if (test(text)) {
          offences.push({ file: path.relative(SRC, file), line: index + 1, text: text.trim() })
        }
      })
  }
  return offences
}

function report(offences: Offence[]): string {
  return offences.map((o) => `  ${o.file}:${o.line}  ${o.text}`).join('\n')
}

describe('no surface hardcodes a currency', () => {
  it('no component passes a currency literal to formatPrice', () => {
    const offences = scan((line) => {
      for (const call of line.matchAll(FORMAT_CALL)) {
        const args = argsAt(line, call.index + call[0].length - 1)
        if (args !== null && CURRENCY_LITERAL.test(args)) return true
      }
      return false
    })
    expect(offences, `hardcoded currency argument:\n${report(offences)}`).toEqual([])
  })

  it('no component omits the currency argument to formatPrice', () => {
    const offences = scan((line) => {
      for (const call of line.matchAll(FORMAT_CALL)) {
        // A call wrapped across lines returns null; skip rather than guess, so
        // the rule never fails on formatting alone.
        const args = argsAt(line, call.index + call[0].length - 1)
        if (args === null || args.trim() === '') continue
        if (topLevelArgs(args).length < 2) return true
      }
      return false
    })
    expect(offences, `formatPrice called without a currency:\n${report(offences)}`).toEqual([])
  })

  it('no component prints a currency symbol beside an interpolated price', () => {
    const offences = scan(printsBareCurrency)
    expect(offences, `bare currency symbol in markup:\n${report(offences)}`).toEqual([])
  })

  it('JSON-LD takes priceCurrency from the product', () => {
    const source = readFileSync(path.join(SRC, 'components/seo/JsonLd.tsx'), 'utf8')
    expect(source).toMatch(/priceCurrency:\s*product\.currencyCode/)
  })

  it('mapShopifyProduct carries the Storefront currency through', () => {
    // The field can only be honest if it is populated from the API response;
    // a default that never gets overwritten is the original bug in a new shape.
    const source = readFileSync(path.join(SRC, 'lib/shopify/index.ts'), 'utf8')
    expect(source).toMatch(/priceRange\?\.\.?minVariantPrice\?\.\.?currencyCode|minVariantPrice\?\.currencyCode/)
  })
})
