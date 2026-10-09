// @vitest-environment node
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
import {
  CHROMIUM_IMAGE_ACCEPT,
  ImagePrimerError,
  imageVariantUrls,
  primeImageVariants,
} from '../../../e2e/support/imageVariants'

/**
 * **The image primer, on markup with known answers and against a server that really hangs.**
 *
 * `e2e/global-setup.ts` asks the production server for every image variant, serially, before the
 * suite starts, so that a server that will not answer one stops the run in seconds and names the
 * URL (see `e2e/support/imageVariants.ts` for why). A check that only ever saw a healthy server
 * would pass whether or not it could fail, so the cases that matter here are the failing ones,
 * each against a stub that misbehaves in one specific way: never answering, answering 500,
 * answering 200 with the wrong content, starting a body it never finishes, and answering once
 * and then going quiet. Each is held to the verdict it must give and to the time it may take.
 */

const ORIGIN_PLACEHOLDER = 'http://localhost:3000'

describe('imageVariantUrls', () => {
  it('reads src and srcset from markup, where & is written as &amp;, and de-duplicates', () => {
    const html = `
      <img src="/_next/image?url=%2Fimages%2Fa.jpg&amp;w=1200&amp;q=75"
           srcSet="/_next/image?url=%2Fimages%2Fa.jpg&amp;w=640&amp;q=75 1x, /_next/image?url=%2Fimages%2Fa.jpg&amp;w=1200&amp;q=75 2x">`
    expect(imageVariantUrls(html, ORIGIN_PLACEHOLDER)).toEqual([
      `${ORIGIN_PLACEHOLDER}/_next/image?url=%2Fimages%2Fa.jpg&w=1200&q=75`,
      `${ORIGIN_PLACEHOLDER}/_next/image?url=%2Fimages%2Fa.jpg&w=640&q=75`,
    ])
  })

  it('reads the copies the framework embeds in its own payload, where & is \\u0026 and quotes are escaped', () => {
    const html =
      '<script>self.__next_f.push([1,"{\\"imageSrcSet\\":\\"/_next/image?url=%2Fimages%2Fb.jpg\\u0026w=640\\u0026q=75 640w, /_next/image?url=%2Fimages%2Fb.jpg\\u0026w=750\\u0026q=75 750w\\"}"])</script>'
    expect(imageVariantUrls(html, ORIGIN_PLACEHOLDER)).toEqual([
      `${ORIGIN_PLACEHOLDER}/_next/image?url=%2Fimages%2Fb.jpg&w=640&q=75`,
      `${ORIGIN_PLACEHOLDER}/_next/image?url=%2Fimages%2Fb.jpg&w=750&q=75`,
    ])
  })

  it('ignores what is not an optimiser request for an image at a width', () => {
    const html = [
      '<link href="/_next/static/media/font.woff2">',
      '<img src="/images/plain.jpg">',
      '<a href="/_next/image">bare</a>',
      '<a href="/_next/image?foo=1">no url, no width</a>',
      '<a href="/_next/image?url=%2Fa.jpg">no width</a>',
    ].join('\n')
    expect(imageVariantUrls(html, ORIGIN_PLACEHOLDER)).toEqual([])
  })

  it('finds nothing in a page with no images, rather than failing', () => {
    expect(imageVariantUrls('<html><body>hello</body></html>', ORIGIN_PLACEHOLDER)).toEqual([])
    expect(imageVariantUrls('', ORIGIN_PLACEHOLDER)).toEqual([])
  })
})

// ---------------------------------------------------------------------------------------------

type Behaviour = (req: IncomingMessage, res: ServerResponse, nth: number) => void

const IMG_A_640 = '/_next/image?url=%2Fimages%2Fa.jpg&w=640&q=75'
const IMG_A_1200 = '/_next/image?url=%2Fimages%2Fa.jpg&w=1200&q=75'
const IMG_B_640 = '/_next/image?url=%2Fimages%2Fb.jpg&w=640&q=75'

const PAGE = (...urls: string[]) =>
  `<html><body>${urls.map((u) => `<img src="${u.replace(/&/g, '&amp;')}">`).join('')}</body></html>`

const serve200 = (res: ServerResponse, body = 'IMG'): void => {
  res.writeHead(200, { 'content-type': 'image/webp' })
  res.end(body)
}

interface Stub {
  origin: string
  /** Requests received per path+query, in order. */
  seen: Map<string, number>
  headers: IncomingMessage['headers'][]
  /** The most requests in flight at once. */
  peak: number
}

let server: Server | undefined

async function stub(pages: Record<string, string>, images: Record<string, Behaviour>): Promise<Stub> {
  const state: Stub = { origin: '', seen: new Map(), headers: [], peak: 0 }
  let inFlight = 0
  server = createServer((req, res) => {
    const url = req.url ?? '/'
    inFlight++
    state.peak = Math.max(state.peak, inFlight)
    res.on('close', () => {
      inFlight--
    })
    const nth = (state.seen.get(url) ?? 0) + 1
    state.seen.set(url, nth)
    state.headers.push(req.headers)
    if (url in pages) {
      res.writeHead(200, { 'content-type': 'text/html' })
      res.end(pages[url])
      return
    }
    const behaviour = images[url]
    if (behaviour) return behaviour(req, res, nth)
    res.writeHead(404)
    res.end()
  })
  await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve))
  state.origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  return state
}

afterEach(async () => {
  if (!server) return
  // A hung response holds its socket open, which would hold the close open.
  server.closeAllConnections()
  await new Promise<void>((resolve) => server!.close(() => resolve()))
  server = undefined
})

const FAST = { timeoutMs: 300 }

describe('primeImageVariants against a server that answers', () => {
  it('asks for every variant on every page, serially, twice, and says how many', async () => {
    const lines: string[] = []
    const s = await stub(
      { '/': PAGE(IMG_A_640, IMG_A_1200), '/shop': PAGE(IMG_A_640, IMG_B_640) },
      { [IMG_A_640]: (_q, r) => serve200(r), [IMG_A_1200]: (_q, r) => serve200(r), [IMG_B_640]: (_q, r) => serve200(r) }
    )
    const result = await primeImageVariants({
      origin: s.origin,
      pages: ['/', '/shop'],
      ...FAST,
      log: (l) => lines.push(l),
    })
    expect(result.variants).toBe(3)
    expect(result.pages).toBe(2)
    // Cold pass and warm pass: each variant is asked for exactly twice, and the page twice over once.
    expect(s.seen.get(IMG_A_640)).toBe(2)
    expect(s.seen.get(IMG_A_1200)).toBe(2)
    expect(s.seen.get(IMG_B_640)).toBe(2)
    expect(s.peak).toBe(1)
    expect(lines.at(-1)).toMatch(/3 variants from 2 pages; cold [\d.]+s, warm [\d.]+s; slowest \d+ms/)
  })

  it('sends the Accept header a browser would, so the variant it warms is the one a browser is served', async () => {
    const s = await stub({ '/': PAGE(IMG_A_640) }, { [IMG_A_640]: (_q, r) => serve200(r) })
    await primeImageVariants({ origin: s.origin, pages: ['/'], ...FAST })
    const imageRequests = s.headers.filter((h) => h.accept === CHROMIUM_IMAGE_ACCEPT)
    expect(imageRequests).toHaveLength(2)
  })

  it('passes on a site with no optimised images at all', async () => {
    const s = await stub({ '/': '<html></html>' }, {})
    await expect(primeImageVariants({ origin: s.origin, pages: ['/'], ...FAST })).resolves.toMatchObject({
      variants: 0,
      pages: 1,
    })
  })

  it('skips and logs a page that answers non-200, and still primes the others', async () => {
    const lines: string[] = []
    const s = await stub({ '/': PAGE(IMG_A_640) }, { [IMG_A_640]: (_q, r) => serve200(r) })
    const result = await primeImageVariants({
      origin: s.origin,
      pages: ['/', '/missing'],
      ...FAST,
      log: (l) => lines.push(l),
    })
    expect(result).toMatchObject({ pages: 1, variants: 1 })
    expect(lines).toContain('image primer: /missing answered 404, skipped')
  })
})

describe('primeImageVariants against a server that misbehaves', () => {
  it('names a variant the server never answers, inside the ceiling, and stops there', async () => {
    const s = await stub(
      { '/': PAGE(IMG_A_640, IMG_B_640, IMG_A_1200) },
      {
        [IMG_A_640]: (_q, r) => serve200(r),
        [IMG_B_640]: () => {}, // takes the request and never answers it
        [IMG_A_1200]: (_q, r) => serve200(r),
      }
    )
    const started = Date.now()
    const error = await primeImageVariants({
      origin: s.origin,
      pages: ['/'],
      timeoutMs: 300,
      maxFailures: 1,
    }).catch((e: unknown) => e)
    const took = Date.now() - started

    expect(error).toBeInstanceOf(ImagePrimerError)
    const message = (error as Error).message
    expect(message).toContain('1+ of 3 image variants on its cold pass')
    expect(message).toContain('NO ANSWER within 0.3s')
    expect(message).toContain(IMG_B_640)
    expect(message).not.toContain(IMG_A_640)
    expect(message).toContain('stalls at networkidle')
    // One ceiling, not one per variant and not the 30s a test would have spent: setup fails fast.
    expect(took).toBeLessThan(2_000)
    // And it did stop: the variant after the hung one was never asked for.
    expect(s.seen.get(IMG_A_1200)).toBeUndefined()
  })

  it('reports every hung variant up to the failure cap, so one run shows the shape of the problem', async () => {
    const s = await stub(
      { '/': PAGE(IMG_A_640, IMG_B_640, IMG_A_1200) },
      { [IMG_A_640]: () => {}, [IMG_B_640]: () => {}, [IMG_A_1200]: (_q, r) => serve200(r) }
    )
    const error = (await primeImageVariants({ origin: s.origin, pages: ['/'], ...FAST }).catch(
      (e: unknown) => e
    )) as Error
    expect(error.message).toContain('2 of 3 image variants')
    expect(error.message).toContain(IMG_A_640)
    expect(error.message).toContain(IMG_B_640)
  })

  it('names a variant answered with an error status', async () => {
    const s = await stub(
      { '/': PAGE(IMG_A_640) },
      {
        [IMG_A_640]: (_q, r) => {
          r.writeHead(500)
          r.end('boom')
        },
      }
    )
    const error = (await primeImageVariants({ origin: s.origin, pages: ['/'], ...FAST }).catch(
      (e: unknown) => e
    )) as Error
    expect(error).toBeInstanceOf(ImagePrimerError)
    expect(error.message).toContain('HTTP 500')
    expect(error.message).toContain(IMG_A_640)
  })

  it('does not take a 200 that is not an image, or is empty, for an answer', async () => {
    const s = await stub(
      { '/': PAGE(IMG_A_640, IMG_B_640) },
      {
        [IMG_A_640]: (_q, r) => {
          r.writeHead(200, { 'content-type': 'text/html' })
          r.end('<html>error page</html>')
        },
        [IMG_B_640]: (_q, r) => {
          r.writeHead(200, { 'content-type': 'image/webp' })
          r.end()
        },
      }
    )
    const error = (await primeImageVariants({ origin: s.origin, pages: ['/'], ...FAST }).catch(
      (e: unknown) => e
    )) as Error
    expect(error.message).toContain('"text/html"')
    expect(error.message).toContain('0 bytes of "image/webp"')
  })

  it('treats a response that starts and never ends as unanswered, as networkidle does', async () => {
    const s = await stub(
      { '/': PAGE(IMG_A_640) },
      {
        [IMG_A_640]: (_q, r) => {
          r.writeHead(200, { 'content-type': 'image/webp', 'content-length': '1000' })
          r.write('partial')
        },
      }
    )
    const error = (await primeImageVariants({ origin: s.origin, pages: ['/'], ...FAST }).catch(
      (e: unknown) => e
    )) as Error
    expect(error.message).toContain('NO ANSWER within 0.3s')
    expect(error.message).toContain(IMG_A_640)
  })

  it('names the warm pass when a variant answers once and then goes quiet', async () => {
    const s = await stub(
      { '/': PAGE(IMG_A_640) },
      { [IMG_A_640]: (_q, r, nth) => (nth === 1 ? serve200(r) : undefined) }
    )
    const error = (await primeImageVariants({ origin: s.origin, pages: ['/'], ...FAST }).catch(
      (e: unknown) => e
    )) as Error
    expect(error.message).toContain('on its warm pass')
    expect(error.message).toContain('did not answer from the cache')
    expect(error.message).not.toContain('cold pass')
  })

  it('stops the run when the server is not there at all', async () => {
    const s = await stub({ '/': PAGE(IMG_A_640) }, {})
    const dead = s.origin
    server!.closeAllConnections()
    await new Promise<void>((resolve) => server!.close(() => resolve()))
    server = undefined
    const error = (await primeImageVariants({ origin: dead, pages: ['/'], ...FAST }).catch(
      (e: unknown) => e
    )) as Error
    expect(error).toBeInstanceOf(ImagePrimerError)
    expect(error.message).toContain(`${dead}/ did not answer`)
  })
})
