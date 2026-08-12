import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseSource, callsTo, arrayPropertyValues } from '@/lib/analysis/tsAstScan'

/**
 * A cache tag is a bare string on both sides of an invalidation:
 *
 *   - `src/lib/shopify/index.ts` *registers* tags when it fetches;
 *   - `src/app/api/webhooks/shopify/route.ts` *revalidates* tags when Shopify
 *     says something changed.
 *
 * Nothing connects them. If the two spell a tag differently, the failure is
 * completely silent — no error, no log, no failing test. The only symptom is a
 * page that stays stale until its `revalidate` window expires, which looks
 * exactly like normal caching.
 *
 * It had already drifted, in both directions at once:
 *
 *   - `revalidateTag('collections')` — an **orphan**. No fetcher ever
 *     registered that tag, so `collections/update` webhooks revalidated
 *     nothing.
 *   - `collection:<handle>` — a **widow**. Registered by
 *     `getProductsByCollection` on every collection page, never revalidated by
 *     anything, so those pages sat stale for the full 3600s.
 *
 * A test asserting `revalidateTag` "was called with the right string" would
 * have passed throughout, because it would have been asserting the same wrong
 * string the route used. So this checks the two files against *each other*.
 */

const ROOT = process.cwd()
const FETCHER_SRC = readFileSync(join(ROOT, 'src/lib/shopify/index.ts'), 'utf-8')
const WEBHOOK_SRC = readFileSync(
  join(ROOT, 'src/app/api/webhooks/shopify/route.ts'),
  'utf-8',
)

/**
 * Resolve a tag *expression* to the semantic tag it produces.
 *
 * Both sides name the shared builders from `cacheTags.ts` rather than writing a string, so
 * this reads identifiers and calls. A raw string literal resolves to `inline:<value>`,
 * which will never match the other side — so bypassing the builders is caught by the
 * orphan/widow assertions without needing its own rule.
 *
 * Parameterised tags collapse to `<param>`: the interpolated variable is named `handle` on
 * one side and `collectionHandle` on the other, so only the prefix is comparable.
 */
function resolveTagExpression(expr: string): string | null {
  const token = expr.trim()
  if (!token) return null

  if (token === 'PRODUCTS_TAG') return 'products'
  if (/^productTag\(/.test(token)) return 'product:<param>'
  if (/^collectionTag\(/.test(token)) return 'collection:<param>'

  const literal = token.match(/^[`'"](.*)[`'"]$/)
  if (literal) return `inline:${literal[1].replace(/\$\{[^}]+\}/g, '<param>')}`

  return `unknown:${token}`
}

/**
 * Tags registered by fetches, read from the AST rather than matched in text.
 *
 * `arrayPropertyValues` finds every `tags: [...]` property regardless of formatting, so a
 * multi-line options object or a call split across lines reads identically.
 */
function registeredTags(filePath: string, source: string): Set<string> {
  const tags = new Set<string>()
  for (const array of arrayPropertyValues(parseSource(filePath, source), 'tags')) {
    for (const element of array) {
      const resolved = resolveTagExpression(element)
      if (resolved) tags.add(resolved)
    }
  }
  return tags
}

/**
 * Tags revalidated by the webhook, read from the AST.
 *
 * The regex this replaced required the closing paren at end of line, and counted a
 * `revalidateTag(...)` written inside a comment as a real call. A `CallExpression` has
 * neither problem: comments are not nodes, and formatting is irrelevant.
 */
function revalidatedTags(filePath: string, source: string): Set<string> {
  const tags = new Set<string>()
  for (const args of callsTo(parseSource(filePath, source), 'revalidateTag')) {
    const resolved = args[0] ? resolveTagExpression(args[0]) : null
    if (resolved) tags.add(resolved)
  }
  return tags
}

describe('cache tag contract', () => {
  const registered = registeredTags('src/lib/shopify/index.ts', FETCHER_SRC)
  const revalidated = revalidatedTags('src/app/api/webhooks/shopify/route.ts', WEBHOOK_SRC)

  it('finds tags on both sides', () => {
    // A regex that silently stopped matching would make every assertion below
    // vacuously pass — the same "covered-looking and worthless" failure
    // secret-exposure.test.ts guards against by checking its graph is non-empty.
    expect(registered.size).toBeGreaterThan(0)
    expect(revalidated.size).toBeGreaterThan(0)
  })

  it('every tag the webhook revalidates is registered by some fetcher', () => {
    // Orphans. Revalidating a tag nothing registered is a no-op that looks
    // exactly like a successful invalidation.
    const orphans = [...revalidated].filter((tag) => !registered.has(tag))

    expect(
      orphans,
      'These tags are revalidated but no fetch registers them, so revalidating\n' +
        'them does nothing at all:\n  ' +
        orphans.join('\n  '),
    ).toEqual([])
  })

  it('every tag a fetcher registers is revalidated by some topic', () => {
    // Widows. A registered tag nothing ever revalidates means those pages are
    // only ever refreshed by their time-based `revalidate` window.
    const widows = [...registered].filter((tag) => !revalidated.has(tag))

    expect(
      widows,
      'These tags are registered by a fetch but never revalidated, so those pages\n' +
        'stay stale for the full revalidate window no matter what changes in Shopify:\n  ' +
        widows.join('\n  '),
    ).toEqual([])
  })

  it('both sides import the tag names rather than spelling them inline', async () => {
    // The contract above can only be *maintained* if there is one place to
    // change. Two files with matching string literals agree today and drift
    // tomorrow.
    expect(FETCHER_SRC).toMatch(/from '\.\/cacheTags'/)
    expect(WEBHOOK_SRC).toMatch(/from '@\/lib\/shopify\/cacheTags'/)
  })

  it('the tag builders produce the documented shapes', async () => {
    const { productTag, collectionTag, PRODUCTS_TAG } = await import(
      '@/lib/shopify/cacheTags'
    )

    expect(PRODUCTS_TAG).toBe('products')
    expect(productTag('arc-band-titanium')).toBe('product:arc-band-titanium')
    expect(collectionTag('rings')).toBe('collection:rings')
  })

  it('does not resurrect the bare "collections" tag', async () => {
    // The specific orphan. `collections/update` must revalidate the parameterised
    // collection tag and the broad products tag — not a string that matches
    // nothing.
    const { STATIC_TAGS } = await import('@/lib/shopify/cacheTags')
    expect(STATIC_TAGS).not.toContain('collections')
    expect(revalidated).not.toContain('collections')
  })

  describe('call forms the previous regex could not read', () => {
    it('ignores a revalidateTag written inside a comment', () => {
      // The old pattern counted this as a real revalidation, which would have masked a
      // genuinely orphaned tag by making it look handled.
      const source = `// revalidateTag(PRODUCTS_TAG)\nexport const x = 1`
      const naive = /revalidateTag\(\s*([^;]+?)\s*\)\s*$/gm

      expect([...source.matchAll(naive)].length, 'the old regex counted the comment').toBe(1)
      expect(revalidatedTags('x.ts', source).size).toBe(0)
    })

    it('reads a call split across lines', () => {
      const source = ['revalidateTag(', '  productTag(handle),', ')'].join('\n')
      expect([...revalidatedTags('x.ts', source)]).toEqual(['product:<param>'])
    })

    it('reads tags from a multi-line options object', () => {
      const source = [
        'const o = {',
        '  revalidate: 3600,',
        '  tags: [',
        '    PRODUCTS_TAG,',
        '    collectionTag(h),',
        '  ],',
        '}',
      ].join('\n')

      expect([...registeredTags('x.ts', source)].sort()).toEqual([
        'collection:<param>',
        'products',
      ])
    })

    it('flags a bare string literal as inline, so it cannot match the other side', () => {
      const source = `const o = { tags: ['collections'] }`
      expect([...registeredTags('x.ts', source)]).toEqual(['inline:collections'])
    })
  })
})
