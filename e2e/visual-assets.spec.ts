import { test, expect, type Page } from '@playwright/test'

/**
 * Visual-asset visibility.
 *
 * The homepage regression that motivated this spec was not a missing asset.
 * Every file was present, every request returned 200, and every element was in
 * the DOM — the collection tiles were simply rendered at `opacity: 0.12` over
 * near-white `--bg`, so the artwork shipped and was invisible. Presence
 * assertions cannot catch that class of bug. These can.
 *
 * Three things are checked, because a photo needs all three to be seen:
 *   1. the bytes arrive          → response status < 400 and naturalWidth > 0
 *   2. the element occupies space → non-zero bounding box
 *   3. the pixels are legible     → effective opacity above a floor
 *
 * "Effective" opacity is the product of the element's own opacity and every
 * ancestor's, because the ghost-tile bug lived on a *parent* node, not on the
 * image itself.
 */

/**
 * Below this, artwork over `--bg` (#F7F5F1) reads as a smudge rather than an
 * image. The ghost tiles shipped at 0.12; the deliberate placeholder treatment
 * is 0.45. 0.30 sits between them, so it catches a regression toward invisible
 * without forbidding intentionally soft treatments.
 */
const MIN_EFFECTIVE_OPACITY = 0.3

/** Requests we consider "imagery" — static files plus the Next image optimiser. */
const IMAGE_REQUEST = /\.(jpe?g|png|webp|avif|gif|svg)(\?|$)|\/_next\/image/i

interface ImageProbe {
  src: string
  alt: string
  naturalWidth: number
  width: number
  height: number
  effectiveOpacity: number
  visibility: string
}

/**
 * Loads the homepage and scrolls it end to end so lazy-loaded imagery below the
 * fold is actually fetched, then reports every `<img>` plus every failed image
 * request. Returns probes rather than asserting, so each test can make its own
 * single-purpose assertion with a readable failure message.
 */
async function probeHomepage(page: Page): Promise<{
  images: ImageProbe[]
  placeholderTiles: Array<{ width: number; height: number; effectiveOpacity: number }>
  failedRequests: Array<{ url: string; status: number }>
}> {
  const failedRequests: Array<{ url: string; status: number }> = []
  page.on('response', (response) => {
    if (IMAGE_REQUEST.test(response.url()) && response.status() >= 400) {
      failedRequests.push({ url: response.url(), status: response.status() })
    }
  })

  await page.goto('/')
  await expect(page.locator('main')).toBeVisible()

  // Trigger the lazy-loaded imagery by walking each element into view, rather
  // than scrubbing the page with a scripted scroll. A fast scripted scroll
  // outruns Chromium's lazy-load bookkeeping: it commits to a `srcset`
  // candidate before layout has settled, picks the widest one, then never
  // issues that request — leaving `currentSrc` pointing at a URL that was never
  // fetched and the element stuck at `complete: false` forever. That is a
  // harness artefact, not a site defect, and it would report as a false
  // "broken asset" here.
  const imageCount = await page.locator('img').count()
  for (let index = 0; index < imageCount; index += 1) {
    await page.locator('img').nth(index).scrollIntoViewIfNeeded()
  }
  await page.evaluate(() => window.scrollTo(0, 0))

  await page.waitForLoadState('networkidle')
  // `networkidle` only means the bytes arrived. `next/image` serves AVIF/WebP
  // that the browser still has to decode, and an image mid-decode reports
  // naturalWidth 0 — indistinguishable from a broken source. Waiting for decode
  // stops a slow encode masquerading as a missing asset. Failures are not
  // thrown here: the per-image assertions below name the offending asset, which
  // a bare timeout would not.
  await page
    .waitForFunction(() => [...document.images].every((image) => image.complete), null, {
      timeout: 20_000,
    })
    .catch(() => undefined)

  const { images, placeholderTiles } = await page.evaluate((): {
    images: ImageProbe[]
    placeholderTiles: Array<{ width: number; height: number; effectiveOpacity: number }>
  } => {
    const effectiveOpacity = (start: Element): number => {
      let opacity = 1
      let node: Element | null = start
      while (node) {
        const value = Number.parseFloat(getComputedStyle(node).opacity)
        if (!Number.isNaN(value)) opacity *= value
        node = node.parentElement
      }
      return Number(opacity.toFixed(3))
    }

    const images = [...document.querySelectorAll('img')].map((el) => {
      const box = el.getBoundingClientRect()
      return {
        src: el.currentSrc || el.src,
        alt: el.alt,
        naturalWidth: el.naturalWidth,
        width: Math.round(box.width),
        height: Math.round(box.height),
        effectiveOpacity: effectiveOpacity(el),
        visibility: getComputedStyle(el).visibility,
      }
    })

    // Collections without photography fall back to an inline JewelrySVG. Those
    // are the exact nodes that shipped as ghosts.
    const placeholderTiles = [...document.querySelectorAll('.hj-coll-tile svg')].map((el) => {
      const box = el.getBoundingClientRect()
      return {
        width: Math.round(box.width),
        height: Math.round(box.height),
        effectiveOpacity: effectiveOpacity(el),
      }
    })

    return { images, placeholderTiles }
  })

  return { images, placeholderTiles, failedRequests }
}

const describeImage = (image: ImageProbe): string =>
  `${image.src} (alt="${image.alt}")`

test.describe('Homepage visual assets', () => {
  test('every image request succeeds', async ({ page }) => {
    const { failedRequests } = await probeHomepage(page)
    expect(
      failedRequests,
      `Image requests that failed:\n${failedRequests
        .map((r) => `  [${r.status}] ${r.url}`)
        .join('\n')}`
    ).toEqual([])
  })

  test('the homepage actually renders imagery', async ({ page }) => {
    const { images } = await probeHomepage(page)
    // Guards the whole file: if the markup stops producing <img> elements, the
    // assertions below would all pass vacuously.
    expect(images.length).toBeGreaterThan(0)
  })

  test('every image resolves to real pixel data', async ({ page }) => {
    const { images } = await probeHomepage(page)
    const broken = images.filter((image) => image.naturalWidth === 0)
    expect(
      broken,
      `Images whose source never decoded (naturalWidth === 0):\n${broken.map(describeImage).join('\n')}`
    ).toEqual([])
  })

  test('every image occupies a non-zero box', async ({ page }) => {
    const { images } = await probeHomepage(page)
    const collapsed = images.filter((image) => image.width === 0 || image.height === 0)
    expect(
      collapsed,
      `Images laid out at zero size:\n${collapsed
        .map((image) => `  ${describeImage(image)} → ${image.width}x${image.height}`)
        .join('\n')}`
    ).toEqual([])
  })

  test('every image is above the legibility opacity floor', async ({ page }) => {
    const { images } = await probeHomepage(page)
    const faded = images.filter(
      (image) => image.effectiveOpacity < MIN_EFFECTIVE_OPACITY || image.visibility === 'hidden'
    )
    expect(
      faded,
      `Images rendered too faint to see (floor ${MIN_EFFECTIVE_OPACITY}):\n${faded
        .map((image) => `  ${describeImage(image)} → opacity ${image.effectiveOpacity}`)
        .join('\n')}`
    ).toEqual([])
  })

  test('collection placeholder tiles are legible, not ghosts', async ({ page }) => {
    const { placeholderTiles } = await probeHomepage(page)
    // Collections without photography still have to read as artwork.
    expect(placeholderTiles.length).toBeGreaterThan(0)
    const ghosts = placeholderTiles.filter(
      (tile) => tile.effectiveOpacity < MIN_EFFECTIVE_OPACITY || tile.width === 0 || tile.height === 0
    )
    expect(
      ghosts,
      `Placeholder tiles rendered as ghosts:\n${ghosts
        .map((tile) => `  ${tile.width}x${tile.height} at opacity ${tile.effectiveOpacity}`)
        .join('\n')}`
    ).toEqual([])
  })
})

test.describe('Collection row layout', () => {
  /** Distinct `top` offsets among the collection tiles = number of rendered rows. */
  async function tileRows(page: Page): Promise<{ tiles: number; rows: number }> {
    return page.evaluate(() => {
      const tiles = [...document.querySelectorAll('.hj-coll-tile')]
      const tops = tiles.map((tile) => Math.round(tile.getBoundingClientRect().top))
      return { tiles: tiles.length, rows: new Set(tops).size }
    })
  }

  // Viewports are set explicitly rather than inherited from the project, so the
  // breakpoint under test is unambiguous in both the chromium and mobile runs.
  test('all collections sit on a single row at desktop width', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/')
    await expect(page.locator('.hj-coll-tile').first()).toBeVisible()

    const { tiles, rows } = await tileRows(page)
    expect(tiles).toBeGreaterThan(0)
    // The original bug: a fixed 4-column grid orphaned the 5th collection onto
    // its own row. This fails the moment a new collection outgrows the layout.
    expect(rows, `${tiles} collection tiles wrapped onto ${rows} rows at 1440px`).toBe(1)
  })

  test('collections stack one per row at mobile width', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/')
    await expect(page.locator('.hj-coll-tile').first()).toBeVisible()

    const { tiles, rows } = await tileRows(page)
    expect(rows).toBe(tiles)
  })

  test('collection tiles are evenly sized at desktop width', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/')
    await expect(page.locator('.hj-coll-tile').first()).toBeVisible()

    const widths = await page.evaluate(() =>
      [...document.querySelectorAll('.hj-coll-tile')].map((tile) =>
        Math.round(tile.getBoundingClientRect().width)
      )
    )
    // A tile reading as "oversized" next to its neighbours was half the original
    // report; flex-grow should hand every tile the same width.
    expect(Math.max(...widths) - Math.min(...widths)).toBeLessThanOrEqual(2)
  })
})

/**
 * Product imagery, both ways round.
 *
 * The storefront could not show a product photograph at all until recently — no
 * image field in the GraphQL fragment, none on `HJProduct`, and `<JewelrySVG>`
 * hardcoded at every one of the five surfaces. Not as a fallback: as the only
 * option. Every product now goes through `<ProductImage>`, which draws the
 * photograph when Shopify has one and the illustration when it does not.
 *
 * Against `mock.myshopify.com` the suite always takes the illustration branch, so
 * what is provable here is that **every product surface renders *something*
 * visible** — the property that actually broke when the collection tiles shipped
 * at `opacity: 0.12`. Whether a real photo reaches the page is a question about
 * the live store, and `verify-production.mjs` asks it there.
 */
test.describe('Product imagery is visible on every surface', () => {
  /**
   * Effective opacity of the first product mark inside a container, walking every
   * ancestor — the ghost-tile bug lived on a parent node, not on the artwork.
   */
  async function markVisibility(page: Page, containerSelector: string) {
    return page.evaluate((selector) => {
      const root = document.querySelector(selector)
      const mark = root?.querySelector('img, svg')
      if (!mark) return null

      const box = mark.getBoundingClientRect()
      let opacity = 1
      let node: Element | null = mark
      while (node) {
        opacity *= parseFloat(getComputedStyle(node).opacity || '1')
        node = node.parentElement
      }
      return { tag: mark.tagName.toLowerCase(), width: box.width, height: box.height, opacity }
    }, containerSelector)
  }

  const SURFACES = [
    { name: 'product card on /shop', url: '/shop', selector: '.card-tile' },
    { name: 'homepage strip card', url: '/', selector: '.card-tile' },
    {
      name: 'product detail page',
      url: '/products/arc-band-titanium',
      selector: '.card-tile',
    },
  ]

  for (const surface of SURFACES) {
    test(`${surface.name} renders a visible product mark`, async ({ page }) => {
      await page.goto(surface.url)
      const container = page.locator(surface.selector).first()

      // Scroll it in, then *poll* the effective opacity rather than asserting it
      // once. `useReveal` starts its section at `opacity: 0` and transitions to 1
      // over 0.7s on intersection — and the animating node is an ancestor of the
      // card, so waiting on the card's own opacity proves nothing (it is 1 the
      // whole time, inside a parent that is 0). Measuring once after `goto` reads
      // a real zero and reports a completely false alarm.
      await container.scrollIntoViewIfNeeded()
      await container.waitFor({ state: 'visible' })

      await expect
        .poll(async () => (await markVisibility(page, surface.selector))?.opacity ?? 0, {
          message: `product mark on ${surface.url} never reached a legible opacity`,
        })
        .toBeGreaterThanOrEqual(MIN_EFFECTIVE_OPACITY)

      const mark = await markVisibility(page, surface.selector)

      expect(mark, `no <img> or <svg> inside ${surface.selector} on ${surface.url}`).not.toBeNull()
      // Presence is not visibility, and visibility is not legibility — the two
      // lessons this whole spec exists for, applied to the new surface.
      expect(mark!.width).toBeGreaterThan(0)
      expect(mark!.height).toBeGreaterThan(0)
    })
  }

  test('the cart thumbnail renders a visible mark too', async ({ page }) => {
    // The cart is the one surface where an invisible thumbnail would be seen by a
    // customer who has already decided to buy.
    await page.goto('/products/arc-band-titanium')
    // Arc Band is a ring: Add to Bag stays disabled until a size is chosen, and
    // the accessible name is "Add — <price> to Bag", so an anchored /add to bag/
    // never matches it. Same two steps every other spec takes.
    await page.getByRole('button', { name: /ring size 7/i }).click()
    await page.getByRole('button', { name: /add.*to bag/i }).click()

    const drawer = page.getByRole('dialog', { name: /shopping bag/i })
    await expect(drawer).toBeVisible()

    const mark = drawer.locator('img, svg').first()
    await expect(mark).toBeVisible()
    const box = await mark.boundingBox()
    expect(box?.width ?? 0).toBeGreaterThan(0)
  })

  /**
   * A gallery of one is a row of one button that changes nothing — visual noise
   * that reads as broken. With no Shopify media in the test environment there is
   * never more than one image, so the thumbnail strip must be absent entirely.
   */
  test('no thumbnail strip is rendered when there is only one image', async ({ page }) => {
    await page.goto('/products/arc-band-titanium')
    await expect(page.getByRole('group', { name: /product images/i })).toHaveCount(0)
  })
})
