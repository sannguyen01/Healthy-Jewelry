import Image from 'next/image'
import { hjMaterials } from '@/lib/data/hj-data'

const ordinals = ['01', '02', '03']

export function MaterialsSection() {
  return (
    <section
      style={{
        backgroundColor: 'var(--bg)',
        padding: 'clamp(64px, 8vw, 96px) var(--space-gutter, clamp(20px,4vw,64px))',
      }}
    >
      <div
        className="hj-materials-intro"
        style={{
          maxWidth: '1200px',
          margin: '0 auto 48px',
          display: 'flex',
          alignItems: 'flex-end',
          gap: 'clamp(24px, 4vw, 48px)',
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '20px',
              marginBottom: '24px',
            }}
          >
            <span className="label-eyebrow">Materials</span>
            <div style={{ flex: 1, height: '1px', backgroundColor: 'var(--ash)' }} />
          </div>
          <h2
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 'var(--text-2xl)',
              fontWeight: 500,
              textTransform: 'uppercase',
              color: 'var(--ink)',
              margin: 0,
              lineHeight: 1.1,
              letterSpacing: '0.02em',
            }}
          >
            Built from the inside out.
          </h2>
        </div>

        <div
          className="hj-materials-photo"
          style={{
            position: 'relative',
            width: '200px',
            aspectRatio: '3 / 4',
            flexShrink: 0,
            overflow: 'hidden',
          }}
        >
          <Image
            src="/images/lifestyle/philosophy-waterproof.jpg"
            alt="Titanium jewelry worn in water, showing waterproof, non-corrosion material integrity"
            fill
            sizes="200px"
            style={{ objectFit: 'cover' }}
          />
        </div>
      </div>

      <div
        className="hj-materials-row"
        style={{
          maxWidth: '1200px',
          margin: '0 auto',
          display: 'flex',
          flexDirection: 'row',
          gap: 'clamp(24px, 3vw, 48px)',
        }}
      >
        {hjMaterials.map((material, i) => (
          <div
            key={material.handle}
            style={{
              flex: 1,
              minWidth: 0,
              paddingTop: '28px',
              borderTop: '1px solid var(--ash)',
            }}
          >
            <p
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: '3rem',
                fontWeight: 400,
                color: 'var(--ash-text)',
                lineHeight: 1,
                margin: '0 0 16px',
                letterSpacing: '0.02em',
              }}
              aria-hidden="true"
            >
              {ordinals[i]}
            </p>

            <h3
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: '1.2rem',
                fontWeight: 500,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                color: 'var(--ink)',
                margin: '0 0 6px',
              }}
            >
              {material.title}
            </h3>

            <p
              style={{
                fontFamily: 'var(--font-ui)',
                fontSize: 'var(--text-xs)',
                letterSpacing: '0.18em',
                textTransform: 'uppercase',
                color: 'var(--titanium-text)',
                margin: '0 0 16px',
              }}
            >
              {material.subtitle}
            </p>

            <p
              style={{
                fontFamily: 'var(--font-body)',
                fontWeight: 300,
                fontSize: 'var(--text-sm)',
                color: 'var(--graphite)',
                lineHeight: 1.7,
                margin: '0 0 20px',
              }}
            >
              {material.body}
            </p>

            {/* Pill badges for properties */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {material.properties.map((prop) => (
                <span
                  key={prop}
                  style={{
                    display: 'inline-block',
                    padding: '4px 12px',
                    border: '1px solid var(--ash)',
                    fontFamily: 'var(--font-ui)',
                    fontSize: 'var(--text-xs)',
                    letterSpacing: '0.08em',
                    color: 'var(--graphite)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {prop}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>

      <style>{`
        @media (max-width: 768px) {
          .hj-materials-row {
            flex-direction: column !important;
          }
          .hj-materials-intro {
            flex-direction: column !important;
            align-items: flex-start !important;
          }
          .hj-materials-photo {
            width: 100% !important;
          }
        }
      `}</style>
    </section>
  )
}

export default MaterialsSection
