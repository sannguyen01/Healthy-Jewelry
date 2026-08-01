import type { Metadata } from 'next'
import Link from 'next/link'
import { Nav } from '@/components/layout/Nav'
import { Footer } from '@/components/layout/Footer'
import { CartDrawer } from '@/components/layout/CartDrawer'
import { hjMaterials } from '@/lib/data/hj-data'

export const metadata: Metadata = {
  title: 'Materials',
  description:
    'Grade 23 Titanium, Niobium, 316L Surgical Steel. The science of biocompatible jewelry metals — hypoallergenic, corrosion-proof, MRI-safe.',
}

const COMPARISON_ROWS = [
  { property: 'Hypoallergenic', titanium: 'Yes', niobium: 'Yes', steel: 'Yes' },
  { property: 'Corrosion resistance', titanium: 'Excellent', niobium: 'Excellent', steel: 'High' },
  { property: 'Weight', titanium: 'Lightweight', niobium: 'Medium', steel: 'Medium' },
  { property: 'MRI-safe', titanium: 'Yes', niobium: 'Yes', steel: 'Yes' },
  { property: 'Skin-safe', titanium: 'Yes', niobium: 'Yes', steel: 'Yes' },
] as const

const FAQ = [
  {
    q: 'Are these metals safe for sensitive skin?',
    a: 'Yes. All three metals — Grade 23 titanium, niobium, and 316L surgical steel — are used in medical implants and body-contact devices. They have negligible nickel content and do not leach ions that trigger contact dermatitis.',
  },
  {
    q: 'How do I care for implant-grade jewelry?',
    a: 'Rinse with mild soap and warm water. Pat dry. Avoid prolonged exposure to harsh chemicals such as bleach or strong solvents. Titanium and niobium are saltwater-safe; 316L steel handles occasional exposure well.',
  },
  {
    q: 'Is this jewelry MRI-safe?',
    a: 'Grade 23 titanium and niobium are non-ferromagnetic and MRI-safe. 316L surgical steel has very low magnetic susceptibility and is generally considered safe, but consult your radiologist for specific procedures.',
  },
  {
    q: 'What does "implant-grade" mean?',
    a: '"Implant-grade" refers to alloy specifications approved for surgical use: ASTM F136 for Grade 23 titanium, ASTM F2814 for niobium, and ASTM F138 for 316L surgical steel. These standards mandate purity levels and biocompatibility testing.',
  },
] as const

const MATERIAL_NUMBERS = ['01', '02', '03'] as const

export default function MaterialsPage() {
  return (
    <>
      <Nav />
      <CartDrawer />

      <main style={{ backgroundColor: 'var(--bg)', color: 'var(--ink)' }}>
        {/* ── Page header ───────────────────────────────────────────── */}
        <section
          style={{
            paddingTop: '120px',
            paddingBottom: 'clamp(56px, 7vw, 100px)',
            paddingLeft: 'clamp(24px, 6vw, 120px)',
            paddingRight: 'clamp(24px, 6vw, 120px)',
            maxWidth: '860px',
          }}
        >
          <p className="label-eyebrow" style={{ marginBottom: '24px' }}>
            The Materials
          </p>

          <h1
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 'var(--text-display)',
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              color: 'var(--ink)',
              margin: '0 0 28px',
              lineHeight: 1.05,
            }}
          >
            Not all metals are equal.
          </h1>

          <p
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: 'var(--text-lg)',
              color: 'var(--graphite)',
              lineHeight: 1.7,
              fontWeight: 300,
              maxWidth: '580px',
            }}
          >
            Biocompatibility is not a marketing claim — it is a material property. We use only
            metals that have been validated for long-term contact with human tissue.
          </p>
        </section>

        {/* ── Material detail cards ─────────────────────────────────── */}
        <section
          style={{
            padding: '0 clamp(24px, 6vw, 120px)',
            display: 'flex',
            flexDirection: 'column',
            gap: '2px',
          }}
        >
          {hjMaterials.map((material, index) => (
            <div
              key={material.handle}
              style={{
                backgroundColor: 'var(--nacre)',
                padding: 'clamp(36px, 5vw, 48px)',
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                gap: 'clamp(32px, 5vw, 64px)',
                alignItems: 'start',
              }}
            >
              {/* Left: number + title */}
              <div>
                <p
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: '5rem',
                    color: 'var(--ash)',
                    lineHeight: 1,
                    margin: '0 0 12px',
                    letterSpacing: '0.02em',
                  }}
                >
                  {MATERIAL_NUMBERS[index]}
                </p>

                <h2
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: 'var(--text-2xl)',
                    letterSpacing: '0.05em',
                    textTransform: 'uppercase',
                    color: 'var(--ink)',
                    margin: '0 0 8px',
                    lineHeight: 1.1,
                  }}
                >
                  {material.title}
                </h2>

                <p
                  style={{
                    fontFamily: 'var(--font-ui)',
                    fontSize: 'var(--text-xs)',
                    letterSpacing: '0.18em',
                    textTransform: 'uppercase',
                    color: 'var(--titanium-text)',
                    margin: 0,
                  }}
                >
                  {material.subtitle}
                </p>
              </div>

              {/* Right: body + properties + CTA */}
              <div>
                <p
                  style={{
                    fontFamily: 'var(--font-body)',
                    fontSize: 'var(--text-base)',
                    color: 'var(--graphite)',
                    lineHeight: 1.75,
                    fontWeight: 300,
                    margin: '0 0 28px',
                  }}
                >
                  {material.body}
                </p>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', margin: '0 0 32px' }}>
                  {material.properties.map((prop) => (
                    <span
                      key={prop}
                      className="material-tag"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        padding: '6px 14px',
                        border: '1px solid var(--ash)',
                        backgroundColor: 'var(--bg)',
                      }}
                    >
                      {prop}
                    </span>
                  ))}
                </div>

                <Link href={`/shop?material=${material.handle}`} className="btn-ghost">
                  Shop {material.title}
                </Link>
              </div>
            </div>
          ))}
        </section>

        {/* ── Comparison table ──────────────────────────────────────── */}
        <section
          style={{
            padding: 'clamp(64px, 8vw, 120px) clamp(24px, 6vw, 120px)',
          }}
        >
          <p className="label-eyebrow" style={{ marginBottom: '40px' }}>
            Side by Side
          </p>

          <div style={{ overflowX: 'auto' }}>
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontFamily: 'var(--font-body)',
                fontSize: 'var(--text-sm)',
              }}
            >
              <thead>
                <tr>
                  <th
                    style={{
                      textAlign: 'left',
                      padding: '14px 20px',
                      fontFamily: 'var(--font-ui)',
                      fontSize: 'var(--text-xs)',
                      letterSpacing: '0.16em',
                      textTransform: 'uppercase',
                      color: 'var(--graphite)',
                      borderBottom: '2px solid var(--ash)',
                      fontWeight: 400,
                      minWidth: '160px',
                    }}
                  >
                    Property
                  </th>
                  {hjMaterials.map((m) => (
                    <th
                      key={m.handle}
                      style={{
                        textAlign: 'left',
                        padding: '14px 20px',
                        fontFamily: 'var(--font-ui)',
                        fontSize: 'var(--text-xs)',
                        letterSpacing: '0.16em',
                        textTransform: 'uppercase',
                        color: 'var(--ink)',
                        borderBottom: '2px solid var(--ash)',
                        fontWeight: 400,
                        minWidth: '160px',
                      }}
                    >
                      {m.title}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {COMPARISON_ROWS.map((row, i) => (
                  <tr
                    key={row.property}
                    style={{ backgroundColor: i % 2 === 0 ? 'transparent' : 'var(--nacre)' }}
                  >
                    <td
                      style={{
                        padding: '14px 20px',
                        fontFamily: 'var(--font-ui)',
                        fontSize: 'var(--text-xs)',
                        letterSpacing: '0.1em',
                        textTransform: 'uppercase',
                        color: 'var(--graphite)',
                        borderBottom: '1px solid var(--ash)',
                        fontWeight: 400,
                      }}
                    >
                      {row.property}
                    </td>
                    <td
                      style={{
                        padding: '14px 20px',
                        color: 'var(--ink)',
                        borderBottom: '1px solid var(--ash)',
                        fontWeight: 300,
                      }}
                    >
                      {row.titanium}
                    </td>
                    <td
                      style={{
                        padding: '14px 20px',
                        color: 'var(--ink)',
                        borderBottom: '1px solid var(--ash)',
                        fontWeight: 300,
                      }}
                    >
                      {row.niobium}
                    </td>
                    <td
                      style={{
                        padding: '14px 20px',
                        color: 'var(--ink)',
                        borderBottom: '1px solid var(--ash)',
                        fontWeight: 300,
                      }}
                    >
                      {row.steel}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* ── FAQ ───────────────────────────────────────────────────── */}
        <section
          style={{
            backgroundColor: 'var(--nacre)',
            padding: 'clamp(64px, 8vw, 120px) clamp(24px, 6vw, 120px)',
          }}
        >
          <p className="label-eyebrow" style={{ marginBottom: '48px' }}>
            Common Questions
          </p>

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              maxWidth: '760px',
            }}
          >
            {FAQ.map((item, i) => (
              <div
                key={i}
                style={{
                  padding: '32px 0',
                  borderBottom: '1px solid var(--ash)',
                }}
              >
                <h3
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: 'var(--text-lg)',
                    letterSpacing: '0.04em',
                    textTransform: 'uppercase',
                    color: 'var(--ink)',
                    margin: '0 0 16px',
                    fontWeight: 400,
                  }}
                >
                  {item.q}
                </h3>
                <p
                  style={{
                    fontFamily: 'var(--font-body)',
                    fontSize: 'var(--text-base)',
                    color: 'var(--graphite)',
                    lineHeight: 1.75,
                    fontWeight: 300,
                    margin: 0,
                  }}
                >
                  {item.a}
                </p>
              </div>
            ))}
          </div>
        </section>
      </main>

      <Footer />
    </>
  )
}
