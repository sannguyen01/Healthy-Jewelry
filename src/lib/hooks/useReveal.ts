'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * Scroll-reveal that fails open.
 *
 * `visible` starts **true**, so the server-rendered HTML — and a visitor with JavaScript
 * disabled, or one whose script never loads — shows every section. Only after mount, and only
 * for a section that is below the fold, is it hidden and then revealed on intersection. A
 * visitor who prefers reduced motion never has anything hidden.
 *
 * It used to start false: with no JavaScript, or no IntersectionObserver firing, the care,
 * moment and follow-up sections stayed at opacity 0 for good (masterplan W4).
 */
export function useReveal(threshold = 0.12) {
  const ref = useRef<HTMLElement>(null)
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (typeof IntersectionObserver === 'undefined') return
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    if (el.getBoundingClientRect().top < window.innerHeight) return

    setVisible(false)
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true)
          obs.disconnect()
        }
      },
      { threshold }
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [threshold])

  return [ref, visible] as const
}
