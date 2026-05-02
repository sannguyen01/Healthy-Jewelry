'use client'

import { useState, useEffect } from 'react'

/**
 * Returns true when window.scrollY exceeds the given threshold.
 * Defaults to 60px — matches Nav scroll-aware frosted glass transition.
 * Uses a passive scroll listener for maximum performance.
 */
export function useScrolled(threshold = 60): boolean {
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const handler = () => {
      setScrolled(window.scrollY > threshold)
    }
    // Run once on mount to handle pages that are pre-scrolled
    handler()
    window.addEventListener('scroll', handler, { passive: true })
    return () => window.removeEventListener('scroll', handler)
  }, [threshold])

  return scrolled
}
