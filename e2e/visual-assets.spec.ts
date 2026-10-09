import { test, expect, type Page } from './support/test'
import { networkQuiet } from './support/networkQuiet'

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
 * Below this, artwork over `--bg` reads as a smudge rather than an
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
  /** Where a knot mark sits (`img[data-brand-mark]`), or null for every other image. */
  brandMark: 'header' | 'footer' | 'seal' | 'elsewhere' | null
}

/**
 * Loads the homepage and scrolls it end to end so lazy-loaded imagery below the
 * fold is actually fetched, then reports every `<img>` plus every failed image
 * request. Returns probes rather than asserting, so each test can make its own
 * single-purpose assertion with a readable failure message.
 */
async function probeHomepage(page: Page): Promise<{
  images: ImageProbe[]
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

  await networkQuiet(page)
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

  // Sections reveal on scroll: `RealMoment` shows its photograph at opacity 0 and eases it to
  // 1 over 0.7s once its IntersectionObserver fires, and the hero copy does the same. Sampling
  // before that transition ends reads an in-flight value, which on a loaded machine is under the
  // floor — a race in the sample, not a faint image (seen 2026-10-04: the w=1200 hero reading
  // opacity 0 when this ran beside other specs). So wait for every finite transition and
  // animation to finish; the assertion below still judges the settled value. A looping
  // animation is excluded, and the wait is capped so a stuck one still reaches the assertions.
  await page
    .waitForFunction(
      () =>
        document
          .getAnimations()
          .every(
            (animation) =>
              animation.playState !== 'running' ||
              animation.effect?.getComputedTiming().iterations === Infinity
          ),
      null,
      { timeout: 5_000 }
    )
    .catch(() => undefined)

  const { images } = await page.evaluate((): {
    images: ImageProbe[]
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
        brandMark: !el.hasAttribute('data-brand-mark')
          ? null
          : el.closest('header')
            ? ('header' as const)
            : el.closest('footer')
              ? ('footer' as const)
              : el.closest('.hj-seal')
                ? ('seal' as const)
                : ('elsewhere' as const),
      }
    })

    return { images }
  })

  return { images, failedRequests }
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

  test('the knot mark renders once in the header, once in the footer and once as the care band\'s seal', async ({ page }) => {
    // The generic checks above already hold every <img> to the three conditions, the marks
    // included. What they cannot see is a mark that is not there: zero brand marks pass all of
    // them. On 2026-10-04 the owner believed the logo was in the header and footer, and it was
    // in neither — the redesign had replaced it with a text wordmark and nothing noticed.
    const { images } = await probeHomepage(page)
    const marks = images.filter((image) => image.brandMark !== null)
    expect(marks.map((m) => m.brandMark).sort()).toEqual(['footer', 'header', 'seal'])
    for (const mark of marks) {
      expect(mark.naturalWidth, `${mark.brandMark} mark never decoded`).toBeGreaterThan(0)
      expect(mark.width * mark.height, `${mark.brandMark} mark has no box`).toBeGreaterThan(0)
      expect(mark.effectiveOpacity, `${mark.brandMark} mark too faint`).toBeGreaterThanOrEqual(MIN_EFFECTIVE_OPACITY)
      expect(mark.alt, 'decorative: the link around it carries the name').toBe('')
    }
  })

  test('the knot mark the browser draws has a transparent background, exactly', async ({ page }) => {
    // The owner's instruction (ADR 048). Read from the bytes the browser chose and decoded,
    // not from the file in the repository: the image optimiser re-encodes lossily, and its AVIF
    // left alpha up to 19/255 where the mark is clear. So the mark must arrive as one of the
    // lossless copies, and every pixel the lossless copy leaves clear must decode as clear.
    await page.goto('/')
    // The footer's copy and the seal's are lazy: neither is fetched, and `decode()` never settles,
    // until it is near.
    await page.locator('.hj-seal img[data-brand-mark]').scrollIntoViewIfNeeded()
    await page.locator('footer img[data-brand-mark]').scrollIntoViewIfNeeded()
    const report = await page.evaluate(async () => {
      const out = []
      for (const img of document.querySelectorAll<HTMLImageElement>('img[data-brand-mark]')) {
        await img.decode()
        const res = await fetch(img.currentSrc)
        const bmp = await createImageBitmap(await res.blob(), { premultiplyAlpha: 'none', colorSpaceConversion: 'none' })
        const canvas = new OffscreenCanvas(bmp.width, bmp.height)
        const ctx = canvas.getContext('2d') as OffscreenCanvasRenderingContext2D
        ctx.drawImage(bmp, 0, 0)
        const alpha = ctx.getImageData(0, 0, bmp.width, bmp.height).data.filter((_, i) => i % 4 === 3)
        const at = (x: number, y: number) => alpha[y * bmp.width + x]
        const last = bmp.width - 1
        out.push({
          where: img.closest('header') ? 'header' : img.closest('footer') ? 'footer' : 'seal',
          src: new URL(img.currentSrc).pathname,
          type: res.headers.get('content-type'),
          corners: [at(0, 0), at(last, 0), at(0, last), at(last, last)],
          clearShare: alpha.filter((a) => a === 0).length / alpha.length,
        })
      }
      return out
    })
    expect(report.map((r) => r.where).sort()).toEqual(['footer', 'header', 'seal'])
    for (const mark of report) {
      expect(mark.src, `${mark.where}: served through the lossy optimiser`).toMatch(/^\/brand\/knot-\d+\.png$/)
      expect(mark.type, mark.where).toBe('image/png')
      expect(mark.corners, `${mark.where}: corners`).toEqual([0, 0, 0, 0])
      expect(mark.clearShare, `${mark.where}: share of fully clear pixels`).toBeGreaterThan(0.3)
    }
  })
})

test.describe('Collection layout: two photographs and an index', () => {
  // Viewports are set explicitly rather than inherited from the project, so the breakpoint under
  // test is unambiguous in both the chromium and mobile runs.
  type Box = { x: number; y: number; width: number; height: number }

  async function layout(page: Page): Promise<{ tiles: Box[]; index: Box; links: string[] }> {
    return page.evaluate(() => {
      const box = (el: Element) => {
        const r = el.getBoundingClientRect()
        return { x: r.left, y: r.top + window.scrollY, width: r.width, height: r.height }
      }
      const index = document.querySelector('nav[aria-label="All collections"]') as Element
      return {
        tiles: [...document.querySelectorAll('.hj-coll-tile .hj-coll-photo')].map(box),
        index: box(index),
        links: [...index.querySelectorAll('a')].map((a) => a.getAttribute('href') ?? ''),
      }
    })
  }

  test('the index lists every collection, so none depends on having a photograph', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/')
    await expect(page.locator('.hj-coll-tile').first()).toBeVisible()

    const { links } = await layout(page)
    // The rows of the index are the whole catalogue of collections, in the site's own order. A sixth
    // collection is a sixth row; one without a photograph is a row and nothing else.
    expect(links).toEqual([
      '/shop/rings',
      '/shop/necklaces',
      '/shop/earrings',
      '/shop/bracelets',
      '/shop/charms',
    ])
  })

  test('two photographs sit side by side with the index beside them at desktop width', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/')
    await expect(page.locator('.hj-coll-tile').first()).toBeVisible()

    const { tiles, index } = await layout(page)
    expect(tiles, 'the photographed collections').toHaveLength(2)
    // Left to right, none overlapping: photograph, photograph, index.
    expect(tiles[0].x + tiles[0].width, 'photographs overlap').toBeLessThanOrEqual(tiles[1].x + 1)
    expect(tiles[1].x + tiles[1].width, 'a photograph runs into the index').toBeLessThanOrEqual(index.x + 1)
  })

  test('both photographs keep the 3:4 listing crop (ADR 044)', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/')
    await expect(page.locator('.hj-coll-tile').first()).toBeVisible()

    const { tiles } = await layout(page)
    for (const tile of tiles) {
      expect(tile.width / tile.height, `a collection photograph is ${tile.width}x${tile.height}`).toBeCloseTo(3 / 4, 1)
    }
  })

  test('the index drops below the photographs at mobile width', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/')
    await expect(page.locator('.hj-coll-tile').first()).toBeVisible()

    const { tiles, index } = await layout(page)
    expect(tiles).toHaveLength(2)
    for (const tile of tiles) {
      expect(index.y, 'the index starts above a photograph').toBeGreaterThanOrEqual(tile.y + tile.height - 1)
      expect(tile.x + tile.width, 'a photograph runs past the viewport').toBeLessThanOrEqual(390 + 1)
    }
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

  /*
   * 'the cart thumbnail renders a visible mark too' was here.
   *
   * It guarded the one surface where an invisible thumbnail would be seen by a customer
   * who had already decided to buy. There is no cart and no such customer, so the test is
   * removed rather than repointed: every other surface it would have covered — card,
   * strip, detail page — is already asserted above, by name, in this same file.
   */

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
