import { describe, it, expect } from 'vitest'
import { getAllProducts } from '@/lib/data/hj-data'

const {
  FALLBACK_ONLY_HANDLES,
  SHOPIFY_ONLY_HANDLES,
  unreadTags,
  classifyShopPolicies,
  REQUIRED_SHOP_POLICIES,
  classifyOriginResponse,
  describeAccessDenial,
  classifyPhotographyCoverage,
  required,
} = await import('../../../scripts/verify-production.mjs')

/**
 * `scripts/verify-production.mjs` tells the static fallback apart from the live
 * Shopify catalogue using two handle lists. That discrimination is the whole
 * check — if the lists stop being disjoint, the script keeps passing while
 * testing nothing, which is worse than not having it.
 *
 * The static side is verifiable here, against `hj-data.ts` itself. The Shopify
 * side is verified by the live run; what this file guards is the invariant that
 * makes the comparison meaningful in the first place.
 */
describe('production smoke handle discriminators', () => {
  const staticHandles = getAllProducts().map((p) => p.handle)

  describe('FALLBACK_ONLY_HANDLES', () => {
    it('is non-empty', () => {
      // An empty list would make the "is this the fallback?" check vacuously
      // pass on every run.
      expect(FALLBACK_ONLY_HANDLES.length).toBeGreaterThan(0)
    })

    it('every handle really is in the static catalogue', () => {
      // If one of these is renamed in hj-data.ts and not here, the live site
      // could serve the fallback and the smoke test would not notice.
      for (const handle of FALLBACK_ONLY_HANDLES) {
        expect(staticHandles).toContain(handle)
      }
    })
  })

  describe('SHOPIFY_ONLY_HANDLES', () => {
    it('is non-empty', () => {
      expect(SHOPIFY_ONLY_HANDLES.length).toBeGreaterThan(0)
    })

    it('no handle appears in the static catalogue', () => {
      // This is the load-bearing assertion. The moment one of these is added to
      // hj-data.ts, finding it on the live page stops proving the Shopify fetch
      // worked — the fallback would render it too.
      for (const handle of SHOPIFY_ONLY_HANDLES) {
        expect(staticHandles).not.toContain(handle)
      }
    })
  })

  it('the two lists never overlap', () => {
    const overlap = FALLBACK_ONLY_HANDLES.filter((h: string) => SHOPIFY_ONLY_HANDLES.includes(h))
    expect(overlap).toEqual([])
  })
})

/**
 * Tags are the only channel Shopify gives this project for "which metal is this",
 * and the store's vocabulary once disagreed with the code's in silence:
 * `material:steel` matched nothing, so all 22 products reported Grade 23 Titanium
 * on a brand whose entire promise is knowing which metal touches your skin.
 *
 * That failure is invisible from the store side — a merchant writes a tag, Shopify
 * accepts it, and nothing says the site ignores it. `unreadTags` is what makes it
 * visible, so it is tested against the tag arrays the live catalogue actually
 * carries rather than ones written to agree with it.
 */
describe('unreadTags', () => {
  it('reads every tag the live catalogue currently uses, except one', () => {
    // Verbatim from the connected store, 2026-08-12.
    const live = [
      { tags: ['bestseller', 'material:titanium', 'svg:ring-arc'] },
      { tags: ['material:niobium', 'svg:necklace-disc'] },
      { tags: ['material:steel', 'svg:earring-stud'] },
      { tags: ['material:titanium', 'sale', 'svg:ring-split'] },
      { tags: ['collection:spectrum', 'material:titanium', 'new', 'svg:bracelet-cuff'] },
      { tags: ['collection:spectrum', 'material:niobium', 'new', 'svg:ring-facet'] },
    ]

    // `collection:spectrum` is the real finding: five products carry it and
    // nothing reads it, because collections come from Shopify collection
    // membership, not from tags.
    expect([...unreadTags(live).keys()]).toEqual(['collection:spectrum'])
  })

  it('counts how many products carry each unread tag', () => {
    const products = [{ tags: ['collection:spectrum'] }, { tags: ['collection:spectrum'] }]
    expect(unreadTags(products).get('collection:spectrum')).toBe(2)
  })

  it('accepts every namespace the parsers actually handle', () => {
    const products = [{ tags: ['material:steel', 'svg:charm-star', 'bestseller', 'new', 'sale'] }]
    expect(unreadTags(products).size).toBe(0)
  })

  /**
   * A bare tag is not a namespace. `titanium` on its own is exactly the spelling
   * the code used to look for and the store never wrote — reporting it keeps that
   * mismatch visible rather than letting it pass as "close enough".
   */
  it('reports a bare material name, which no parser reads', () => {
    expect([...unreadTags([{ tags: ['titanium'] }]).keys()]).toEqual(['titanium'])
  })

  it('normalises case and whitespace before judging', () => {
    expect(unreadTags([{ tags: ['  Material:Titanium  ', ' BESTSELLER '] }]).size).toBe(0)
  })

  it('ignores empty tags rather than reporting a blank finding', () => {
    expect(unreadTags([{ tags: ['', '   '] }]).size).toBe(0)
  })

  it('handles a product with no tags at all', () => {
    expect(unreadTags([{}, { tags: [] }]).size).toBe(0)
  })
})

/**
 * Shopify's hosted checkout is the one page in the purchase journey this codebase
 * does not control, and it links whichever of these policies exist. This store
 * ships to 29 countries — fourteen in the EU, where the right of withdrawal has to
 * be disclosed before the order is placed.
 *
 * As of 2026-08-13 the live store has **one** policy, Privacy, and it is Shopify's
 * unedited template. The fixtures below are that real response, so this suite goes
 * red today and green only once the drafts in `docs/shopify-policies/` have been
 * pasted in.
 */
describe('classifyShopPolicies', () => {
  const edited = (type: string) => ({ type, body: '<p>Real, human-written text.</p>' })

  it('accepts a store with all four policies written', () => {
    const result = classifyShopPolicies(REQUIRED_SHOP_POLICIES.map(edited))
    expect(result.ok).toBe(true)
    expect(result.missing).toEqual([])
    expect(result.templated).toEqual([])
  })

  /** The live store, verbatim in shape: one policy of four. */
  it('reports the three policies the live store does not have', () => {
    const result = classifyShopPolicies([edited('PRIVACY_POLICY')])
    expect(result.ok).toBe(false)
    expect(result.missing).toEqual(['REFUND_POLICY', 'TERMS_OF_SERVICE', 'SHIPPING_POLICY'])
  })

  /**
   * The half a presence check cannot see. Shopify *interpolates* these at render
   * time, so the page looks finished — and publishes "My Store 2" and the store's
   * contact address to every customer who opens it.
   */
  it.each([
    ['shop name', '<p>{{ shop_name }} operates this store.</p>'],
    ['contact email', '<p>Email us at {{ email }}.</p>'],
    ['a conditional block', '<p>{% if selling_to_europe %}EEA text{% endif %}</p>'],
  ])("flags a policy still carrying Shopify's %s placeholder", (_label, body) => {
    const result = classifyShopPolicies([{ type: 'PRIVACY_POLICY', body }], ['PRIVACY_POLICY'])
    expect(result.ok).toBe(false)
    expect(result.templated).toEqual(['PRIVACY_POLICY'])
    // Present, so not missing. The two failures are distinct and fixed differently.
    expect(result.missing).toEqual([])
  })

  it('treats an empty body as absent — a heading with no text is not a policy', () => {
    for (const body of ['', '   ', '\n']) {
      expect(
        classifyShopPolicies([{ type: 'REFUND_POLICY', body }], ['REFUND_POLICY']).missing
      ).toEqual(['REFUND_POLICY'])
    }
  })

  it('treats a null body as absent', () => {
    expect(
      classifyShopPolicies([{ type: 'REFUND_POLICY', body: null }], ['REFUND_POLICY']).missing
    ).toEqual(['REFUND_POLICY'])
  })

  it('does not flag ordinary braces in prose', () => {
    // A false positive here would block a perfectly good policy, and the fix
    // someone reaches for is to delete the check.
    const body = '<p>Sizes {5, 6, 7} are stocked. 100% of orders ship free.</p>'
    expect(classifyShopPolicies([{ type: 'REFUND_POLICY', body }], ['REFUND_POLICY']).ok).toBe(true)
  })

  it('reports what IS present, so the message is actionable', () => {
    expect(classifyShopPolicies([edited('PRIVACY_POLICY')]).present).toEqual(['PRIVACY_POLICY'])
  })

  it('requires the four the checkout links, and says which', () => {
    expect(REQUIRED_SHOP_POLICIES).toEqual([
      'PRIVACY_POLICY',
      'REFUND_POLICY',
      'TERMS_OF_SERVICE',
      'SHIPPING_POLICY',
    ])
  })
})

/**
 * **The branch that was wrong in production for the entire life of the script.**
 *
 * `PRODUCTION_SITE_URL` was `https://healthyjewellery.com`, which answered
 * `307 → https://healthy-jewellery.vercel.app/`. Nothing checked that, so the redirect
 * surfaced as twelve unrelated-looking failures — including one that blamed
 * `dynamicParams = false` for a 307 it had no part in.
 *
 * A redirect is exactly the kind of state that cannot be reproduced by running the script
 * locally, so the whole point of splitting the classifier out is that both branches run here.
 */
describe('classifyOriginResponse', () => {
  const SITE = 'https://healthyjewellery.com'

  it('passes a host that answers directly', () => {
    const { ok, detail } = classifyOriginResponse(SITE, 200, null)
    expect(ok).toBe(true)
    expect(detail).toContain('no redirect')
  })

  it("passes a 4xx or 5xx — broken, but not a redirect, and not this check's finding", () => {
    // Another check will catch a 500. Claiming it here would be a second alarm for one
    // fault, which is how a report stops being read.
    for (const status of [404, 500, 503]) {
      expect(classifyOriginResponse(SITE, status, null).ok).toBe(true)
    }
  })

  it('fails the real production case and names the target', () => {
    const { ok, detail } = classifyOriginResponse(
      SITE,
      307,
      'https://healthy-jewellery.vercel.app/'
    )
    expect(ok).toBe(false)
    expect(detail).toContain('307')
    expect(detail).toContain('healthy-jewellery.vercel.app')
  })

  it('states the webhook consequence, which no other check can see', () => {
    // The reason this is a blocking finding rather than a cosmetic one: a correct
    // signing secret cannot rescue a delivery that never gets a 2xx.
    const { detail } = classifyOriginResponse(SITE, 307, 'https://elsewhere.example/')
    expect(detail).toMatch(/webhook/i)
    expect(detail).toMatch(/2xx/)
    expect(detail).toContain('SHOPIFY_WEBHOOK_SECRET')
  })

  it('warns that the other status checks will misreport their cause', () => {
    const { detail } = classifyOriginResponse(SITE, 308, 'https://elsewhere.example/')
    expect(detail).toMatch(/wrong cause/i)
  })

  it('distinguishes a same-origin redirect from a different host', () => {
    // A trailing-slash rule and an unattached domain need different fixes, and the
    // message should not send someone into the Vercel dashboard for the former.
    const same = classifyOriginResponse(SITE, 308, 'https://healthyjewellery.com/en')
    expect(same.detail).toContain('same origin')

    const other = classifyOriginResponse(SITE, 307, 'https://healthy-jewellery.vercel.app/')
    expect(other.detail).toContain('DIFFERENT origin')
  })

  it('survives a 3xx with no Location header at all', () => {
    const { ok, detail } = classifyOriginResponse(SITE, 302, null)
    expect(ok).toBe(false)
    expect(detail).toContain('no Location header')
  })

  it('does not throw on an unparseable Location', () => {
    expect(() => classifyOriginResponse(SITE, 301, '://not a url')).not.toThrow()
    expect(classifyOriginResponse(SITE, 301, '://not a url').ok).toBe(false)
  })
})

/**
 * **"Failed" and "could not look" are different sentences.**
 *
 * Shopify answers an under-scoped Admin token with HTTP 200 and an `ACCESS_DENIED` entry in
 * `errors`. The first live run printed that raw beneath "Every product is published to the
 * headless publication" — so the report asserted a fact about the catalogue that the run had
 * never actually observed. The payloads below are the real ones from that run.
 */
describe('describeAccessDenial', () => {
  const productsDenied = [
    {
      message: 'Access denied for products field.',
      path: ['products'],
      extensions: {
        code: 'ACCESS_DENIED',
        documentation: 'https://shopify.dev/api/usage/access-scopes',
      },
    },
  ]

  const localesDenied = [
    {
      message: 'Access denied for shopLocales field. Required access: `read_locales` access scope.',
      path: ['shopLocales'],
      extensions: {
        code: 'ACCESS_DENIED',
        requiredAccess: '`read_locales` access scope or `read_markets_home` access scope.',
      },
    },
  ]

  it('returns null when the failure is not an authorization problem', () => {
    // A real data error must keep its raw payload — this function must not swallow
    // everything that arrives in `errors`.
    expect(
      describeAccessDenial([
        { message: 'Field does not exist', extensions: { code: 'undefinedField' } },
      ])
    ).toBeNull()
    expect(describeAccessDenial([])).toBeNull()
    expect(describeAccessDenial(undefined)).toBeNull()
  })

  it('names the field the token could not read', () => {
    const detail = describeAccessDenial(productsDenied)
    expect(detail).toContain('products')
    expect(detail).toMatch(/could not be evaluated/)
  })

  it('quotes the scope Shopify asked for when it offers one', () => {
    expect(describeAccessDenial(localesDenied)).toContain('read_locales')
  })

  it('does not invent a scope when Shopify does not name one', () => {
    // `requiredAccess` is absent on the products denial above. Guessing `read_products`
    // would be right often enough to be trusted and wrong often enough to mislead.
    expect(describeAccessDenial(productsDenied)).not.toMatch(/needs:/)
  })

  it('says plainly that this is not a finding about the store', () => {
    expect(describeAccessDenial(productsDenied)).toMatch(/NOT a finding about the store/)
  })

  it('mentions the reinstall, which is the step people miss', () => {
    // Regranting scopes in the app config does nothing until the app is reinstalled;
    // without this line the next run fails identically and looks like the fix did not work.
    expect(describeAccessDenial(productsDenied)).toMatch(/reinstall/i)
  })

  it('de-duplicates fields and scopes across several denials', () => {
    const detail = describeAccessDenial([...productsDenied, ...productsDenied, ...localesDenied])
    expect(detail).not.toBeNull()
    // Non-null asserted above; narrowing it here keeps the two matches on a `string`.
    const text = detail as string
    expect(text.match(/products/g)).toHaveLength(1)
    expect(text.match(/read_locales/g)).toHaveLength(1)
  })
})

/**
 * The branch that has never been observed live.
 *
 * `verify-production.mjs` has not executed in 30 consecutive scheduled runs — the workflow
 * dies at preflight — so the failing branch of this check has never run against the real
 * store and, on current evidence, neither has the passing one. That is exactly the shape
 * `premise-checks.test.ts` warns about: *"a detector that has only ever been observed
 * saying 'fine' is not a detector."* Both branches run here instead.
 */
describe('classifyPhotographyCoverage', () => {
  it('fails when nothing is photographed, and names the console to fix it in', () => {
    const { ok, detail } = classifyPhotographyCoverage(0, 22) as { ok: boolean; detail: string }

    expect(ok).toBe(false)
    expect(detail).toContain('0/22')
    // The reader's next action, not just the verdict — the house style from
    // describeAccessDenial. This one is a content task in a console, not a code change.
    expect(detail).toMatch(/Shopify Admin/)
    expect(detail).toMatch(/no code step/i)
    expect(detail).toMatch(/STATE\.md item 9/)
  })

  it('passes on the very first photograph', () => {
    // The floor is one, deliberately: the claim is that the storefront shows the object at
    // all, and the first photo is what turns that from false to true.
    const { ok, detail } = classifyPhotographyCoverage(1, 22) as { ok: boolean; detail: string }

    expect(ok).toBe(true)
    expect(detail).toContain('1/22')
    // Partial coverage is reported as correct-for-now rather than as a smaller failure.
    expect(detail).toMatch(/21 draw the illustration/)
  })

  it('reports full coverage distinctly from partial', () => {
    const full = classifyPhotographyCoverage(22, 22) as { ok: boolean; detail: string }

    expect(full.ok).toBe(true)
    expect(full.detail).toMatch(/full coverage/i)
    expect(full.detail).not.toMatch(/illustration/)
  })

  it('treats an empty store as nothing to cover, not as zero coverage', () => {
    // A false alarm on day one is fatal to a detector, and "0 of 0 products have a photo"
    // would send the reader to the photography console when the catalogue is the problem.
    const { ok, detail } = classifyPhotographyCoverage(0, 0) as { ok: boolean; detail: string }

    expect(ok).toBe(false)
    expect(detail).toMatch(/no products at all/i)
    expect(detail).not.toMatch(/Shopify Admin/)
  })
})

/**
 * **A missing credential means a check could not look, not that production is broken.**
 *
 * `required()` threw a plain `Error`, so a check whose credential was absent printed under
 * `Failed:` beside genuine breakage — sending a reader hunting for unpublished products
 * that are, in fact, published. That is the mislabelling `describeAccessDenial` was written
 * to prevent one layer down, arriving through the credential instead of through the API's
 * response.
 *
 * It became load-bearing on 2026-08-29, when each live step started gating on its own
 * capability rather than on the preflight's verdict. A run with a wrong Admin token now
 * executes the twelve checks that never read it; the five that do must report
 * `⚠ could not evaluate` rather than five fabricated production failures.
 *
 * An unevaluable check still counts against the run and still exits non-zero (ADR 006) —
 * a control that could not run is not a control that succeeded. Only the name changes.
 */
describe('a credential this check cannot reach', () => {
  it('throws unevaluable rather than a plain failure', () => {
    delete process.env.__HJ_ABSENT_FOR_TEST__
    let thrown: (Error & { unevaluable?: boolean }) | null = null
    try {
      required('__HJ_ABSENT_FOR_TEST__')
    } catch (error) {
      thrown = error as Error & { unevaluable?: boolean }
    }
    expect(thrown, 'required() should throw when the variable is absent').not.toBeNull()
    expect(
      thrown?.unevaluable,
      'a missing credential is "could not run", not "production is broken" — ADR 010'
    ).toBe(true)
  })

  it('says so in words a reader can act on', () => {
    expect(() => required('__HJ_ABSENT_FOR_TEST__')).toThrow(/could not run/)
  })

  it('returns the value when it is present', () => {
    process.env.__HJ_PRESENT_FOR_TEST__ = 'a-value'
    expect(required('__HJ_PRESENT_FOR_TEST__')).toBe('a-value')
    delete process.env.__HJ_PRESENT_FOR_TEST__
  })
})
