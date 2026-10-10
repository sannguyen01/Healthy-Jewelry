import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { overlayFromEntry, useHeroOverlay } from '@/lib/hooks/useHeroOverlay'

/**
 * The header's state follows the hero it sits over, not a distance scrolled (ADR 054).
 *
 * "The hero's end marker is not on screen" is not the same as "the hero has passed": on a phone whose hero
 * is taller than the screen the marker starts *below* the fold, and a header that read "not intersecting" as
 * "passed" would start solid, with the photograph under it. So the question the hook answers is whether the
 * marker has gone out of the *top* of the viewport, and that is a pure function.
 */

describe('overlayFromEntry', () => {
  it('is an overlay while the marker is on screen', () => {
    expect(overlayFromEntry({ isIntersecting: true, top: 300, rootTop: 0 })).toBe(true)
  })

  it('is still an overlay when the marker is below the fold, because the hero has not passed', () => {
    expect(overlayFromEntry({ isIntersecting: false, top: 1200, rootTop: 0 })).toBe(true)
  })

  it('is solid once the marker has gone out of the top, because the photograph has passed under the bar', () => {
    expect(overlayFromEntry({ isIntersecting: false, top: -1, rootTop: 0 })).toBe(false)
    expect(overlayFromEntry({ isIntersecting: false, top: -800, rootTop: 0 })).toBe(false)
  })

  it('holds at the exact edge: a marker touching the top has not yet passed', () => {
    expect(overlayFromEntry({ isIntersecting: false, top: 0, rootTop: 0 })).toBe(true)
  })

  it('measures against the root, not against the page, when the root is offset', () => {
    expect(overlayFromEntry({ isIntersecting: false, top: 40, rootTop: 64 })).toBe(false)
    expect(overlayFromEntry({ isIntersecting: false, top: 70, rootTop: 64 })).toBe(true)
  })
})

type Entry = Pick<IntersectionObserverEntry, 'isIntersecting' | 'boundingClientRect' | 'rootBounds'>
const entry = (isIntersecting: boolean, top: number, rootTop: number | null = 0): Entry => ({
  isIntersecting,
  boundingClientRect: { top } as DOMRectReadOnly,
  rootBounds: rootTop === null ? null : ({ top: rootTop } as DOMRectReadOnly),
})

describe('useHeroOverlay', () => {
  let callback: ((entries: Entry[]) => void) | undefined
  const observe = vi.fn()
  const disconnect = vi.fn()

  beforeEach(() => {
    callback = undefined
    observe.mockClear()
    disconnect.mockClear()
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(cb: (entries: Entry[]) => void) {
          callback = cb
        }
        observe = observe
        disconnect = disconnect
      }
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    document.body.innerHTML = ''
  })

  const withSentinel = () => {
    document.body.innerHTML = '<div data-hero-end></div>'
  }

  it('is never an overlay on a page that does not ask for one, and observes nothing', () => {
    withSentinel()
    const { result } = renderHook(() => useHeroOverlay(false))
    expect(result.current).toBe(false)
    expect(observe).not.toHaveBeenCalled()
  })

  it('starts as an overlay for a page with a hero, so the server\'s first paint and the client\'s agree', () => {
    withSentinel()
    const { result } = renderHook(() => useHeroOverlay(true))
    expect(result.current).toBe(true)
    expect(observe).toHaveBeenCalledTimes(1)
  })

  it('is solid when the page asked for a hero and the marker is not there', () => {
    const { result } = renderHook(() => useHeroOverlay(true))
    expect(result.current).toBe(false)
    expect(observe).not.toHaveBeenCalled()
  })

  it('follows the marker out of the top of the screen and back', () => {
    withSentinel()
    const { result } = renderHook(() => useHeroOverlay(true))
    act(() => callback?.([entry(false, -50)]))
    expect(result.current).toBe(false)
    act(() => callback?.([entry(true, 10)]))
    expect(result.current).toBe(true)
  })

  it('does not turn solid for a marker below the fold, however long the hero', () => {
    withSentinel()
    const { result } = renderHook(() => useHeroOverlay(true))
    act(() => callback?.([entry(false, 2400)]))
    expect(result.current).toBe(true)
  })

  it('reads a viewport root as the top of the page when the browser reports none', () => {
    withSentinel()
    const { result } = renderHook(() => useHeroOverlay(true))
    act(() => callback?.([entry(false, -5, null)]))
    expect(result.current).toBe(false)
  })

  it('uses the latest entry when several arrive together', () => {
    withSentinel()
    const { result } = renderHook(() => useHeroOverlay(true))
    act(() => callback?.([entry(false, -100), entry(true, 20)]))
    expect(result.current).toBe(true)
  })

  it('stops observing on unmount', () => {
    withSentinel()
    const { unmount } = renderHook(() => useHeroOverlay(true))
    unmount()
    expect(disconnect).toHaveBeenCalledTimes(1)
  })

  it('stays an overlay, and does not throw, where IntersectionObserver does not exist', () => {
    vi.unstubAllGlobals()
    vi.stubGlobal('IntersectionObserver', undefined)
    withSentinel()
    const { result } = renderHook(() => useHeroOverlay(true))
    expect(result.current).toBe(true)
  })
})
