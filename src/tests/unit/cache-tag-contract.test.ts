import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
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

/**
 * **Every** module, not two named files.
 *
 * The first version of this test read `src/lib/shopify/index.ts` and the webhook route by
 * name — and therefore never saw `src/app/api/revalidate/route.ts`, a third revalidation
 * surface which still called `revalidateTag('collections')`: the exact orphan this contract
 * was written to eliminate, surviving the fix that eliminated it everywhere the test
 * happened to be looking.
 *
 * **A contract test that names its participants can only check the participants someone
 * remembered.** That is the second time a guardrail here was scoped narrower than the
 * invariant it claimed to enforce (the first walked only `src/app` and missed a catalogue
 * read in `src/components`), which is why the rule is now "scan everything and exempt
 * explicitly" rather than "list what to scan". See docs/adr/007.
 */
function walkSources(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      if (entry === 'tests' || entry === 'node_modules') continue
      out.push(...walkSources(full))
    } else if (/\.tsx?$/.test(full)) {
      out.push(full)
    }
  }
  return out
}

const SOURCE_FILES = [join(ROOT, 'src/app'), join(ROOT, 'src/lib')].flatMap(walkSources)

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
  // `requireSibling: 'revalidate'` identifies a Next cache-options object structurally.
  // Matching `tags:` by name alone also matches the product `tags` field in hj-data.ts,
  // which reported 'rings' and 'titanium' as cache tags the moment this scan widened.
  for (const array of arrayPropertyValues(parseSource(filePath, source), 'tags', 'revalidate')) {
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
  // Scanned across every module, with the file recorded so a failure names the offender.
  const registered = new Set<string>()
  const revalidated = new Set<string>()
  /** tag → files that revalidate it, for actionable failure messages. */
  const revalidatedIn = new Map<string, string[]>()

  for (const file of SOURCE_FILES) {
    const src = readFileSync(file, 'utf-8')
    const rel = relative(ROOT, file)
    for (const tag of registeredTags(file, src)) registered.add(tag)
    for (const tag of revalidatedTags(file, src)) {
      revalidated.add(tag)
      revalidatedIn.set(tag, [...(revalidatedIn.get(tag) ?? []), rel])
    }
  }

  const where = (tag: string) => (revalidatedIn.get(tag) ?? ['?']).join(', ')

  it('scans a plausible number of modules and finds tags on both sides', () => {
    // A walk that silently returned nothing would make every assertion below vacuously
    // pass — the same "covered-looking and worthless" failure secret-exposure.test.ts
    // guards by asserting its graph is non-empty.
    expect(SOURCE_FILES.length).toBeGreaterThan(20)
    expect(registered.size).toBeGreaterThan(0)
    expect(revalidated.size).toBeGreaterThan(0)
  })

  it('covers every revalidation surface, not a hand-listed subset', () => {
    // Pins the generalisation. If someone narrows this back to named files, the next
    // orphan hides in whatever file they forgot — which is exactly how
    // /api/revalidate kept `collections` alive through the fix that removed it.
    const scanned = SOURCE_FILES.map((f) => relative(ROOT, f))
    expect(scanned).toContain('src/app/api/webhooks/shopify/route.ts')
    expect(scanned).toContain('src/app/api/revalidate/route.ts')
    expect(scanned).toContain('src/lib/shopify/index.ts')
  })

  it('every tag the webhook revalidates is registered by some fetcher', () => {
    // Orphans. Revalidating a tag nothing registered is a no-op that looks
    // exactly like a successful invalidation.
    const orphans = [...revalidated].filter((tag) => !registered.has(tag))

    expect(
      orphans,
      'These tags are revalidated but no fetch registers them, so revalidating\n' +
        'them does nothing at all:\n  ' +
        orphans.map((t) => `${t}  (in ${where(t)})`).join('\n  '),
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
      const source = `const o = { revalidate: 3600, tags: ['collections'] }`
      expect([...registeredTags('x.ts', source)]).toEqual(['inline:collections'])
    })

    it('ignores a `tags` field that is not a cache-options object', () => {
      // Product data in hj-data.ts carries its own `tags`. Widening this scan from two
      // named files to every module made that collide, reporting 'rings' and 'titanium'
      // as cache tags — a false positive created by broadening, not by the code.
      const source = `const product = { handle: 'x', tags: ['rings', 'titanium'] }`
      expect([...registeredTags('x.ts', source)]).toEqual([])
    })
  })
})
