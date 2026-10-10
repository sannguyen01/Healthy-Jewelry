/**
 * What part of a source image is visible after `object-fit: cover` with an `object-position`.
 *
 * ADR 054 replaces "at least half of the source frame is visible" (ADR 021) with "the record's
 * subject box is at least 90% visible, and none of it lies under the copy". Half the frame cannot hold
 * for a viewport-filling phone hero: a 1376×768 photograph shows 25.8% of its width at 390×844. What
 * has to survive the crop is the subject, so the question needs this arithmetic, shared by the
 * unit tests and by the browser tests that check it against the boxes the browser actually drew.
 *
 * Everything is normalised to the source: 0 is its top-left, 1 its bottom-right.
 */

export type Rect = { x0: number; y0: number; x1: number; y1: number }

const clamp01 = (n: number): number => Math.min(1, Math.max(0, n))

function assertPositive(name: string, size: { w: number; h: number }): void {
  if (!Number.isFinite(size.w) || !Number.isFinite(size.h) || size.w <= 0 || size.h <= 0) {
    throw new RangeError(`${name} must have a finite, positive width and height (got ${size.w}×${size.h})`)
  }
}

/**
 * The region of the source that a `box` of the given size shows when the image covers it and is
 * positioned at `focal` (`object-position: <x*100>% <y*100>%`).
 *
 * CSS aligns the point `p` of the image with the point `p` of the box, so the visible window starts
 * at `(1 - visible) * p` of the source. A focal point outside 0–1 is clamped: the browser would
 * let the image drift off the box, and a record cannot ask for that.
 */
export function coverVisibleRect(
  img: { w: number; h: number },
  box: { w: number; h: number },
  focal: { x: number; y: number },
): Rect {
  assertPositive('image', img)
  assertPositive('box', box)

  const scale = Math.max(box.w / img.w, box.h / img.h)
  const visibleW = Math.min(1, box.w / (img.w * scale))
  const visibleH = Math.min(1, box.h / (img.h * scale))
  const x0 = (1 - visibleW) * clamp01(focal.x)
  const y0 = (1 - visibleH) * clamp01(focal.y)

  return { x0, y0, x1: x0 + visibleW, y1: y0 + visibleH }
}

/**
 * The share of `subject`'s area that lies inside `visible`, from 0 to 1.
 *
 * A subject with no area has no answer ("how much of nothing is visible"), so it throws rather than
 * returning a number a test would read as success.
 */
export function visibleFraction(subject: Rect, visible: Rect): number {
  const subjectArea = (subject.x1 - subject.x0) * (subject.y1 - subject.y0)
  if (!(subjectArea > 0)) {
    throw new RangeError('a subject box must have positive width and height')
  }
  const w = Math.min(subject.x1, visible.x1) - Math.max(subject.x0, visible.x0)
  const h = Math.min(subject.y1, visible.y1) - Math.max(subject.y0, visible.y0)
  if (w <= 0 || h <= 0) return 0
  return Math.min(1, (w * h) / subjectArea)
}
