import { describe, expect, it } from 'vitest'
import {
  AMBASSADOR_NEXT_STEP,
  BROWSE_NEXT_STEP,
  goneResponse,
  goneRoute,
  renderGonePage,
} from '@/lib/http/goneResponse'

/**
 * **The 410 builder, and the four route modules that are now one thing.**
 *
 * ## What this covers that the E2E suite cannot
 *
 * `e2e/retired-routes.spec.ts` asserts these paths answer 410 over real HTTP, which is the
 * only tier that can catch a soft 200. It cannot cheaply assert the *shape* of every header
 * on every one of them, and it will not run at all on a branch whose build is broken.
 *
 * The split is the usual one here: E2E proves the route is wired, this proves the response
 * is right. The defect it is written against is specific — four hand-rolled copies of a
 * `Response` is four places for `X-Robots-Tag` to go missing from one, and that failure
 * breaks nothing, renders correctly, and leaves one withdrawn capability indexable.
 *
 * ## Why every verb is enumerated rather than sampled
 *
 * Next's default for an unhandled method is 405 Method Not Allowed, which asserts the
 * resource exists and the verb is wrong — the opposite of true here. A stale `POST` from a
 * restored tab or a `PUT` from an orphaned service worker has to get the same answer as a
 * `GET`, and "the same answer" is only checkable by checking each of them.
 */

const COPY = {
  title: 'Gone — test',
  heading: 'This capability was withdrawn.',
  paragraphs: ['First.', AMBASSADOR_NEXT_STEP],
} as const

describe('the 410 response', () => {
  it('is 410, not 404 and not a redirect', async () => {
    const response = goneResponse(COPY)
    expect(response.status).toBe(410)
    expect(response.headers.get('location')).toBe(null)
  })

  it('is not indexable, by header as well as by meta tag', async () => {
    // Both, because a crawler that reads only headers never builds a DOM, and a client that
    // renders the page never sees the header. Each covers the other's blind spot.
    const response = goneResponse(COPY)
    expect(response.headers.get('x-robots-tag')).toMatch(/noindex/i)
    expect(await response.text()).toMatch(/<meta name="robots" content="noindex/i)
  })

  it('is cacheable but re-askable', async () => {
    /*
     * The failure this pins is a decision nobody can reverse. `immutable` or a year-long
     * max-age on a 410 means every intermediary keeps answering Gone long after somebody
     * decides otherwise, and there is no way to recall it. An hour is durable enough to
     * stop the origin being hammered and short enough that a reversal takes effect.
     */
    const cacheControl = goneResponse(COPY).headers.get('cache-control') ?? ''
    expect(cacheControl).toMatch(/max-age=\d+/)
    expect(cacheControl).not.toMatch(/immutable/)
    const maxAge = Number(/max-age=(\d+)/.exec(cacheControl)?.[1])
    expect(maxAge).toBeGreaterThan(0)
    expect(maxAge).toBeLessThanOrEqual(86_400)
  })

  it('serves HTML, so a browser renders it rather than downloading it', () => {
    expect(goneResponse(COPY).headers.get('content-type')).toMatch(/^text\/html/)
  })
})

describe('the 410 document', () => {
  const html = renderGonePage(COPY)

  it('carries the copy it was given', () => {
    expect(html).toContain('<title>Gone — test</title>')
    expect(html).toContain('This capability was withdrawn.')
    expect(html).toContain('<p>First.</p>')
  })

  it('depends on nothing the site might have lost', () => {
    /*
     * The point of this page is that it renders when the rest of the application does not.
     * A stylesheet link, a script tag or a font request is a dependency on exactly the
     * pipeline that may be the thing that is gone — and each would fail silently, leaving
     * an unstyled or blank page at the one URL that has to explain itself.
     */
    expect(html).not.toMatch(/<link\b/i)
    expect(html).not.toMatch(/<script\b/i)
    expect(html).not.toMatch(/var\(--/)
    expect(html).not.toMatch(/https?:\/\//)
  })

  it('is a complete document a browser will not quirks-mode', () => {
    expect(html.startsWith('<!DOCTYPE html>')).toBe(true)
    expect(html).toContain('<html lang="en">')
    expect(html).toContain('name="viewport"')
  })
})

describe('the shared next steps', () => {
  /*
   * A 410 that only says no has answered the crawler and abandoned the person who followed
   * a link from an old email. These two constants are the part that must never vary, and
   * `browse-only-copy.test.tsx` already records what it costs when one fact about how this
   * brand sells is written separately in four places.
   */
  it('hand the visitor to a person, not to a form', () => {
    expect(AMBASSADOR_NEXT_STEP).toMatch(/ambassador/i)
    expect(AMBASSADOR_NEXT_STEP).toContain('/contact')
  })

  it('leave a way back into the catalogue', () => {
    expect(BROWSE_NEXT_STEP).toContain('/shop')
  })

  it('promise nothing transactional', () => {
    for (const copy of [AMBASSADOR_NEXT_STEP, BROWSE_NEXT_STEP]) {
      expect(copy).not.toMatch(/\b(buy|purchase|order now|checkout|cart|price|\$)/i)
    }
  })
})

describe('every method answers', () => {
  const route = goneRoute(COPY)
  const VERBS = ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'] as const

  it.each(VERBS)('%s is 410, not 405', (verb) => {
    const handler = route[verb]
    expect(handler, `${verb} has no handler — Next would answer 405`).toBeTypeOf('function')
    expect(handler().status).toBe(410)
  })

  it('exports exactly those verbs and no more', () => {
    // Guard on the guard. If `goneRoute` ever returned an empty object, every assertion
    // above would still pass on `undefined` being caught by the `toBeTypeOf` message — so
    // the shape is pinned independently.
    expect(Object.keys(route).sort()).toEqual([...VERBS].sort())
  })

  it('builds a fresh response each call, because a Response body is single-use', () => {
    /*
     * The bug this refuses: a handler that closes over one `Response` instance serves the
     * first request correctly and every subsequent one with an already-consumed body. It
     * would pass any test that made a single call.
     */
    const a = route.GET()
    const b = route.GET()
    expect(a).not.toBe(b)
    expect(a.bodyUsed).toBe(false)
    expect(b.bodyUsed).toBe(false)
  })
})
