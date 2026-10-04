import type { Metadata } from 'next'
import Link from 'next/link'
import { Nav } from '@/components/layout/Nav'
import { Footer } from '@/components/layout/Footer'
import { PageHeader } from '@/components/ui/PageHeader'
import { hjMaterials } from '@/lib/data/hj-data'
import {
  claimText,
  materialChips,
  materialContext,
  materialDesignation,
  materialStandard,
  toMaterialHandle,
} from '@/lib/catalog'
import { SITE_NAME } from '@/config/site'

export const metadata: Metadata = {
  title: 'Materials',
  // "The science of biocompatible jewelry metals — hypoallergenic, corrosion-proof,
  // MRI-safe" until 2026-09-26: three claims and an implication in one search snippet.
  description:
    `Grade 23 titanium (Ti-6Al-4V ELI), anodized niobium and 316L surgical steel: the three metals ${SITE_NAME} works in, each named by its exact specification.`,
}

/**
 * The comparison table: specification rows only.
 *
 * It carried Hypoallergenic, Corrosion resistance, MRI-safe and Skin-safe rows answered
 * "Yes"/"Excellent" in every cell until 2026-09-26 — twelve claims in a grid, none with a
 * source. Those claims are pending in the registry and appear as chips on each material
 * above once approved. What stays in the grid is what the metals are: the designation, the
 * relative weight the page already stated, and the standard — `null` until a document
 * supports it, because naming a standard is a certification claim about the stock. The
 * table *cell* says "Under review"; the data never does, so no copy edit can turn a missing
 * standard into a documented one.
 *
 * Module scope is safe here and only here: a documented standard depends on the registry,
 * not on the clock. Anything that resolves a claim is computed per render, below.
 */
const TABLE_MATERIALS = hjMaterials.map((m) => {
  const context = materialContext(m.handle)
  const material = toMaterialHandle(m.handle)
  return {
    handle: m.handle,
    designation: materialDesignation(material),
    standard: materialStandard(material, context),
  }
})

const UNDOCUMENTED_STANDARD = 'Under review'

const WEIGHT: Record<string, string> = {
  titanium: 'Lightweight',
  niobium: 'Medium',
  'surgical-steel': 'Medium',
}

const COMPARISON_ROWS = [
  { property: 'Designation', cells: TABLE_MATERIALS.map((m) => m.designation) },
  { property: 'Weight', cells: TABLE_MATERIALS.map((m) => WEIGHT[m.handle] ?? '—') },
  { property: 'Standard', cells: TABLE_MATERIALS.map((m) => m.standard ?? UNDOCUMENTED_STANDARD) },
] as const

/**
 * The standards answer is built from the material specifications, never written by hand:
 * a standard renders only where its provenance is documented. Today none is, so the answer
 * names the designations and says why no standard appears.
 */
function standardsAnswer(): string {
  const documented = TABLE_MATERIALS.filter((m) => m.standard !== null)
  const designations = TABLE_MATERIALS.map((m) => m.designation).join(', ')
  if (documented.length === 0) {
    return (
      `Each metal is named here by its exact designation — ${designations}. Naming a ` +
      `standard is a certification claim about the actual stock a piece is made from, so we ` +
      `name one only once the documentation for it has been reviewed. None has been yet.`
    )
  }
  return documented.map((m) => `${m.designation}: ${m.standard}.`).join(' ')
}

const SITE = { kind: 'site' } as const

/**
 * A function, not a constant: two answers resolve claims, and a claim is resolved at render
 * time — an approval that lapses, or one whose date arrives, changes the page on the next
 * render rather than on the next process start.
 *
 * Questions are kept, never silently dropped; three were rewritten because the question
 * itself asserted the claim ("Are these metals safe for sensitive skin?", "Is this jewelry
 * MRI-safe?", "What does implant-grade mean?"). Answers whose whole content was a claim come
 * from the registry and render their fallback until approved.
 */
const faq = () => [
  {
    q: 'How do these metals behave against skin?',
    a: claimText('materials-faq-skin', SITE),
  },
  {
    q: 'How do I care for these metals?',
    // The retired answer ended "Titanium and niobium are saltwater-safe; 316L steel handles
    // occasional exposure well" — a corrosion claim, pending as `saltwater-resistant`.
    a: 'Rinse with mild soap and warm water. Pat dry. Avoid prolonged exposure to harsh chemicals such as bleach or strong solvents.',
  },
  {
    q: 'What about MRI scans?',
    a: claimText('materials-faq-mri', SITE),
  },
  {
    q: 'Which standards do these metals meet?',
    a: standardsAnswer(),
  },
]

const MATERIAL_NUMBERS = ['01', '02', '03'] as const

export default function MaterialsPage() {
  return (
    <>
      <Nav />

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

          <PageHeader eyebrow="The Materials" title="Not all metals are equal." />

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
            {claimText('materials-intro', SITE)}
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
                  {materialChips(material).map((prop) => (
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
                    {row.cells.map((cell, c) => (
                      <td
                        key={c}
                        style={{
                          padding: '14px 20px',
                          color: 'var(--ink)',
                          borderBottom: '1px solid var(--ash)',
                          fontWeight: 300,
                        }}
                      >
                        {cell}
                      </td>
                    ))}
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
            {faq().map((item, i) => (
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
