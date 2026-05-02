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
      {/* Section eyebrow + headline */}
      <div
        style={{
          maxWidth: '1200px',
          margin: '0 auto 48px',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '20px',
            marginBottom: '24px',
          }}
        >
          <span className="label-eyebrow">Materials</span>
          <div
            style={{
              flex: 1,
              height: '1px',
              backgroundColor: 'var(--ash)',
            }}
          />
        </div>
        <h2
          style={{
            fontFamily: 'var(--font-serif)',
            fontStyle: 'italic',
            fontSize: 'var(--text-2xl, clamp(1.8rem, 3.5vw, 2.8rem))',
            color: 'var(--ink)',
            margin: 0,
            lineHeight: 1.15,
          }}
        >
          Built from the inside out.
        </h2>
      </div>

      {/* Material cards */}
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
            {/* Ordinal */}
            <p
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: '3rem',
                color: 'var(--ash)',
                lineHeight: 1,
                margin: '0 0 16px',
                letterSpacing: '0.02em',
              }}
              aria-hidden="true"
            >
              {ordinals[i]}
            </p>

            {/* Material title */}
            <h3
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: '1.2rem',
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                color: 'var(--ink)',
                margin: '0 0 6px',
              }}
            >
              {material.title}
            </h3>

            {/* Subtitle */}
            <p
              style={{
                fontFamily: 'var(--font-ui)',
                fontSize: 'var(--text-xs, 0.7rem)',
                letterSpacing: '0.18em',
                textTransform: 'uppercase',
                color: 'var(--titanium)',
                margin: '0 0 16px',
              }}
            >
              {material.subtitle}
            </p>

            {/* Body */}
            <p
              style={{
                fontFamily: 'var(--font-body)',
                fontWeight: 300,
                fontSize: 'var(--text-sm, 0.85rem)',
                color: 'var(--graphite)',
                lineHeight: 1.7,
                margin: '0 0 20px',
              }}
            >
              {material.body}
            </p>

            {/* Properties list */}
            <ul
              style={{
                listStyle: 'none',
                padding: 0,
                margin: 0,
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
              }}
            >
              {material.properties.map((prop) => (
                <li
                  key={prop}
                  style={{
                    fontFamily: 'var(--font-ui)',
                    fontSize: 'var(--text-xs, 0.7rem)',
                    letterSpacing: '0.1em',
                    color: 'var(--graphite)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                  }}
                >
                  <span style={{ color: 'var(--titanium)' }}>·</span>
                  {prop}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <style>{`
        @media (max-width: 768px) {
          .hj-materials-row {
            flex-direction: column !important;
          }
        }
      `}</style>
    </section>
  )
}

export default MaterialsSection
