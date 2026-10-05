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
const DEFAULT_CAP_MS = 20_000

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
        fonts: [...document.fonts]
          .filter((face) => face.status === 'loading')
          .map((face) => face.family),
      }))
      .catch(() => ({
        readyState: 'page not readable',
        images: [] as string[],
        fonts: [] as string[],
      }))
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
        `(original: ${error instanceof Error ? error.message.split('\n')[0] : String(error)})`,
      ].join('\n')
    )
  } finally {
    page.off('request', started)
    page.off('requestfinished', finished)
    page.off('requestfailed', finished)
  }
}
