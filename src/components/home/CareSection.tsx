'use client'

import { useReveal } from '@/lib/hooks/useReveal'

/**
 * `body` is resolved from the claims registry by the server page, so this client component never
 * imports the registry. It renders the approved wording, or the registry's neutral fallback until a
 * named reviewer approves the claim.
 */
export function CareSection({ body }: { body: string }) {
  const [sectionRef, visible] = useReveal(0.1)

  return (
    <section
      ref={sectionRef as React.RefObject<HTMLElement>}
      style={{
        backgroundColor: 'var(--graphite)',
        color: 'var(--bg)',
        padding: 'clamp(120px, 15vw, 200px) var(--space-gutter, clamp(20px,4vw,64px))',
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(20px)',
        transition:
          'opacity 0.7s cubic-bezier(0.2, 0.8, 0.2, 1), transform 0.7s cubic-bezier(0.2, 0.8, 0.2, 1)',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          opacity: 0.04,
          pointerEvents: 'none',
          width: '100%',
          textAlign: 'center',
        }}
      >
        <span
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'clamp(150px, 30vw, 400px)',
            fontWeight: 500,
            letterSpacing: '-0.05em',
            whiteSpace: 'nowrap',
            lineHeight: 1,
          }}
        >
          316L Ti Nb
        </span>
      </div>
      <div
        style={{
          maxWidth: '800px',
          margin: '0 auto',
          position: 'relative',
          zIndex: 1,
          textAlign: 'center',
        }}
      >
        <h2
          className="label-eyebrow"
          style={{ color: 'rgba(247,245,241,0.5)', marginBottom: '40px' }}
        >
          Care & Craft
        </h2>
        <h3
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'clamp(36px, 5vw, 64px)',
            fontWeight: 400,
            textTransform: 'none',
            marginBottom: '40px',
            lineHeight: 1.1,
            letterSpacing: '-0.02em',
          }}
        >
          Grade 23 titanium. Anodized niobium.
        </h3>
        <p
          style={{
            fontFamily: 'var(--font-body)',
            fontWeight: 300,
            fontSize: 'clamp(18px, 2vw, 24px)',
            color: 'rgba(247,245,241,0.8)',
            lineHeight: 1.6,
            maxWidth: '600px',
            margin: '0 auto',
          }}
        >
          {body}
        </p>
      </div>
    </section>
  )
}
