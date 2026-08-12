import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}))

const { POST } = await import('@/app/api/revalidate/route')
const { revalidatePath, revalidateTag } = await import('next/cache')
const { PRODUCTS_TAG, collectionTag } = await import('@/lib/shopify/cacheTags')
const { hjCollections } = await import('@/lib/data/hj-data')

/**
 * The manual counterpart to the Shopify webhook: purge the cache without waiting for a
 * store event or the 3600s window.
 *
 * **This route had no tests at all until now**, which is how it kept a bug the rest of the
 * codebase had already fixed. It called `revalidateTag('collections')` — a tag no fetch
 * anywhere registers, so the call did nothing — months after that orphan was removed from
 * the webhook route, because `cache-tag-contract.test.ts` read two named files and this was
 * not one of them.
 *
 * It is also live, public and authenticated while nothing calls it and no doc mentioned it:
 * structurally the same as the orphaned Vercel token — provisioned, abandoned, still
 * reachable. The auth assertions come first here for that reason.
 */

const SECRET = 'test-revalidation-secret'

function makeRequest(secret?: string | null, url = 'http://localhost/api/revalidate') {
  const headers: Record<string, string> = {}
  if (typeof secret === 'string') headers['x-revalidate-secret'] = secret
  return new NextRequest(url, { method: 'POST', headers })
}

describe('POST /api/revalidate', () => {
  beforeEach(() => {
    vi.unstubAllEnvs()
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  describe('authentication', () => {
    it('returns 503 when the secret is not configured', async () => {
      // Distinct from 401 on purpose: "this deployment cannot revalidate" and "you are not
      // allowed to" are different problems with different fixes.
      vi.stubEnv('SHOPIFY_REVALIDATION_SECRET', '')
      const res = await POST(makeRequest(SECRET))

      expect(res.status).toBe(503)
      expect(revalidateTag).not.toHaveBeenCalled()
    })

    it('returns 401 when the header is absent', async () => {
      vi.stubEnv('SHOPIFY_REVALIDATION_SECRET', SECRET)
      const res = await POST(makeRequest(null))

      expect(res.status).toBe(401)
      expect(revalidateTag).not.toHaveBeenCalled()
    })

    it('returns 401 for a wrong secret of the same length', async () => {
      // Same length matters: the length check runs before timingSafeEqual, which throws on
      // mismatched buffers. A wrong-but-same-length secret is the case that actually
      // reaches the comparison.
      vi.stubEnv('SHOPIFY_REVALIDATION_SECRET', SECRET)
      const res = await POST(makeRequest('x'.repeat(SECRET.length)))

      expect(res.status).toBe(401)
      expect(revalidateTag).not.toHaveBeenCalled()
    })

    it('returns 401 for a wrong secret of a different length without throwing', async () => {
      // `timingSafeEqual` throws on mismatched lengths rather than returning false. If the
      // guard were ever reordered this would surface as a 500 — an unhandled crash on an
      // unauthenticated request.
      vi.stubEnv('SHOPIFY_REVALIDATION_SECRET', SECRET)
      const res = await POST(makeRequest('short'))

      expect(res.status).toBe(401)
    })

    it('ignores a secret supplied as a query parameter', async () => {
      // Query strings land in access logs and Referer headers. The secret is header-only,
      // and this pins that a URL-borne one is not accepted as a fallback.
      vi.stubEnv('SHOPIFY_REVALIDATION_SECRET', SECRET)
      const res = await POST(
        makeRequest(null, `http://localhost/api/revalidate?secret=${SECRET}`),
      )

      expect(res.status).toBe(401)
      expect(revalidateTag).not.toHaveBeenCalled()
    })
  })

  describe('revalidation', () => {
    beforeEach(() => {
      vi.stubEnv('SHOPIFY_REVALIDATION_SECRET', SECRET)
    })

    it('accepts the correct secret', async () => {
      const res = await POST(makeRequest(SECRET))
      expect(res.status).toBe(200)
      expect((await res.json()) as { revalidated: boolean }).toMatchObject({ revalidated: true })
    })

    it('revalidates the shared products tag, never a string literal', async () => {
      await POST(makeRequest(SECRET))
      expect(revalidateTag).toHaveBeenCalledWith(PRODUCTS_TAG)
    })

    it('revalidates every collection tag a fetch actually registers', async () => {
      // `getProductsByCollection` registers `collection:<handle>`. The route used to
      // revalidate a bare 'collections' instead, which matched nothing.
      await POST(makeRequest(SECRET))

      for (const collection of hjCollections) {
        expect(revalidateTag).toHaveBeenCalledWith(collectionTag(collection.handle))
      }
    })

    it('never revalidates the orphaned bare "collections" tag', async () => {
      // The specific regression. Guarded here as well as in the contract test, because
      // this is the file where it survived.
      await POST(makeRequest(SECRET))
      expect(revalidateTag).not.toHaveBeenCalledWith('collections')
    })

    it('revalidates a path for every collection, derived rather than hardcoded', async () => {
      // Five paths were written out by hand, so a sixth collection would have been silently
      // skipped while everything else picked it up.
      await POST(makeRequest(SECRET))

      for (const collection of hjCollections) {
        expect(revalidatePath).toHaveBeenCalledWith(`/shop/${collection.handle}`, 'page')
      }
      expect(revalidatePath).toHaveBeenCalledWith('/', 'page')
      expect(revalidatePath).toHaveBeenCalledWith('/shop', 'page')
      expect(revalidatePath).toHaveBeenCalledWith('/products/[handle]', 'page')
    })
  })
})
