import type { Metadata } from 'next'
import Link from 'next/link'
import { Nav } from '@/components/layout/Nav'
import { Footer } from '@/components/layout/Footer'
import { JewelrySVG } from '@/components/svg/JewelrySVG'
import { PageHeader } from '@/components/ui/PageHeader'
import { SITE_NAME } from '@/config/site'

export const metadata: Metadata = {
  title: 'Our Story',
  description:
    `Why ${SITE_NAME} works in three metals — Grade 23 titanium, niobium and 316L surgical steel — and names each by its exact specification.`,
}

/*
 * The story, told in specifications. Until 2026-09-26 this page made nine health and
 * regulatory claims in prose — "validated in … the human body", "the body simply does not
 * react to it", "trusted inside the body", "Biocompatibility First", "does not corrode,
 * leach, or sensitize", "It will not [corrode]", "accepts them without reaction", "the same
 * standard used in medical devices" — none with evidence. The claims themselves are pending
 * in the registry (src/content/claims/claims.json) in their canonical forms; this page now
 * says what the brand can say without a document. The warranty card's promise stays: it is
 * a commercial term for WS-H's legal review, held by count in legal-review-inventory.test.ts.
 */
export default function AboutPage() {
  return (
    <>
      <Nav />

      <main id="main" tabIndex={-1} style={{ backgroundColor: 'var(--bg)', color: 'var(--ink)' }}>
        {/* ── 1. Hero ────────────────────────────────────────────────── */}
        <section
          style={{
            paddingTop: 'calc(var(--header-height) + 56px)',
            paddingBottom: 'clamp(64px, 8vw, 120px)',
            paddingLeft: 'clamp(24px, 6vw, 120px)',
            paddingRight: 'clamp(24px, 6vw, 120px)',
            maxWidth: '900px',
          }}
        >
          <PageHeader eyebrow="Our Story" title="We build jewelry for bodies that refuse compromise." />

          <p
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: 'var(--text-lg)',
              color: 'var(--graphite)',
              lineHeight: 'var(--leading-long)',
              maxWidth: '620px',
              fontWeight: 300,
            }}
          >
            Most jewelry is made for display cases. Ours is made to be worn. Every piece is one of
            three metals, and we name each by its exact specification.
          </p>
        </section>

        {/* ── Divider ───────────────────────────────────────────────── */}
        <div className="rule" style={{ margin: '0 clamp(24px, 6vw, 120px)' }} />

        {/* ── 2. Mission ────────────────────────────────────────────── */}
        <section
          style={{
            padding: 'clamp(64px, 8vw, 120px) clamp(24px, 6vw, 120px)',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: 'clamp(40px, 6vw, 80px)',
            alignItems: 'center',
          }}
        >
          <div>
            <p className="label-eyebrow" style={{ marginBottom: '20px' }}>
              Why We Exist
            </p>

            <h2
              style={{
                fontFamily: 'var(--font-display)',
                textTransform: 'uppercase',
                fontWeight: 500,
                fontSize: 'var(--text-2xl)',
                letterSpacing: 'var(--tracking-title)',
                color: 'var(--ink)',
                margin: '0 0 24px',
              }}
            >
              Specified,
              <br />
              by design.
            </h2>

            <p
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: 'var(--text-base)',
                color: 'var(--graphite)',
                lineHeight: 'var(--leading-long)',
                fontWeight: 300,
                margin: '0 0 20px',
              }}
            >
              The Grade 23 alloy is Ti-6Al-4V ELI: titanium alloyed with aluminum and vanadium, in
              its Extra Low Interstitial form. It is the titanium we work in, and we say so by
              name.
            </p>

            <p
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: 'var(--text-base)',
                color: 'var(--graphite)',
                lineHeight: 'var(--leading-long)',
                fontWeight: 300,
              }}
            >
              We asked one question: what would jewelry look like if every piece were named by its
              exact alloy? {SITE_NAME} is our answer — each piece described by its material
              specification, and nothing said about it that we cannot document.
            </p>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: '260px',
            }}
          >
            <JewelrySVG
              type="ring-arc"
              style={{
                width: 'clamp(180px, 30vw, 320px)',
                height: 'clamp(180px, 30vw, 320px)',
                opacity: 0.4,
              }}
            />
          </div>
        </section>

        {/* ── 3. Values grid ────────────────────────────────────────── */}
        <section
          style={{
            backgroundColor: 'var(--nacre)',
            padding: 'clamp(64px, 8vw, 120px) clamp(24px, 6vw, 120px)',
          }}
        >
          <p className="label-eyebrow" style={{ marginBottom: '48px' }}>
            What We Stand For
          </p>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
              gap: '2px',
            }}
          >
            {(
              [
                {
                  num: '01',
                  title: 'Material Integrity',
                  body: 'Three metals, named by their exact specification. No plating. No filler alloys. No compromise. What you see is what you wear.',
                },
                {
                  num: '02',
                  title: 'Specification First',
                  body: 'Grade 23 titanium is Ti-6Al-4V ELI — an alloy named by its composition, not described by adjectives. What we publish about a metal starts from that name.',
                },
                {
                  num: '03',
                  title: 'Lifetime Warranty',
                  body: 'If it corrodes, we replace it. The warranty terms are set out in our Terms of Service.',
                },
              ] as const
            ).map((card) => (
              <div
                key={card.num}
                style={{
                  backgroundColor: 'var(--bg)',
                  padding: '40px 36px',
                }}
              >
                <p
                  aria-hidden="true"
                  className="hj-ghost-numeral"
                  data-numeral={card.num}
                  style={{
                    fontFamily: 'var(--font-display)',
                    textTransform: 'uppercase',
                    fontWeight: 500,
                    fontSize: '3.5rem',
                    color: 'var(--ash)',
                    lineHeight: 1,
                    margin: '0 0 20px',
                    letterSpacing: 'var(--tracking-display)',
                  }}
                />

                <h3
                  style={{
                    fontFamily: 'var(--font-display)',
                    textTransform: 'uppercase',
                    fontWeight: 500,
                    fontSize: 'var(--text-xl)',
                    letterSpacing: 'var(--tracking-title)',
                    color: 'var(--ink)',
                    margin: '0 0 16px',
                  }}
                >
                  {card.title}
                </h3>

                <p
                  style={{
                    fontFamily: 'var(--font-body)',
                    fontSize: 'var(--text-base)',
                    color: 'var(--graphite)',
                    lineHeight: 'var(--leading-long)',
                    fontWeight: 300,
                    margin: 0,
                  }}
                >
                  {card.body}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* ── 4. Materials teaser ───────────────────────────────────── */}
        <section
          style={{
            padding: 'clamp(64px, 8vw, 120px) clamp(24px, 6vw, 120px)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-start',
            gap: '24px',
            maxWidth: '640px',
          }}
        >
          <p className="label-eyebrow">The Materials</p>

          <h2
            style={{
              fontFamily: 'var(--font-display)',
              textTransform: 'uppercase',
              fontWeight: 500,
              fontSize: 'var(--text-2xl)',
              letterSpacing: 'var(--tracking-title)',
              color: 'var(--ink)',
              margin: 0,
            }}
          >
            Grade 23 Titanium.
            <br />
            Niobium.
            <br />
            316L Surgical Steel.
          </h2>

          <p
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: 'var(--text-base)',
              color: 'var(--graphite)',
              lineHeight: 'var(--leading-long)',
              fontWeight: 300,
              margin: 0,
            }}
          >
            Three metals, each named by its exact specification. Read the full material
            breakdown.
          </p>

          <Link href="/materials" className="btn-ghost" style={{ marginTop: '8px' }}>
            View Materials
          </Link>
        </section>

        {/* ── 5. CTA ────────────────────────────────────────────────── */}
        <section
          style={{
            backgroundColor: 'var(--ink)',
            padding: 'clamp(64px, 8vw, 100px) clamp(24px, 6vw, 120px)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            textAlign: 'center',
            gap: '32px',
          }}
        >
          <h2
            style={{
              fontFamily: 'var(--font-display)',
              textTransform: 'uppercase',
              fontWeight: 500,
              fontSize: 'var(--text-display)',
              letterSpacing: 'var(--tracking-display)',
              color: 'var(--bg)',
              margin: 0,
            }}
          >
            Built to be worn.
          </h2>

          <p
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: 'var(--text-lg)',
              color: 'var(--on-dark)',
              lineHeight: 'var(--leading-text)',
              fontWeight: 300,
              maxWidth: '480px',
              margin: 0,
            }}
          >
            Every piece in the collection is Grade 23 titanium, anodized niobium or 316L surgical
            steel.
          </p>

          <Link href="/shop" className="btn-ghost-dark">
            Shop the Collection
          </Link>
        </section>
      </main>

      <Footer />
    </>
  )
}
