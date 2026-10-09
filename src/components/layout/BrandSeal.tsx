import { BRAND_MARK_SRC, SITE_NAME } from '@/config/site'

/**
 * The knot mark and the name, stacked and large, as the Care band's seal (ADR 051).
 *
 * Not a link and not a second lockup: the header and the footer are the site's two links home,
 * and a third would be a third place to keep the name, the label and the mark in step. This is
 * the same mark and the same name, drawn once at 132 CSS px on the page's one dark ground.
 *
 * - **Decorative.** The section it sits in names itself; a screen reader reading "Healthy Jewellery"
 *   again, between a paragraph and a button, would be noise. `aria-hidden` on the wrapper, and the
 *   image's `alt` is empty for the same reason `BrandLockup`'s is.
 * - **A plain `<img>`, lossless, for the reason `BrandLockup` gives** (ADR 048): the image optimiser's
 *   lossy re-encode leaves alpha where the mark is clear, and on `--ink` that is a visible haze.
 *   1x is the 132px copy, 2x is the 264px one (`BRAND_MARK_SRC.seal`).
 * - **Lazy.** It sits mid-page; nothing about it is needed to paint the first screen.
 * - **`data-brand-mark`**, so the generic checks that hold the header's and the footer's marks to
 *   "decoded, has a box, visible, transparent" hold this one too (`e2e/visual-assets.spec.ts`).
 * - The name takes its face from `.hj-lockup-text`, the one rule that sets the brand face;
 *   the seal sets only its size, weight and colour (`.hj-seal` in `globals.css`).
 */
const SEAL_PX = 132

export function BrandSeal() {
  return (
    <div className="hj-seal" aria-hidden="true">
      {/* eslint-disable-next-line @next/next/no-img-element -- lossless on purpose: see above. */}
      <img
        src={BRAND_MARK_SRC.seal[0]}
        srcSet={BRAND_MARK_SRC.seal.map((src, i) => `${src} ${i + 1}x`).join(', ')}
        alt=""
        width={SEAL_PX}
        height={SEAL_PX}
        loading="lazy"
        decoding="async"
        className="hj-seal-mark"
        data-brand-mark=""
      />
      <span className="hj-lockup-text">{SITE_NAME}</span>
    </div>
  )
}

export default BrandSeal
