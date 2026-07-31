import type { Metadata } from 'next'
import Link from 'next/link'
import { Nav } from '@/components/layout/Nav'
import { Footer } from '@/components/layout/Footer'
import { CartDrawer } from '@/components/layout/CartDrawer'
import { JewelrySVG } from '@/components/svg/JewelrySVG'

export const metadata: Metadata = {
  title: 'Our Story — Healthy Jewelry',
  description:
    'The science behind Healthy Jewelry. Grade 23 titanium, niobium, and 316L surgical steel — the same alloys used in surgical implants, now in jewelry.',
}

export default function AboutPage() {
  return (
    <>
      <Nav />
      <CartDrawer />

      <main style={{ backgroundColor: 'var(--bg)', color: 'var(--ink)' }}>

        {/* ── 1. Hero ────────────────────────────────────────────────── */}
        <section
          style={{
            paddingTop: '120px',
            paddingBottom: 'clamp(64px, 8vw, 120px)',
            paddingLeft: 'clamp(24px, 6vw, 120px)',
            paddingRight: 'clamp(24px, 6vw, 120px)',
            maxWidth: '900px',
          }}
        >
          <p className="label-eyebrow" style={{ marginBottom: '24px' }}>
            Our Story
          </p>

          <h1
            style={{
              fontFamily: 'var(--font-display)',
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              fontSize: 'var(--text-display)',
              fontWeight: 700,
              lineHeight: 1.05,
              color: 'var(--ink)',
              margin: '0 0 32px',
            }}
          >
            We build jewelry for bodies that refuse compromise.
          </h1>

          <p
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: 'var(--text-lg)',
              color: 'var(--graphite)',
              lineHeight: 1.7,
              maxWidth: '620px',
              fontWeight: 300,
            }}
          >
            Most jewelry is made for display cases. Ours is made for skin. Every alloy
            we use has been validated in the most demanding environment possible —
            the human body.
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
                fontSize: 'var(--text-2xl)',
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
                color: 'var(--ink)',
                margin: '0 0 24px',
              }}
            >
              Implant-grade,
              <br />
              by design.
            </h2>

            <p
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: 'var(--text-base)',
                color: 'var(--graphite)',
                lineHeight: 1.75,
                fontWeight: 300,
                margin: '0 0 20px',
              }}
            >
              Titanium has been used in surgical implants for over 60 years — hip
              replacements, bone screws, spinal rods. The Grade 23 alloy (Ti-6Al-4V
              ELI) is chosen because the body simply does not react to it.
            </p>

            <p
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: 'var(--text-base)',
                color: 'var(--graphite)',
                lineHeight: 1.75,
                fontWeight: 300,
              }}
            >
              We asked one question: if this metal is trusted inside the body, why are
              so few jewelers using it? Healthy Jewelry is our answer. Every piece uses
              the same material specifications that surgeons rely on.
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
                  body: 'Only implant-grade metals. No plating. No filler alloys. No compromise. What you see is what touches your skin.',
                },
                {
                  num: '02',
                  title: 'Biocompatibility First',
                  body: 'Grade 23 titanium is the same alloy used in hip replacements and bone anchors. It does not corrode, leach, or sensitize.',
                },
                {
                  num: '03',
                  title: 'Lifetime Warranty',
                  body: 'If it corrodes, we replace it. It will not — but the warranty exists because we are certain of the material.',
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
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: '3.5rem',
                    color: 'var(--ash-text)',
                    lineHeight: 1,
                    margin: '0 0 20px',
                    letterSpacing: '0.02em',
                  }}
                >
                  {card.num}
                </p>

                <h3
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: 'var(--text-xl)',
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
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
                    lineHeight: 1.7,
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
              fontSize: 'var(--text-2xl)',
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
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
              lineHeight: 1.75,
              fontWeight: 300,
              margin: 0,
            }}
          >
            Three metals. Each chosen for one reason: the body accepts them without
            reaction. Read the full material science breakdown.
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
              fontSize: 'var(--text-display)',
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              color: 'var(--bg)',
              margin: 0,
            }}
          >
            Built for your body.
          </h2>

          <p
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: 'var(--text-lg)',
              color: 'var(--ash-text)',
              lineHeight: 1.6,
              fontWeight: 300,
              maxWidth: '480px',
              margin: 0,
            }}
          >
            Every piece in the collection uses implant-grade metals — the same
            standard used in medical devices.
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
