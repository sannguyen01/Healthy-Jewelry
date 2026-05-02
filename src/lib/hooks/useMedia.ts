'use client'

import { useState, useEffect } from 'react'

/**
 * Subscribes to a CSS media query and returns whether it currently matches.
 * Returns false during SSR to avoid hydration mismatches.
 */
export function useMedia(query: string): boolean {
  const [matches, setMatches] = useState(false)

  useEffect(() => {
    const mediaQuery = window.matchMedia(query)
    // Set initial value
    setMatches(mediaQuery.matches)

    const handler = (event: MediaQueryListEvent) => {
      setMatches(event.matches)
    }

    mediaQuery.addEventListener('change', handler)
    return () => mediaQuery.removeEventListener('change', handler)
  }, [query])

  return matches
}

/**
 * Returns true when viewport width is ≤ 768px (mobile breakpoint).
 */
export function useIsMobile(): boolean {
  return useMedia('(max-width: 768px)')
}

/**
 * Returns true when viewport width is between 769px and 1024px (tablet breakpoint).
 */
export function useIsTablet(): boolean {
  return useMedia('(min-width: 769px) and (max-width: 1024px)')
}
