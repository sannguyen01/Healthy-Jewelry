/**
 * **Every image variant a page can ask for, requested one at a time before any test runs.**
 *
 * ## What this answers
 *
 * On Next 16.3.8, CI's E2E job failed the same twelve phone tests on three of four runs and
 * passed on the fourth, with the runtime code identical across all four. Every one of them
 * stalled at `waitForLoadState('networkidle')` on a page that shows the two real collection
 * photographs, `charms.jpg` and `earrings.jpg`. On one run the diagnostic in `networkQuiet.ts`
 * asked the server for the stuck `/_next/image` URLs with an independent HTTP client and got no
 * answer in six seconds, while `/robots.txt` answered in 0.0s. The failure never reproduced on a
 * developer machine, and 16.3.5, the release before it, was green on every run.
 *
 * What the evidence supports is narrow: **the production server sometimes never answers a
 * first-time optimisation of a photograph, and once it has not answered, it does not answer
 * again for the rest of the run** (the retry of each test fails identically, because Next's
 * response cache de-duplicates concurrent requests for one variant onto a single pending
 * promise). It does not say why. The cause is not in the code path that changed between 16.3.5
 * and 16.3.8 for local images: `fetchInternalImage` and `sharp` are byte-identical.
 *
 * ## What this does about it
 *
 * Before the suite starts, ask the server for every variant of every image the pages reference,
 * **serially**, twice:
 * - a cold pass, so no test ever triggers an optimisation, and none runs beside another one;
 * - a warm pass, so the cached path is proven to answer too.
 *
 * Both passes have a per-request ceiling. A variant the server does not answer inside it fails
 * *setup*, in about twenty seconds, naming the URL and the pass, rather than twelve tests
 * running to their 30s timeout twice over (7.3 minutes in the last failed run) with nothing in
 * the report to say which request was stuck.
 *
 * ## What it does not claim
 *
 * This is a mitigation with a diagnostic attached, not a root cause. If the suite is green with
 * it, that is evidence that the trigger is a cold or concurrent optimisation. It is not proof,
 * and it is not a measurement of Vercel, which runs its own image service in front of
 * `/_next/image`. If the primer itself fails, that is the first direct measurement of the
 * server's hang, and the failing URL is what to take upstream. Remove it when a Next release
 * fixes the hang and a few runs without it are green.
 *
 * The decision is a pure function on a string, and the wait is bounded, so both are tested
 * apart from a browser (`src/tests/unit/image-primer.test.ts`), against a stub server that
 * really does hang.
 */

/** What Chromium sends for an image, so a primed variant is the one a browser is later served. */
export const CHROMIUM_IMAGE_ACCEPT = 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'

/** A variant the server has not answered in this long is wedged, not slow: the slowest ones took under 2s. */
export const DEFAULT_VARIANT_TIMEOUT_MS = 20_000

/** A hang costs the full ceiling, so stop after a few rather than pay it for every variant. */
export const DEFAULT_MAX_FAILURES = 3

const IMAGE_URL = /\/_next\/image\?[^\s"'<>\\,]+/g

/**
 * Every `/_next/image` URL in a page's HTML, as absolute URLs, in first-seen order.
 *
 * It reads the whole document rather than `<img>` attributes, so `srcset` candidates, the
 * preloads in `<head>` and the copies the framework embeds in its own payload are all found.
 * Those escape `&` as `&amp;` in markup and as `&` inside the payload; both are undone first.
 */
export function imageVariantUrls(html: string, origin: string): string[] {
  const text = html.replace(/\\u0026/g, '&').replace(/&amp;/g, '&')
  const urls = new Set<string>()
  for (const raw of text.match(IMAGE_URL) ?? []) {
    try {
      const url = new URL(raw, origin)
      if (url.pathname === '/_next/image' && url.searchParams.has('url') && url.searchParams.has('w')) {
        urls.add(url.href)
      }
    } catch {
      // Not a URL after all (a fragment of a template string in the payload). Nothing to ask for.
    }
  }
  return [...urls]
}

export interface PrimeOptions {
  origin: string
  /** Paths to read for image references. A path that answers non-200 is reported, not fatal. */
  pages: readonly string[]
  timeoutMs?: number
  maxFailures?: number
  log?: (line: string) => void
}

export interface PrimeResult {
  pages: number
  variants: number
  coldMs: number
  warmMs: number
  slowest: { url: string; ms: number } | null
}

interface Answer {
  ok: boolean
  verdict: string
  ms: number
}

/** The path and query, which is what identifies a variant in a message. */
const short = (url: string): string => url.replace(/^https?:\/\/[^/]+/, '')

async function ask(url: string, timeoutMs: number): Promise<Answer> {
  const started = Date.now()
  const elapsed = () => Date.now() - started
  try {
    const response = await fetch(url, {
      headers: { accept: CHROMIUM_IMAGE_ACCEPT },
      signal: AbortSignal.timeout(timeoutMs),
    })
    // The body counts: a response that starts and never ends stalls `networkidle` just as well.
    const bytes = (await response.arrayBuffer()).byteLength
    const type = response.headers.get('content-type') ?? ''
    if (response.status !== 200) return { ok: false, verdict: `HTTP ${response.status}`, ms: elapsed() }
    if (!type.startsWith('image/') || bytes === 0) {
      return { ok: false, verdict: `HTTP 200 but ${bytes} bytes of "${type || 'no content-type'}"`, ms: elapsed() }
    }
    return { ok: true, verdict: `200 ${bytes} bytes`, ms: elapsed() }
  } catch (error) {
    const aborted = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')
    return {
      ok: false,
      verdict: aborted ? `NO ANSWER within ${timeoutMs / 1000}s` : `request failed: ${String(error)}`,
      ms: elapsed(),
    }
  }
}

export class ImagePrimerError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ImagePrimerError'
  }
}

export async function primeImageVariants(options: PrimeOptions): Promise<PrimeResult> {
  const { origin, pages, timeoutMs = DEFAULT_VARIANT_TIMEOUT_MS, maxFailures = DEFAULT_MAX_FAILURES } = options
  const log = options.log ?? (() => {})

  const urls = new Set<string>()
  let pagesRead = 0
  for (const path of pages) {
    let response: Response
    try {
      response = await fetch(new URL(path, origin), { signal: AbortSignal.timeout(timeoutMs) })
    } catch (error) {
      // The server is not there at all, or not answering a page: nothing after this means anything.
      throw new ImagePrimerError(`image primer: ${origin}${path} did not answer (${String(error)}).`)
    }
    if (response.status !== 200) {
      log(`image primer: ${path} answered ${response.status}, skipped`)
      continue
    }
    pagesRead++
    for (const url of imageVariantUrls(await response.text(), origin)) urls.add(url)
  }

  const variants = [...urls]
  const timings: Array<{ url: string; ms: number }> = []

  const pass = async (name: 'cold' | 'warm'): Promise<number> => {
    const failures: string[] = []
    const started = Date.now()
    for (const url of variants) {
      const answer = await ask(url, timeoutMs)
      timings.push({ url, ms: answer.ms })
      if (!answer.ok) {
        failures.push(`  ${answer.verdict} (${(answer.ms / 1000).toFixed(1)}s)  ${short(url)}`)
        if (failures.length >= maxFailures) break
      }
    }
    if (failures.length > 0) {
      throw new ImagePrimerError(
        [
          `image primer: the server did not serve ${failures.length}${failures.length >= maxFailures ? '+' : ''} of ` +
            `${variants.length} image variants on its ${name} pass (${origin}, ${pagesRead} pages read).`,
          ...failures,
          name === 'cold'
            ? 'A first request for a variant was never answered. Without this check, each test that loads a page showing it stalls at networkidle, and its retry stalls the same way.'
            : 'A variant that answered once did not answer from the cache. A test that loads a page showing it would stall at networkidle.',
        ].join('\n')
      )
    }
    return Date.now() - started
  }

  const coldMs = await pass('cold')
  const warmMs = await pass('warm')
  const slowest = timings.reduce<{ url: string; ms: number } | null>(
    (worst, t) => (!worst || t.ms > worst.ms ? t : worst),
    null
  )
  log(
    `image primer: ${variants.length} variants from ${pagesRead} pages; cold ${(coldMs / 1000).toFixed(1)}s, ` +
      `warm ${(warmMs / 1000).toFixed(1)}s` +
      (slowest ? `; slowest ${slowest.ms}ms ${short(slowest.url)}` : '')
  )
  return { pages: pagesRead, variants: variants.length, coldMs, warmMs, slowest }
}
