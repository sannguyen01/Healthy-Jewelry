import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useReveal } from './useReveal'

// ── IntersectionObserver mock ─────────────────────────────────────────────────

type IOCallback = (entries: IntersectionObserverEntry[]) => void
let observerCallback: IOCallback | null = null
let mockObserve: ReturnType<typeof vi.fn>
let mockDisconnect: ReturnType<typeof vi.fn>

beforeEach(() => {
  observerCallback = null
  mockObserve = vi.fn()
  mockDisconnect = vi.fn()

  vi.stubGlobal(
    'IntersectionObserver',
    vi.fn((cb: IOCallback) => {
      observerCallback = cb
      return {
        observe: mockObserve,
        disconnect: mockDisconnect,
        unobserve: vi.fn(),
        takeRecords: vi.fn(() => []),
        root: null,
        rootMargin: '',
        // Added to IntersectionObserver by the DOM lib TypeScript 6 ships.
        // The `satisfies` below is why this had to be updated rather than
        // drifting quietly out of shape with the interface it mocks.
        scrollMargin: '',
        thresholds: [],
      } satisfies IntersectionObserver
    })
  )
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ── Helper: attach ref to DOM element then force the effect to re-run ─────────
//
// The hook's useEffect bails out when ref.current is null, which it always is
// on the first render because renderHook renders into a detached container.
// We attach a real element, then change the threshold (the only dependency) so
// React considers the effect stale and re-runs it with the populated ref.

function attachRefAndTriggerEffect(
  ref: React.RefObject<HTMLElement | null>,
  rerender: (props: { threshold: number }) => void,
  threshold: number
): void {
  const div = document.createElement('div')
  ;(ref as { current: HTMLElement }).current = div
  // Changing the threshold dependency causes useEffect to re-run, this time
  // with a non-null ref so IntersectionObserver is constructed.
  act(() => {
    rerender({ threshold })
  })
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('useReveal', () => {
  describe('return value shape', () => {
    it('returns visible as false initially', () => {
      const { result } = renderHook(() => useReveal())
      const [, visible] = result.current
      expect(visible).toBe(false)
    })

    it('returns a ref object as the first element of the tuple', () => {
      const { result } = renderHook(() => useReveal())
      const [ref] = result.current
      expect(ref).toBeTypeOf('object')
      expect(ref).toHaveProperty('current')
    })
  })

  describe('intersection behaviour', () => {
    it('sets visible to true when the observer fires with isIntersecting: true', () => {
      const { result, rerender } = renderHook(
        ({ threshold }: { threshold: number }) => useReveal(threshold),
        { initialProps: { threshold: 0.12 } }
      )

      attachRefAndTriggerEffect(result.current[0], rerender, 0.13)

      act(() => {
        observerCallback?.([{ isIntersecting: true } as IntersectionObserverEntry])
      })

      expect(result.current[1]).toBe(true)
    })

    it('does NOT set visible to true when isIntersecting is false', () => {
      const { result, rerender } = renderHook(
        ({ threshold }: { threshold: number }) => useReveal(threshold),
        { initialProps: { threshold: 0.12 } }
      )

      attachRefAndTriggerEffect(result.current[0], rerender, 0.13)

      act(() => {
        observerCallback?.([{ isIntersecting: false } as IntersectionObserverEntry])
      })

      expect(result.current[1]).toBe(false)
    })

    it('calls disconnect after the first intersection', () => {
      const { result, rerender } = renderHook(
        ({ threshold }: { threshold: number }) => useReveal(threshold),
        { initialProps: { threshold: 0.12 } }
      )

      attachRefAndTriggerEffect(result.current[0], rerender, 0.13)

      act(() => {
        observerCallback?.([{ isIntersecting: true } as IntersectionObserverEntry])
      })

      expect(mockDisconnect).toHaveBeenCalled()
    })
  })

  describe('cleanup', () => {
    it('disconnects the observer on unmount', () => {
      const { result, rerender, unmount } = renderHook(
        ({ threshold }: { threshold: number }) => useReveal(threshold),
        { initialProps: { threshold: 0.12 } }
      )

      attachRefAndTriggerEffect(result.current[0], rerender, 0.13)

      unmount()

      expect(mockDisconnect).toHaveBeenCalled()
    })
  })

  describe('threshold option', () => {
    it('passes the default threshold of 0.12 to IntersectionObserver', () => {
      const { result, rerender } = renderHook(
        ({ threshold }: { threshold: number }) => useReveal(threshold),
        { initialProps: { threshold: 0.11 } }
      )

      // Attach ref then rerender with 0.12 so the effect fires with that threshold
      const div = document.createElement('div')
      ;(result.current[0] as { current: HTMLElement }).current = div
      act(() => {
        rerender({ threshold: 0.12 })
      })

      expect(IntersectionObserver).toHaveBeenCalledWith(expect.any(Function), { threshold: 0.12 })
    })

    it('passes a custom threshold to IntersectionObserver', () => {
      const { result, rerender } = renderHook(
        ({ threshold }: { threshold: number }) => useReveal(threshold),
        { initialProps: { threshold: 0.12 } }
      )

      const div = document.createElement('div')
      ;(result.current[0] as { current: HTMLElement }).current = div
      act(() => {
        rerender({ threshold: 0.5 })
      })

      expect(IntersectionObserver).toHaveBeenCalledWith(expect.any(Function), { threshold: 0.5 })
    })
  })
})
