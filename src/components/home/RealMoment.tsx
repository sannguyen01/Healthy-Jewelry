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
        padding: 'clamp(96px, 12vw, 160px) var(--space-gutter, clamp(20px,4vw,64px))',
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
              fontWeight: 300,
              fontSize: 'var(--text-lg)',
              color: 'var(--graphite)',
              lineHeight: 1.6,
            }}
          >
            A digital continuation of a street-first relationship. We started with real people and real materials, building trust through direct encounters before ever writing a line of code.
          </p>
        </div>
        <div
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
            alt="The street-first brand in action"
            fill
            style={{ objectFit: 'cover' }}
          />
          <div style={{
            position: 'absolute',
            bottom: '-24px',
            left: '-24px',
            padding: '32px 40px',
            backgroundColor: 'rgba(255, 255, 255, 0.2)',
            backdropFilter: 'blur(16px)',
            border: '1px solid rgba(255, 255, 255, 0.3)',
            color: 'var(--ink)'
          }}>
            <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.75rem', letterSpacing: '0.25em', textTransform: 'uppercase', fontWeight: 500 }}>
              No Compromise
            </span>
          </div>
        </div>
      </div>
      <style>{`
        @media (max-width: 900px) {
          .hj-real-moment-inner {
            flex-direction: column !important;
            align-items: flex-start !important;
          }
        }
      `}</style>
    </section>
  )
}
