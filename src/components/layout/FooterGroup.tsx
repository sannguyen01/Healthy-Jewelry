'use client'

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'

const DESKTOP_QUERY = '(min-width: 769px)'

interface FooterGroupProps {
  title: string
  headStyle: CSSProperties
  children: ReactNode
}

/**
 * One footer link group as a native disclosure.
 *
 * Rendered `open`, so the server HTML — and a visitor without JavaScript — gets every link at
 * every width. After mount it collapses below 769px and is held open above it, where the
 * summary is inert (no tab stop, no toggle) because a heading that does nothing should not
 * be a control. `<details>/<summary>` gives the keyboard and assistive-technology behaviour
 * for free; the previous hidden-checkbox accordion had none of it (masterplan W2).
 */
export function FooterGroup({ title, headStyle, children }: FooterGroupProps) {
  const ref = useRef<HTMLDetailsElement>(null)
  const [desktop, setDesktop] = useState(true)

  useEffect(() => {
    const query = window.matchMedia?.(DESKTOP_QUERY)
    if (!query) return
    const sync = () => {
      setDesktop(query.matches)
      if (ref.current) ref.current.open = query.matches
    }
    sync()
    query.addEventListener('change', sync)
    return () => query.removeEventListener('change', sync)
  }, [])

  return (
    <details ref={ref} open className="footer-group">
      <summary
        className="footer-summary"
        style={headStyle}
        tabIndex={desktop ? -1 : 0}
        onClick={(event) => {
          if (desktop) event.preventDefault()
        }}
      >
        {title}
        <span className="footer-icon" aria-hidden="true">
          +
        </span>
      </summary>
      <div className="footer-group-inner">{children}</div>
    </details>
  )
}

export default FooterGroup
