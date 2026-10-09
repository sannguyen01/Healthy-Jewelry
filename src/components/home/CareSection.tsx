'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'
import { useReveal } from '@/lib/hooks/useReveal'

/**
 * `body` is resolved from the claims registry by the server page, so this client component never
 * imports the registry. It renders the approved wording, or the registry's neutral fallback until a
 * named reviewer approves the claim. `seal` is the knot and the name, rendered by the server for the
 * same reason: this component needs neither the brand config nor an image of its own.
 *
 * The page's one dark band (ADR 040, ADR 051): `--ink`, with `--on-dark` and `--mist` for text, all
 * contrast-tested. The 316L Ti Nb watermark that sat behind the copy is gone; the seal is the
 * band's one ornament, and the brand's own.
 */
export function CareSection({ body, seal }: { body: string; seal: ReactNode }) {
  const [sectionRef, visible] = useReveal(0.1)

  return (
    <section
      ref={sectionRef as React.RefObject<HTMLElement>}
      className="hj-band"
      data-tone="dark"
      data-space="lg"
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(20px)',
        transition: 'opacity var(--duration-slow) var(--ease), transform var(--duration-slow) var(--ease)',
      }}
    >
      <div className="hj-grid hj-care-grid">
        <div className="hj-care-copy">
          {/* The band's heading is its name, as it was before the redesign (ADR 040): "Care & Craft"
              is what a screen-reader user finds it by, and the title under it is that heading's
              h3. The two are styled by class, not by tag, so which is which is a matter of the
              outline and not of the look. */}
          <h2 className="label-eyebrow" style={{ color: 'var(--mist)', margin: 0 }}>
            Care & Craft
          </h2>
          <h3 className="hj-h2">
            Grade 23 titanium.
            <br />
            Anodized niobium.
          </h3>
          <p className="hj-lede">{body}</p>
          <Link href="/stores" className="btn-ghost-dark">
            Ask an ambassador
          </Link>
        </div>

        <div className="hj-care-aside">{seal}</div>
      </div>
    </section>
  )
}

export default CareSection
