import Link from 'next/link'
import type { CSSProperties, MouseEventHandler } from 'react'
import { BRAND_MARK_SRC, SITE_NAME } from '@/config/site'

/**
 * The knot mark and the name, as one link home. Used by the header (`inline`) and the footer
 * (`stacked`), so the two cannot disagree about the name, the label or the mark.
 *
 * - The mark is `alt=""` on purpose: the link's `aria-label` already names the destination,
 *   and an image alt would make a screen reader say the brand twice. The visible name sits
 *   inside the label ("Healthy Jewellery — home"), which is what WCAG 2.5.3 asks of a
 *   control whose name differs from its text.
 * - Its size lives in CSS (`.hj-lockup-mark` in `globals.css`), because the header changes it
 *   at two breakpoints. `width`/`height` give the intrinsic box (no layout shift).
 * - **A plain `<img>`, not next/image, so the background stays transparent.** next/image
 *   re-encodes through the image optimiser, lossily, and lossy alpha is not transparency: its
 *   AVIF gave half the pixels that should be clear an alpha of up to 19/255, a faint haze round
 *   the knot. Browsers were spared it only because `images.formats` lists WebP first. These are
 *   lossless PNGs at 1x, 2x and 3x of the variant's largest size (`BRAND_MARK_SRC`, 2–23 KB),
 *   derived pixel-for-pixel from the master, so the mark is clear exactly where the master is
 *   and no format setting can change that (ADR 048). A DPR-3 phone still gets a 3x raster.
 * - In the header the name is the part that gives way. Below the breakpoint in `globals.css` it
 *   is not rendered at all and the mark carries the brand alone: ADR 016's rule, "the brand
 *   gives, the controls never do", taken one step further than an ellipsis. A cut-off name
 *   ("HEALTHY JEWEL…") is worse than no name, because it reads as a defect rather than a choice.
 */
export interface BrandLockupProps {
  variant: 'inline' | 'stacked'
  className?: string
  style?: CSSProperties
  onClick?: MouseEventHandler<HTMLAnchorElement>
  /** Above-the-fold copies load at once; the footer's waits until it is near the viewport. */
  eager?: boolean
}

/** The largest CSS size each variant renders the mark at, in px. Mirrors `globals.css`. */
const MARK_BOX = { inline: 30, stacked: 44 } as const


export function BrandLockup({ variant, className, style, onClick, eager = false }: BrandLockupProps) {
  return (
    <Link
      href="/"
      aria-label={`${SITE_NAME} — home`}
      className={className ? `hj-lockup ${className}` : 'hj-lockup'}
      data-variant={variant}
      style={style}
      onClick={onClick}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- lossless on purpose: see above. */}
      <img
        src={BRAND_MARK_SRC[variant][0]}
        srcSet={BRAND_MARK_SRC[variant].map((src, i) => `${src} ${i + 1}x`).join(', ')}
        alt=""
        width={MARK_BOX[variant]}
        height={MARK_BOX[variant]}
        loading={eager ? 'eager' : 'lazy'}
        decoding="async"
        className="hj-lockup-mark"
        data-brand-mark=""
      />
      <span className="hj-lockup-text">{SITE_NAME}</span>
    </Link>
  )
}

export default BrandLockup
