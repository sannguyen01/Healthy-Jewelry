import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { parseSource, callsTo, arrayPropertyValues } from '@/lib/analysis/tsAstScan'

/**
 * A cache tag is a bare string on both sides of an invalidation:
 *
 *   - a fetcher *registers* tags when it fetches;
 *   - a webhook or purge route *revalidates* tags when something is said to have changed.
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
 * string the route used. So this checked the two files against *each other*.
 *
 * ## The registration side is gone, and this file had to be re-founded rather than deleted
 *
 * `src/lib/shopify/index.ts` was the only module that ever registered a tag — `tags: [...]`
 * on a `fetch` cache-options object. WS-4c deleted it: the catalogue is seventeen validated
 * records imported at module load
 * ([ADR 034](../../../docs/adr/034-the-catalogue-is-the-source.md)), and an in-bundle import
 * has no fetch cache to tag.
 *
 * So **every surviving `revalidateTag` call is an orphan by construction**, and the
 * orphan check as written would now report all of them. That is not a defect in the route:
 * it survives on purpose. WS-F's ordering is *delete the Shopify webhook subscriptions
 * before removing `/api/webhooks/shopify`*, those subscriptions can only be deleted from
 * Shopify Admin, and the connector reads `needs_reconnect`. Removing the endpoint first
 * would leave Shopify retrying against a failing route for its full backoff schedule.
 *
 * ## One revalidator left, and what that did to this file (2026-09-25)
 *
 * WS-A deleted `/api/revalidate`, the manual purge endpoint: a catalogue of JSON files in
 * git is revalidated by deploying it, and the endpoint's only job was purging caches a
 * deleted fetcher used to fill. That left **one** revalidating route and **zero**
 * registering modules, and two of this file's checks lost their subject
 * ([ADR 035](../../../docs/adr/035-a-control-outlives-its-subject.md)):
 *
 *   - *"both revalidating routes import the tag names rather than spelling them inline"*
 *     was a rule about two files agreeing. One file cannot disagree with itself, so as
 *     written it would have gone on passing and meant nothing. It is not kept narrowed to
 *     one route; it is **subsumed** by the exact-set assertion below, where an inline
 *     literal resolves to `inline:<value>` and is not in the accepted set.
 *   - the call-count floor (`>= 5`) counted the deleted route's two calls. A floor that
 *     silently absorbs the loss of a participant is the narrowing-by-omission ADR 007
 *     warns about, so the count is now an equality against a named set.
 *
 * What this file checks now:
 *
 *   1. **the orphan check, re-founded.** With nothing registering tags, the orphan rule
 *      `revalidated ⊆ registered` would condemn every call. What is still true, and still
 *      worth failing on, is that the orphans are *exactly the known ones*: three tags, in
 *      one file, retained under WS-F's ordering. A new `revalidateTag` anywhere else is a
 *      purge of a tag nothing registers — a no-op that looks like an invalidation — and
 *      fails here by file and tag. The day WS-F deletes the webhook route, the set goes
 *      empty and this fails too, saying to delete this file with `cacheTags.ts`, rather
 *      than passing vacuously over nothing;
 *   2. every purge still passes `PURGE_NOW` rather than a profile that keeps serving stale
 *      copy;
 *   3. the bare `collections` orphan has not come back;
 *   4. **registration is still zero** — a premise detector
 *      ([ADR 008](../../../docs/adr/008-decisions-need-premise-detectors.md)). The moment
 *      any module registers a cache tag again, the orphan and widow checks are meaningful
 *      again and must be restored. That test fails and says so, rather than this file
 *      quietly staying narrow for a codebase that has moved back underneath it.
 */

const ROOT = process.cwd()

/**
 * **Every** module, not two named files.
 *
 * The first version of this test read `src/lib/shopify/index.ts` and the webhook route by
 * name — and therefore never saw the manual purge route (`/api/revalidate`, deleted
 * 2026-09-25), a third revalidation surface which still called
 * `revalidateTag('collections')`: the exact orphan this contract was written to eliminate,
 * surviving the fix that eliminated it everywhere the test happened to be looking.
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

/** The one revalidating route left, retained under WS-F's ordering. */
const WEBHOOK_ROUTE = 'src/app/api/webhooks/shopify/route.ts'

/**
 * **The orphans this repository knows about, and accepts, by file and tag.**
 *
 * Every entry is a purge of a tag no module registers — a no-op that looks like an
 * invalidation. They are accepted rather than fixed because the route that makes them is
 * waiting on a console action (WS-F), and deleting the calls without deleting the route
 * would be tidying a file that is scheduled to go whole. The set is compared by equality,
 * in both directions, so it cannot grow quietly and cannot outlive its route.
 */
const ACCEPTED_ORPHANS: ReadonlyArray<{ file: string; tag: string }> = [
  { file: WEBHOOK_ROUTE, tag: 'products' },
  { file: WEBHOOK_ROUTE, tag: 'product:<param>' },
  { file: WEBHOOK_ROUTE, tag: 'collection:<param>' },
]

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

  // `where(tag)` stood here, naming the files that revalidate a tag so an orphan failure
  // could point at the offender. Its only caller was the orphan assertion, which is
  // suspended below — see the note there. It goes with the assertion rather than being
  // kept as an unused helper, and comes back with it.

  it('scans a plausible number of modules and finds tags to revalidate', () => {
    // A walk that silently returned nothing would make every assertion below vacuously
    // pass — the same "covered-looking and worthless" failure secret-exposure.test.ts
    // guards by asserting its graph is non-empty.
    //
    // `registered.size > 0` was asserted here too and is now asserted to be *zero*, in
    // its own test below. See the note at the top of this file.
    expect(SOURCE_FILES.length).toBeGreaterThan(20)
    expect(revalidated.size).toBeGreaterThan(0)
  })

  it('covers every revalidation surface, not a hand-listed subset', () => {
    // Pins the generalisation. If someone narrows this back to named files, the next
    // orphan hides in whatever file they forgot — which is exactly how the manual purge
    // route kept `collections` alive through the fix that removed it.
    const scanned = SOURCE_FILES.map((f) => relative(ROOT, f))
    expect(scanned).toContain(WEBHOOK_ROUTE)
  })

  /**
   * **The orphan check, re-founded for a codebase with no producer.**
   *
   * `revalidated ⊆ registered` cannot be asked while `registered` is empty — it would
   * condemn every call, including the three kept on purpose. The question that still has
   * an answer is narrower and exact: *are the orphans the ones we know about?* Asked as an
   * equality over `file → tag` pairs, so each direction fails with its own message:
   *
   *   - **one more** — a new purge of a tag nothing registers. It compiles, a mocked
   *     `next/cache` passes it, and it invalidates nothing. Exactly the orphan this file
   *     was written for, arriving in a codebase where it can no longer be anything else;
   *   - **one fewer** — the webhook route has gone (WS-F), or stopped purging. Either way
   *     this file's subject is gone with it, and the right change is to delete this test
   *     and `src/lib/shopify/cacheTags.ts` together, not to shrink the list until it
   *     passes over nothing ([ADR 035](../../../docs/adr/035-a-control-outlives-its-subject.md)).
   */
  it('every revalidated tag is a known, accepted orphan — and every accepted orphan is still revalidated', () => {
    const key = (o: { file: string; tag: string }) => `${o.file} → ${o.tag}`
    const observed = new Set<string>()
    for (const [tag, files] of revalidatedIn) {
      for (const file of files) observed.add(key({ file, tag }))
    }
    const accepted = new Set(ACCEPTED_ORPHANS.map(key))

    const unexpected = [...observed].filter((o) => !accepted.has(o)).sort()
    const vanished = [...accepted].filter((a) => !observed.has(a)).sort()

    expect(
      unexpected,
      `A module purges a cache tag that nothing registers:\n  ${unexpected.join('\n  ')}\n\n` +
        `No fetch registers a cache tag any more (see the premise test above), so this call ` +
        `invalidates nothing while reading as an invalidation. If a fetch cache has come back, ` +
        `restore the orphan and widow checks instead; otherwise delete the call.`
    ).toEqual([])
    expect(
      vanished,
      `An accepted orphan is no longer revalidated:\n  ${vanished.join('\n  ')}\n\n` +
        `If ${WEBHOOK_ROUTE} has been deleted (WS-F), this contract's subject is gone: delete ` +
        `this test file and src/lib/shopify/cacheTags.ts in the same change, and remove their ` +
        `register rows. Do not shrink ACCEPTED_ORPHANS to make this pass over an empty set.`
    ).toEqual([])
  })

  /**
   * **The premise detector: nothing registers a cache tag any more.**
   *
   * This is the assertion that makes the narrowing above honest rather than convenient.
   * The orphan and widow checks are not deleted below — they are *suspended*, and this is
   * what un-suspends them: the moment any module registers a tag, a producer exists again,
   * the two sides can drift again, and both checks have to come back.
   *
   * Written as an equality against zero rather than as a skipped test, because a skipped
   * test reports nothing and this has to fail loudly. Same shape as
   * `soft-404-premise.test.ts`, which failed the moment the product page's data source
   * moved and named the fix in its message.
   */
  it('nothing registers a cache tag, which is why the orphan check is suspended', () => {
    expect(
      [...registered],
      `A module registers cache tags again: ${[...registered].join(', ')}.\n\n` +
        `That means there is a fetch cache to invalidate, so the orphan and widow checks ` +
        `in this file are meaningful again and must be restored — they are suspended ` +
        `only because WS-4c removed the last fetcher and left the two revalidating ` +
        `routes standing (WS-7 deletes them, after the Shopify subscriptions go).\n\n` +
        `Restore 'every tag the webhook revalidates is registered by some fetcher' and ` +
        `'every tag a fetcher registers is revalidated by some topic', and delete this ` +
        `test.`
    ).toEqual([])
  })

  describe('every purge asks for immediate expiry', () => {
    /**
     * **Next 16 made the second argument required, and a plausible wrong value
     * is invisible.**
     *
     * `revalidateTag(tag)` became `revalidateTag(tag, profile)`, where the
     * profile is a named cacheLife profile or `{ expire }` in seconds. The
     * required-ness is the good part: the upgrade was five type errors rather
     * than a silent behaviour change.
     *
     * What nothing would catch is the wrong profile. Every caller here is a
     * webhook or an on-demand purge — something changed in Shopify and the
     * cached copy is now wrong — so the only correct expiry is immediate. Pass
     * `'max'` instead (the example in Next's own doc comment) and the code
     * compiles, both route suites still pass because they mock `next/cache`,
     * and the sole observable difference is that Shopify webhooks quietly stop
     * purging anything.
     *
     * That is the same failure this file already exists for: a tag spelled two
     * ways is a silent no-op, and so is a tag purged with a profile that means
     * "keep serving the cached copy". Read from the AST for the same reason as
     * everything else here — a `revalidateTag` inside a comment is not a call.
     */
    const calls: { file: string; args: string[] }[] = []
    for (const file of SOURCE_FILES) {
      const src = readFileSync(file, 'utf-8')
      for (const args of callsTo(parseSource(file, src), 'revalidateTag')) {
        calls.push({ file: relative(ROOT, file), args })
      }
    }

    it('finds the calls it is meant to be checking', () => {
      // Without this the two assertions below pass on an empty list, which is
      // the "covered-looking and worthless" state the suite above guards too.
      //
      // Was `>= 5`, and two of the five were the deleted manual purge route's. A floor
      // that absorbs a participant's disappearance is the silent direction, so this now
      // counts against the accepted set: one call per accepted orphan, no more, no fewer.
      expect(calls.length).toBe(ACCEPTED_ORPHANS.length)
    })

    it('passes a profile at every call site', () => {
      const bare = calls.filter((c) => c.args.length < 2).map((c) => `${c.file}: ${c.args[0]}`)
      expect(
        bare,
        'A revalidateTag call passes no cacheLife profile. Next 16 requires one — a ' +
          'single-argument call does not compile, so this failing means the scan is ' +
          'reading something the compiler is not.'
      ).toEqual([])
    })

    it('uses PURGE_NOW, never a named profile that keeps serving stale copy', () => {
      const wrong = calls
        .filter((c) => c.args[1] !== 'PURGE_NOW')
        .map((c) => `${c.file}: revalidateTag(${c.args[0]}, ${c.args[1]})`)

      expect(
        wrong,
        'A purge passes something other than PURGE_NOW. Every caller is a webhook or an ' +
          'on-demand invalidation, where the cached copy is already known to be wrong, so ' +
          'the expiry must be immediate. A named profile such as "max" means the opposite ' +
          'and fails silently: it compiles, the mocked route tests pass, and pages stay ' +
          'stale until their own window closes. See PURGE_NOW in lib/shopify/cacheTags.ts.'
      ).toEqual([])
    })
  })

  /*
   * The orphan and widow checks stood here.
   *
   *   - **Orphans**: a tag revalidated but registered by no fetch. Revalidating it is a
   *     no-op that looks exactly like a successful invalidation.
   *   - **Widows**: a tag registered but never revalidated, so those pages are only ever
   *     refreshed by their time-based window.
   *
   * Both compare `revalidated` against `registered`, and `registered` is now empty for the
   * reason the header explains: the only module that ever registered a tag was the Shopify
   * fetcher, and WS-4c deleted it. Run as written, the orphan check would report every
   * surviving call and the widow check would pass vacuously — one false alarm and one
   * false assurance, from the same missing producer.
   *
   * They are not deleted, because they are the substance of this contract and the
   * conditions for them return the moment anything fetches again. The test immediately
   * above is what notices: it asserts `registered` is empty and, when it stops being, says
   * to restore these two by name.
   *
   * The `both sides import the tag names rather than spelling them inline` test went with
   * the fetcher half of it; what survives of it is the two-route version below.
   */

  /*
   * 'both revalidating routes import the tag names rather than spelling them inline' was
   * here. It asserted that two files agreed by importing one vocabulary, and on
   * 2026-09-25 one of the two files was deleted. A rule about agreement between two
   * participants has no subject with one, and narrowed to "the webhook route imports
   * cacheTags" it would have kept passing while meaning nothing.
   *
   * What it protected is still protected, by the exact-set test above: a tag spelled as a
   * literal resolves to `inline:<value>`, which is not an accepted orphan, so bypassing the
   * builders fails there by file and tag.
   */

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
