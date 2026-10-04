'use client'

import Image from 'next/image'
import { useReveal } from '@/lib/hooks/useReveal'

export function RealMoment() {
  const [sectionRef, visible] = useReveal(0.1)

  return (
    <section
      ref={sectionRef as React.RefObject<HTMLElement>}
      className="hj-real-moment"
      style={{
        backgroundColor: 'var(--bg)',
        borderBottom: '1px solid var(--ash)',
        padding: 'var(--space-section-lg) var(--space-gutter)',
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(20px)',
        transition: 'opacity 0.7s cubic-bezier(0.2, 0.8, 0.2, 1), transform 0.7s cubic-bezier(0.2, 0.8, 0.2, 1)',
        position: 'relative',
        overflow: 'hidden'
      }}
    >
      <div className="hj-real-moment-inner" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'clamp(40px, 6vw, 80px)', maxWidth: '1400px', margin: '0 auto' }}>
        <div style={{ flex: '1 1 40%', maxWidth: '500px', zIndex: 2 }}>
          <h2 className="label-eyebrow" style={{ marginBottom: '40px' }}>The Moment</h2>
          <p
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 400,
              fontSize: 'clamp(32px, 4vw, 48px)',
              color: 'var(--ink)',
              lineHeight: 1.1,
              letterSpacing: '-0.02em',
              marginBottom: '32px'
            }}
          >
            Born on the streets.<br />Crafted for the skin.
          </p>
          <p
            style={{
              fontFamily: 'var(--font-body)',
              fontWeight: 400,
              fontSize: 'var(--text-lg)',
              color: 'var(--graphite)',
              lineHeight: 1.6,
            }}
          >
            A digital continuation of a street-first relationship.
          </p>
        </div>
        <div
          className="hj-real-moment-media"
          style={{
            flex: '1 1 60%',
            position: 'relative',
            aspectRatio: '4/5',
            maxWidth: '600px',
            transform: 'translateY(40px)',
          }}
        >
          <Image
            src="/images/lifestyle/hero-banner.jpg"
            alt=""
            fill
            sizes="(max-width: 900px) 100vw, 600px"
            style={{ objectFit: 'cover' }}
          />
        </div>
      </div>
      <style>{`
        @media (max-width: 900px) {
          .hj-real-moment-inner {
            flex-direction: column !important;
            align-items: flex-start !important;
          }
          /* A fill image has no intrinsic width, so in a column flex container with
             align-items: flex-start its box collapsed to 0x0 on phones. */
          .hj-real-moment-media {
            width: 100%;
            flex: 0 0 auto !important;
          }
        }
      `}</style>
    </section>
  )
}
