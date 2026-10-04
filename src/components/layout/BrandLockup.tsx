import Image from 'next/image'
import Link from 'next/link'
import type { CSSProperties, MouseEventHandler } from 'react'
import { BRAND_MARK_PATH, SITE_NAME } from '@/config/site'

/**
 * The knot mark and the name, as one link home. Used by the header (`inline`) and the footer
 * (`stacked`), so the two cannot disagree about the name, the label or the mark.
 *
 * - The mark is `alt=""` on purpose: the link's `aria-label` already names the destination,
 *   and an image alt would make a screen reader say the brand twice. The visible name sits
 *   inside the label ("Healthy Jewellery — home"), which is what WCAG 2.5.3 asks of a
 *   control whose name differs from its text.
 * - Its size lives in CSS (`.hj-lockup-mark` in `globals.css`), because the header changes it
 *   at two breakpoints. `width`/`height` give the intrinsic box (no layout shift); `sizes`
 *   states the rendered size per breakpoint, which is what makes next/image emit a full `w`
 *   srcset instead of only 1x/2x — without it a DPR-3 phone upscaled the 2x raster and blurred
 *   the edges the matte removal exists to keep clean.
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

/** The rendered size at each breakpoint, as `globals.css` sets it on `.hj-lockup-mark`. */
const MARK_SIZES = {
  inline: '(max-width: 359px) 30px, (max-width: 768px) 24px, 28px',
  stacked: '44px',
} as const

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
      <Image
        src={BRAND_MARK_PATH}
        alt=""
        width={MARK_BOX[variant]}
        height={MARK_BOX[variant]}
        sizes={MARK_SIZES[variant]}
        loading={eager ? 'eager' : 'lazy'}
        className="hj-lockup-mark"
        data-brand-mark=""
      />
      <span className="hj-lockup-text">{SITE_NAME}</span>
    </Link>
  )
}

export default BrandLockup
