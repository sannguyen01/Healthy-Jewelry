import type { Metadata } from 'next'
import { Nav } from '@/components/layout/Nav'
import { Footer } from '@/components/layout/Footer'
import { PageHeader } from '@/components/ui/PageHeader'
import { CONTACT_EMAIL, SITE_DOMAIN } from '@/config/site'

export const metadata: Metadata = {
  title: 'Locations',
  description:
    'Healthy Jewelry is arranged through ambassadors and shipped worldwide with free delivery. Showroom appointments available; flagship store coming 2026.',
}

export default function StoresPage() {
  return (
    <>
      <Nav />
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
          <PageHeader eyebrow="Locations" title="Find Us" />
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
            {/*
              This said "available exclusively online", which is now exactly backwards. The
              site takes no orders; every piece is arranged with a person. A page titled
              Find Us telling a visitor to look online was the single most misleading
              sentence left in the catalogue after the decommission, because it is the page
              somebody reads when they want to know how to actually get one.
            */}
            Arranged in person, through a Healthy Jewelry ambassador — then shipped
            worldwide, free, wherever you are.
          </p>
        </section>

        {/* Divider */}
        <div
          style={{
            height: '1px',
            backgroundColor: 'var(--ash)',
            margin: '0 clamp(24px, 6vw, 120px)',
          }}
        />

        {/* How a piece is arranged, and the flagship */}
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
                color: 'var(--titanium-text)',
                marginBottom: '20px',
              }}
            >
              Through an Ambassador
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
              The full collection is at {SITE_DOMAIN} to browse. To hold one, talk to an
              ambassador — they will confirm the piece, the size and the price with you, and
              it ships free to every country with no minimum.
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
              International delivery: 7–14 business days.
            </p>
          </div>

          <div>
            <p
              style={{
                fontFamily: 'var(--font-ui)',
                fontSize: '0.62rem',
                letterSpacing: '0.22em',
                textTransform: 'uppercase',
                color: 'var(--titanium-text)',
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
              Flagship Store
              <br />
              Coming 2026.
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
              Our flagship physical store is coming in 2026. It will be a space dedicated to
              material transparency — where you can see, handle, and compare our metals in person.
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
              Until then, consultations and showroom appointments are how most people meet a
              piece before they choose it. Email us to arrange a visit, or to be introduced
              to an ambassador near you.
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
              Showroom
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
              For showroom appointments or in-person consultations, email us at{' '}
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                style={{ color: 'var(--ink)', textDecoration: 'underline' }}
              >
                {CONTACT_EMAIL}
              </a>
              . We will arrange a time that works for you.
            </p>
            <div>
              <a
                href={`mailto:${CONTACT_EMAIL}`}
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
