import { describe, expect, it } from 'vitest'
import { coverVisibleRect, visibleFraction } from '@/lib/layout/coverCrop'

/**
 * The arithmetic ADR 054's subject floor stands on: what part of a source image is visible after
 * `object-fit: cover` with a given `object-position`. The figures are the ones measured while
 * planning the change, from the hero photograph's own dimensions.
 */
const HERO = { w: 1376, h: 768 }
const full = { x0: 0, y0: 0, x1: 1, y1: 1 }

describe('coverVisibleRect', () => {
  it('shows a quarter of the width of the hero photograph on a 390x844 phone, and all of its height', () => {
    const r = coverVisibleRect(HERO, { w: 390, h: 844 }, { x: 0.5, y: 0.5 })
    expect(r.x1 - r.x0).toBeCloseTo(0.2579, 3)
    expect(r.y0).toBeCloseTo(0, 6)
    expect(r.y1).toBeCloseTo(1, 6)
    expect(r.x0).toBeCloseTo((1 - 0.2579) * 0.5, 3)
  })

  it('matches the measured fractions at the other phone and tablet sizes', () => {
    const width = (w: number, h: number) => {
      const r = coverVisibleRect(HERO, { w, h }, { x: 0.5, y: 0.5 })
      return r.x1 - r.x0
    }
    expect(width(320, 568)).toBeCloseTo(0.3144, 3)
    expect(width(375, 667)).toBeCloseTo(0.3138, 3)
    expect(width(430, 932)).toBeCloseTo(0.2579, 3)
    expect(width(768, 1024)).toBeCloseTo(0.4187, 3)
    expect(width(1440, 900)).toBeCloseTo(0.8934, 3)
  })

  it('moves the window with the focal point and clamps it to the image', () => {
    const left = coverVisibleRect(HERO, { w: 390, h: 844 }, { x: 0, y: 0.5 })
    const right = coverVisibleRect(HERO, { w: 390, h: 844 }, { x: 1, y: 0.5 })
    expect(left.x0).toBe(0)
    expect(right.x1).toBeCloseTo(1, 9)
    const outside = coverVisibleRect(HERO, { w: 390, h: 844 }, { x: 4, y: -2 })
    expect(outside.x1).toBeCloseTo(1, 9)
    expect(outside.y0).toBe(0)
  })

  it('crops the height instead when the box is wider than the image', () => {
    const r = coverVisibleRect(HERO, { w: 1600, h: 500 }, { x: 0.5, y: 0 })
    expect(r.x0).toBe(0)
    expect(r.x1).toBeCloseTo(1, 9)
    expect(r.y0).toBe(0)
    expect(r.y1).toBeCloseTo(0.5599, 3)
  })

  it('shows the whole image when the box has the image\'s own aspect ratio', () => {
    const r = coverVisibleRect(HERO, { w: 688, h: 384 }, { x: 0.3, y: 0.7 })
    expect(r).toEqual({ x0: 0, y0: 0, x1: 1, y1: 1 })
  })

  it('refuses a degenerate image or box rather than returning a plausible rectangle', () => {
    expect(() => coverVisibleRect({ w: 0, h: 768 }, { w: 390, h: 844 }, { x: 0.5, y: 0.5 })).toThrow(RangeError)
    expect(() => coverVisibleRect(HERO, { w: 390, h: -1 }, { x: 0.5, y: 0.5 })).toThrow(RangeError)
    expect(() => coverVisibleRect(HERO, { w: Number.NaN, h: 844 }, { x: 0.5, y: 0.5 })).toThrow(RangeError)
  })
})

describe('visibleFraction', () => {
  const subject = { x0: 0.62, y0: 0.04, x1: 0.84, y1: 0.36 }

  it('is 1 when the subject lies inside the visible window', () => {
    expect(visibleFraction(subject, full)).toBe(1)
    expect(visibleFraction(subject, { x0: 0.55, y0: 0, x1: 0.9, y1: 1 })).toBe(1)
  })

  it('is 0 when the window and the subject are disjoint', () => {
    expect(visibleFraction(subject, { x0: 0, y0: 0, x1: 0.5, y1: 1 })).toBe(0)
  })

  it('is exact for a partial overlap', () => {
    const half = { x0: 0.73, y0: 0, x1: 1, y1: 1 } // keeps the right half of the subject's width
    expect(visibleFraction(subject, half)).toBeCloseTo(0.5, 9)
  })

  it('refuses a subject with no area, since "how much of nothing is visible" has no answer', () => {
    expect(() => visibleFraction({ x0: 0.5, y0: 0.5, x1: 0.5, y1: 0.6 }, full)).toThrow(RangeError)
  })

  it('puts the hero subject fully inside the 390x844 window at the phone focal point', () => {
    const phone = coverVisibleRect(HERO, { w: 390, h: 844 }, { x: 0.8, y: 0.4 })
    expect(visibleFraction(subject, phone)).toBeGreaterThanOrEqual(0.9)
  })
})
