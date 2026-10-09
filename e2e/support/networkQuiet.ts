import type { Page } from '@playwright/test'

/**
 * **`networkidle`, with the culprit named when it never arrives.**
 *
 * On the round-6 CI run, thirteen mobile tests failed with the same words — "Test timeout of
 * 30000ms exceeded ... waitForLoadState('networkidle')" — and nothing in the log said what the
 * page was still waiting for. The failure could not be reproduced on a developer machine, and
 * the Playwright trace that would answer it was behind a download the environment cannot make.
 * A timeout that does not say what it is waiting for costs a CI round per guess.
 *
 * So the wait is the same wait (it still fails if the page never goes quiet, and every assertion
 * after it is untouched), but it is capped below the test's own limit and, on a miss, reports
 * what the page itself knows: its `readyState`, the images that have not finished, the font
 * faces still loading, and every request that started while we waited and has not finished.
 * Any one of those names the stuck resource.
 */

/** Below the 30s default test timeout, so the failure is this message and not a bare timeout. */
const DEFAULT_CAP_MS = 12_000

/** Per independent re-request. Cap plus this stays under the 30s default test timeout. */
const PROBE_MS = 6_000

export async function networkQuiet(page: Page, capMs: number = DEFAULT_CAP_MS): Promise<void> {
  const inFlight = new Map<object, { url: string; type: string; since: number }>()
  const started = (request: import('@playwright/test').Request) =>
    inFlight.set(request, { url: request.url(), type: request.resourceType(), since: Date.now() })
  const finished = (request: import('@playwright/test').Request) => inFlight.delete(request)
  page.on('request', started)
  page.on('requestfinished', finished)
  page.on('requestfailed', finished)

  try {
    await page.waitForLoadState('networkidle', { timeout: capMs })
  } catch (error) {
    const known = await page
      .evaluate(() => ({
        readyState: document.readyState,
        images: [...document.images]
          .filter((img) => !img.complete)
          .map((img) => `${img.loading} ${img.currentSrc || img.src}`.slice(0, 160)),
        // The same images, as bare URLs, to ask the server about. A request that started before
        // this wait began is not in `inFlight` below (the map only sees what starts after it), and
        // the run of 4806efc listed two unfinished images here with nothing in flight to re-ask.
        imageUrls: [...document.images]
          .filter((img) => !img.complete && (img.currentSrc || img.src))
          .map((img) => img.currentSrc || img.src),
        fonts: [...document.fonts]
          .filter((face) => face.status === 'loading')
          .map((face) => face.family),
      }))
      .catch(() => ({
        readyState: 'page not readable',
        images: [] as string[],
        imageUrls: [] as string[],
        fonts: [] as string[],
      }))
    // Is the server wedged for everyone, or only for this browser? Ask it again, independently
    // (Playwright's own HTTP client: no browser cache, no connection reuse, no abort from a closed
    // page) for each unfinished request and for a trivial route, while the server is still up.
    // A timeout here means the server never answers that URL at all; a 200 means it was this
    // page's request that stalled.
    const probe = async (url: string): Promise<string> => {
      const started = Date.now()
      try {
        const response = await page.request.get(url, {
          timeout: PROBE_MS,
          headers: { accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8' },
        })
        return `${response.status()} in ${((Date.now() - started) / 1000).toFixed(1)}s`
      } catch {
        return `NO ANSWER within ${PROBE_MS / 1000}s`
      }
    }
    const origin = new URL(page.url()).origin
    const stuck = [
      ...new Set([
        ...[...inFlight.values()].filter((r) => r.type === 'image').map((r) => r.url),
        ...known.imageUrls,
      ]),
    ].slice(0, 4)
    const reasked = await Promise.all([
      ...stuck.map(
        async (url) =>
          `${url.replace(/^https?:\/\/[^/]+/, '').slice(0, 110)} → ${await probe(url)}`
      ),
      probe(`${origin}/robots.txt`).then((verdict) => `server liveness /robots.txt → ${verdict}`),
    ])
    const pending = [...inFlight.values()].map(
      (r) =>
        `${r.type} ${r.url.replace(/^https?:\/\/[^/]+/, '').slice(0, 140)} (${Math.round((Date.now() - r.since) / 1000)}s)`
    )
    throw new Error(
      [
        `${page.url()} did not go network-quiet within ${capMs / 1000}s.`,
        `readyState: ${known.readyState}`,
        `images not finished (${known.images.length}): ${known.images.slice(0, 6).join(' | ') || 'none'}`,
        `fonts still loading: ${known.fonts.join(', ') || 'none'}`,
        `requests started during the wait and unfinished (${pending.length}): ${pending.slice(0, 8).join(' | ') || 'none'}`,
        `independent re-request of each unfinished image, and of a trivial route:\n  ${reasked.join('\n  ')}`,
        `(original: ${error instanceof Error ? error.message.split('\n')[0] : String(error)})`,
      ].join('\n')
    )
  } finally {
    page.off('request', started)
    page.off('requestfinished', finished)
    page.off('requestfailed', finished)
  }
}
