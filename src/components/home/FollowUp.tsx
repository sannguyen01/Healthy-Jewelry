'use client'

import Link from 'next/link'
import { useReveal } from '@/lib/hooks/useReveal'
import { SOCIAL_LINKS } from '@/config/site'

export function FollowUp() {
  const [sectionRef, visible] = useReveal(0.1)

  return (
    <section
      ref={sectionRef as React.RefObject<HTMLElement>}
      style={{
        backgroundColor: 'var(--bg)',
        padding: 'var(--space-section) var(--space-gutter)',
        borderTop: '1px solid var(--ash)',
        textAlign: 'center',
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(20px)',
        transition: 'opacity 0.7s var(--ease), transform 0.7s var(--ease)',
      }}
    >
      <div style={{ maxWidth: '600px', margin: '0 auto' }}>
        <h2 className="label-eyebrow" style={{ marginBottom: '24px' }}>
          Continue the encounter
        </h2>
        <div style={{ display: 'flex', gap: '24px', justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link
            href="/contact"
            style={{
              fontFamily: 'var(--font-ui)',
              fontSize: 'var(--text-xs)',
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              color: 'var(--ink)',
              padding: '12px 24px',
              border: '1px solid var(--ink)',
              transition: 'all 0.3s var(--ease)',
            }}
          >
            Contact Us
          </Link>
          <Link
            href={SOCIAL_LINKS.instagram}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              fontFamily: 'var(--font-ui)',
              fontSize: 'var(--text-xs)',
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              color: 'var(--ink)',
              padding: '12px 24px',
              border: '1px solid transparent',
              transition: 'all 0.3s var(--ease)',
            }}
          >
            Instagram
          </Link>
        </div>
      </div>
    </section>
  )
}
