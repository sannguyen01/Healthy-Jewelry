'use client'

import Link from 'next/link'
import { useReveal } from '@/lib/hooks/useReveal'
import { SOCIAL_LINKS } from '@/config/site'

export function FollowUp() {
  const [sectionRef, visible] = useReveal(0.1)

  return (
    <section
      ref={sectionRef as React.RefObject<HTMLElement>}
      className="hj-band"
      data-last=""
      style={{
        textAlign: 'center',
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(20px)',
        transition: 'opacity var(--duration-slow) var(--ease), transform var(--duration-slow) var(--ease)',
      }}
    >
      <h2 className="label-eyebrow" style={{ marginBottom: '28px' }}>
        Continue the encounter
      </h2>
      <div style={{ display: 'flex', gap: '16px', justifyContent: 'center', flexWrap: 'wrap' }}>
        <Link href="/contact" className="btn-ghost">
          Contact Us
        </Link>
        <Link href={SOCIAL_LINKS.instagram} target="_blank" rel="noopener noreferrer" className="hj-tap">
          <span>Instagram</span>
        </Link>
      </div>
    </section>
  )
}

export default FollowUp
