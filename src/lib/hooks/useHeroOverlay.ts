import { useEffect, useState } from 'react'

/**
 * Whether the header should overlay a hero, read from the hero's own end marker rather than from a distance
 * scrolled (ADR 054).
 *
 * The header read `scrollY > 60`, on every route. That was wrong twice. A page with no hero was transparent for
 * its first 60px, with its own content sliding under the bar. And a hero taller than 60px went solid while the
 * photograph was still under the bar, so the identity of the header changed in the middle of the picture.
 *
 * The marker is a zero-height element at the hero's bottom edge, a header's height up (`[data-hero-end]`,
 * rendered by `Hero`). When it leaves the *top* of the viewport the photograph has passed under the bar.
 */

/** What the hero renders at its end, a header's height above its bottom edge. */
export const HERO_END_SELECTOR = '[data-hero-end]'

/**
 * Has the hero's end marker *not yet* passed the top of the viewport?
 *
 * "Not intersecting" is not "passed". On a phone the hero is taller than the screen, so the marker starts
 * below the fold, not intersecting and nowhere near passed; a header that read the one as the other would
 * start solid with the photograph under it. The marker has passed only when it is above the top of the root.
 */
export function overlayFromEntry(e: { isIntersecting: boolean; top: number; rootTop: number }): boolean {
  return e.isIntersecting || e.top >= e.rootTop
}

/**
 * `true` while the header should lie over the hero.
 *
 * `enabled` is a fact the page knows and the server renders (`<Nav overHero />` on the home page and nowhere
 * else), so it is the first value: the server's first paint and the client's agree, and there is no flash.
 * A page that asked for a hero and has no marker is solid, which is the safe state: a bar with its own ground
 * is legible over anything. Where `IntersectionObserver` does not exist the header stays an overlay rather
 * than throwing.
 */
export function useHeroOverlay(enabled: boolean): boolean {
  const [overlay, setOverlay] = useState(enabled)

  useEffect(() => {
    if (!enabled) {
      setOverlay(false)
      return
    }
    const marker = document.querySelector(HERO_END_SELECTOR)
    if (!marker) {
      setOverlay(false)
      return
    }
    if (typeof IntersectionObserver === 'undefined') {
      setOverlay(true)
      return
    }

    const observer = new IntersectionObserver((entries) => {
      // Several can arrive together; the last is the current state.
      const latest = entries[entries.length - 1]
      if (!latest) return
      setOverlay(
        overlayFromEntry({
          isIntersecting: latest.isIntersecting,
          top: latest.boundingClientRect.top,
          rootTop: latest.rootBounds?.top ?? 0,
        })
      )
    })
    observer.observe(marker)
    return () => observer.disconnect()
  }, [enabled])

  return overlay
}
