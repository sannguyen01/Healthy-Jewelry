import type { Metadata } from 'next'
import { Nav } from '@/components/layout/Nav'
import { Footer } from '@/components/layout/Footer'
import { CartDrawer } from '@/components/layout/CartDrawer'
import { ContactForm } from '@/components/contact/ContactForm'

export const metadata: Metadata = {
  title: 'Contact',
  description:
    'Get in touch with Healthy Jewelry. Questions about materials, sizing, or orders — we respond within 24 hours.',
}

const INFO_ITEMS = [
  { label: 'Email', value: 'hello@healthyjewelry.com' },
  { label: 'Response time', value: 'Within 24 hours' },
] as const

export default function ContactPage() {
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
            maxWidth: '900px',
          }}
        >
          <p className="label-eyebrow" style={{ marginBottom: '24px' }}>
            Contact
          </p>

          <h1
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 'var(--text-display)',
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              color: 'var(--ink)',
              lineHeight: 1.05,
              margin: '0 0 28px',
              fontWeight: 700,
            }}
          >
            We respond within 24 hours.
          </h1>

          <p
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: 'var(--text-lg)',
              color: 'var(--graphite)',
              lineHeight: 1.7,
              fontWeight: 300,
              maxWidth: '520px',
              margin: 0,
            }}
          >
            Material questions, sizing advice, custom orders. Reach us any time.
          </p>
        </section>

        {/* ── Two-column: info + form ───────────────────────────────── */}
        <section
          style={{
            padding: '0 clamp(24px, 6vw, 120px) clamp(64px, 8vw, 120px)',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: 'clamp(48px, 7vw, 96px)',
            alignItems: 'start',
          }}
        >
          {/* Left — contact info */}
          <div>
            {INFO_ITEMS.map((item) => (
              <div
                key={item.label}
                style={{
                  borderTop: '1px solid var(--ash)',
                  padding: '24px 0',
                }}
              >
                <p
                  style={{
                    fontFamily: 'var(--font-ui)',
                    fontSize: 'var(--text-xs)',
                    letterSpacing: '0.18em',
                    textTransform: 'uppercase',
                    color: 'var(--graphite)',
                    margin: '0 0 8px',
                  }}
                >
                  {item.label}
                </p>
                <p
                  style={{
                    fontFamily: 'var(--font-body)',
                    fontSize: 'var(--text-base)',
                    color: 'var(--ink)',
                    fontWeight: 300,
                    margin: 0,
                  }}
                >
                  {item.value}
                </p>
              </div>
            ))}
          </div>

          {/* Right — contact form */}
          <div>
            <ContactForm />
          </div>
        </section>

        {/* ── Dark CTA band ─────────────────────────────────────────── */}
        <section
          style={{
            backgroundColor: 'var(--black)',
            padding: 'clamp(56px, 7vw, 96px) clamp(24px, 6vw, 120px)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            textAlign: 'center',
            gap: '24px',
          }}
        >
          <p className="label-eyebrow" style={{ color: 'var(--mist)' }}>
            Material Science
          </p>

          <h2
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 'var(--text-2xl)',
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              color: 'var(--on-dark)',
              margin: 0,
              lineHeight: 1.1,
            }}
          >
            Questions about our metals?
          </h2>

          <p
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: 'var(--text-base)',
              color: 'var(--ash)',
              lineHeight: 1.7,
              fontWeight: 300,
              maxWidth: '460px',
              margin: 0,
            }}
          >
            Read our complete guide to Grade 23 titanium, niobium, and 316L surgical steel.
          </p>

          <a href="/materials" className="btn-ghost-dark" style={{ marginTop: '8px' }}>
            View Materials Guide
          </a>
        </section>
      </main>

      <Footer />
    </>
  )
}
