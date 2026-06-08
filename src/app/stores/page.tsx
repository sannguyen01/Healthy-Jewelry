import type { Metadata } from 'next'
import { Nav } from '@/components/layout/Nav'
import { Footer } from '@/components/layout/Footer'
import { CartDrawer } from '@/components/layout/CartDrawer'

export const metadata: Metadata = {
  title: 'Locations — Healthy Jewelry',
  description:
    'Healthy Jewelry is available exclusively online. Our flagship store in Hà Nội is coming in 2026. Ships worldwide.',
}

export default function StoresPage() {
  return (
    <>
      <Nav />
      <CartDrawer />
      <main style={{ backgroundColor: 'var(--bg)', color: 'var(--ink)' }}>

        {/* Hero */}
        <section
          style={{
            paddingTop: '120px',
            paddingBottom: 'clamp(64px, 8vw, 120px)',
            paddingLeft: 'clamp(24px, 6vw, 120px)',
            paddingRight: 'clamp(24px, 6vw, 120px)',
            maxWidth: '900px',
          }}
        >
          <p
            style={{
              fontFamily: 'var(--font-ui)',
              fontSize: '0.62rem',
              letterSpacing: '0.22em',
              textTransform: 'uppercase',
              color: 'var(--graphite)',
              marginBottom: '24px',
            }}
          >
            Locations
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
            Find Us
          </h1>
          <p
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: 'var(--text-lg)',
              color: 'var(--graphite)',
              lineHeight: 1.7,
              fontWeight: 300,
              maxWidth: '560px',
              margin: 0,
            }}
          >
            Currently available exclusively online — we ship worldwide with free delivery on every order.
          </p>
        </section>

        {/* Divider */}
        <div style={{ height: '1px', backgroundColor: 'var(--ash)', margin: '0 clamp(24px, 6vw, 120px)' }} />

        {/* Online Store */}
        <section
          style={{
            padding: 'clamp(64px, 8vw, 120px) clamp(24px, 6vw, 120px)',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: 'clamp(40px, 6vw, 80px)',
            maxWidth: '1100px',
          }}
        >
          <div>
            <p
              style={{
                fontFamily: 'var(--font-ui)',
                fontSize: '0.62rem',
                letterSpacing: '0.22em',
                textTransform: 'uppercase',
                color: 'var(--titanium)',
                marginBottom: '20px',
              }}
            >
              Online Store
            </p>
            <h2
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 'var(--text-2xl)',
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
                color: 'var(--ink)',
                margin: '0 0 20px',
              }}
            >
              Ships
              <br />
              Worldwide.
            </h2>
            <p
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: 'var(--text-base)',
                color: 'var(--graphite)',
                lineHeight: 1.75,
                fontWeight: 300,
                margin: '0 0 16px',
              }}
            >
              Our full collection is available at healthyjewelry.com. Free shipping to every country, no minimum order. Orders from Hà Nội can arrive the same day.
            </p>
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
              Vietnam-wide delivery: 2–4 business days.
              <br />
              International: 7–14 business days.
            </p>
          </div>

          <div>
            <p
              style={{
                fontFamily: 'var(--font-ui)',
                fontSize: '0.62rem',
                letterSpacing: '0.22em',
                textTransform: 'uppercase',
                color: 'var(--titanium)',
                marginBottom: '20px',
              }}
            >
              Flagship Store — Coming 2026
            </p>
            <h2
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 'var(--text-2xl)',
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
                color: 'var(--ink)',
                margin: '0 0 20px',
              }}
            >
              Hà Nội,
              <br />
              Việt Nam.
            </h2>
            <p
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: 'var(--text-base)',
                color: 'var(--graphite)',
                lineHeight: 1.75,
                fontWeight: 300,
                margin: '0 0 16px',
              }}
            >
              Our flagship physical store in Hà Nội is coming in 2026. It will be a space dedicated to material transparency — where you can see, handle, and compare our metals in person.
            </p>
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
              Until then, we offer in-person consultations and showroom appointments in Hà Nội. Email us to arrange a visit.
            </p>
          </div>
        </section>

        {/* In-person consultation CTA */}
        <section
          style={{
            backgroundColor: 'var(--nacre)',
            padding: 'clamp(48px, 6vw, 80px) clamp(24px, 6vw, 120px)',
          }}
        >
          <div
            style={{
              maxWidth: '640px',
              display: 'flex',
              flexDirection: 'column',
              gap: '20px',
            }}
          >
            <p
              style={{
                fontFamily: 'var(--font-ui)',
                fontSize: '0.62rem',
                letterSpacing: '0.22em',
                textTransform: 'uppercase',
                color: 'var(--graphite)',
                margin: 0,
              }}
            >
              In Hà Nội?
            </p>
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
              Book a showroom consultation.
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
              For showroom appointments or in-person consultations in Hà Nội, email us at{' '}
              <a
                href="mailto:hello@healthyjewelry.com"
                style={{ color: 'var(--ink)', textDecoration: 'underline' }}
              >
                hello@healthyjewelry.com
              </a>
              . We will arrange a time that works for you.
            </p>
            <div>
              <a
                href="mailto:hello@healthyjewelry.com"
                className="btn-ghost"
                style={{ display: 'inline-block' }}
              >
                Request Appointment
              </a>
            </div>
          </div>
        </section>

      </main>
      <Footer />
    </>
  )
}
