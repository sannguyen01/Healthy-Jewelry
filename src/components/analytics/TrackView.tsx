'use client'

import { useEffect, useRef } from 'react'
import { track, type AnalyticsEvent } from '@/lib/analytics'

/**
 * Fires one event when a server-rendered page mounts.
 *
 * `/shop/[collection]` and `/search` are Server Components, and `track()` needs a
 * browser — it reads the consent choice from `localStorage` and posts a beacon.
 * This is the smallest possible client boundary for that: it renders nothing, and
 * the page above it stays a Server Component.
 *
 * The ref guards React 18's development double-invoke of effects, which would
 * otherwise report every page view twice in local development and quietly teach
 * everyone that the numbers are roughly double. A metric people mentally halve is
 * a metric nobody trusts.
 */
export function TrackView({ event }: { event: AnalyticsEvent }) {
  const fired = useRef(false)

  useEffect(() => {
    if (fired.current) return
    fired.current = true
    track(event)
    // Intentionally mount-only: this reports "the page was viewed", which happens
    // once. Re-running on an `event` identity change would report a second view
    // for a re-render that the customer never saw as a navigation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return null
}

export default TrackView
