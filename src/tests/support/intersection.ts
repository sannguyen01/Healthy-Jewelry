import { vi } from 'vitest'

/**
 * A stand-in for `IntersectionObserver` that does what a test needs of one: remembers the callback it was given and lets
 * the test deliver entries to it, and exposes `observe` and `disconnect` as spies. jsdom has none, and the header's state
 * (ADR 054) follows the hero's end marker, so two files drive it by hand and should not each keep a copy of the class.
 * Undo it with `vi.unstubAllGlobals()`.
 */
export type IntersectionEntry = Pick<IntersectionObserverEntry, 'isIntersecting' | 'boundingClientRect' | 'rootBounds'>

/** One entry: whether the target is in view, where its top edge is, and where the root's is (`null` = the viewport). */
export const intersectionEntry = (isIntersecting: boolean, top: number, rootTop: number | null = 0): IntersectionEntry => ({
  isIntersecting,
  boundingClientRect: { top } as DOMRectReadOnly,
  rootBounds: rootTop === null ? null : ({ top: rootTop } as DOMRectReadOnly),
})

export function stubIntersectionObserver() {
  const observe = vi.fn()
  const disconnect = vi.fn()
  let callback: ((entries: IntersectionEntry[]) => void) | undefined
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(cb: (entries: IntersectionEntry[]) => void) {
        callback = cb
      }
      observe = observe
      disconnect = disconnect
    }
  )
  return {
    observe,
    disconnect,
    /** Deliver entries as the browser would; does nothing if no observer was made. */
    fire: (...entries: IntersectionEntry[]) => callback?.(entries),
  }
}
