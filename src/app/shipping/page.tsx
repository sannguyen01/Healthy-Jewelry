import type { Metadata } from 'next'
import { Nav } from '@/components/layout/Nav'
import { Footer } from '@/components/layout/Footer'
import { CartDrawer } from '@/components/layout/CartDrawer'
import { PageHeader } from '@/components/ui/PageHeader'
import { SUPPORT_EMAIL } from '@/config/site'

export const metadata: Metadata = {
  title: 'Shipping & Returns',
  description:
    'Free shipping on all Healthy Jewelry orders worldwide. 7–14 day international delivery. 30-day returns.',
}

const sectionHeadStyle: React.CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontSize: 'var(--text-xl, 1.4rem)',
  letterSpacing: '0.06em',
  textTransform: 'uppercase' as const,
  color: 'var(--ink)',
  margin: '0 0 16px',
}

const bodyStyle: React.CSSProperties = {
  fontFamily: 'var(--font-body)',
  fontSize: 'var(--text-base)',
  color: 'var(--graphite)',
  lineHeight: 1.75,
  fontWeight: 300,
  margin: '0 0 16px',
}

const listStyle: React.CSSProperties = {
  fontFamily: 'var(--font-body)',
  fontSize: 'var(--text-base)',
  color: 'var(--graphite)',
  lineHeight: 1.75,
  fontWeight: 300,
  margin: '0 0 16px',
  paddingLeft: '24px',
}

const tableStyle: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse' as const,
  marginBottom: '24px',
}

const thStyle: React.CSSProperties = {
  fontFamily: 'var(--font-ui)',
  fontSize: '0.7rem',
  letterSpacing: '0.16em',
  textTransform: 'uppercase',
  color: 'var(--graphite)',
  textAlign: 'left' as const,
  padding: '12px 16px',
  borderBottom: '1px solid var(--ash)',
  backgroundColor: 'var(--nacre)',
}

const tdStyle: React.CSSProperties = {
  fontFamily: 'var(--font-body)',
  fontSize: 'var(--text-base)',
  color: 'var(--graphite)',
  fontWeight: 300,
  padding: '14px 16px',
  borderBottom: '1px solid var(--ash)',
}

export default function ShippingPage() {
  return (
    <>
      <Nav />
      <CartDrawer />
      <main style={{ backgroundColor: 'var(--bg)', color: 'var(--ink)' }}>
        {/* Hero */}
        <section
          style={{
            paddingTop: '120px',
            paddingBottom: 'clamp(40px, 5vw, 64px)',
            paddingLeft: 'clamp(24px, 6vw, 120px)',
            paddingRight: 'clamp(24px, 6vw, 120px)',
            maxWidth: '900px',
          }}
        >
          <PageHeader eyebrow="Customer Service" title="Shipping & Returns" variant="compact" />
          <p
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 'var(--text-xl, 1.3rem)',
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              color: 'var(--titanium-text)',
              margin: 0,
            }}
          >
            Free shipping on all orders — no minimum.
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

        {/* Content */}
        <section
          style={{
            padding: 'clamp(48px, 6vw, 80px) clamp(24px, 6vw, 120px)',
            maxWidth: '900px',
            display: 'flex',
            flexDirection: 'column',
            gap: '56px',
          }}
        >
          {/* Shipping */}
          <div>
            <h2 style={sectionHeadStyle}>Shipping</h2>
            <p style={bodyStyle}>All orders ship free. No minimum order value, no handling fees.</p>

            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>Destination</th>
                  <th style={thStyle}>Delivery Time</th>
                  <th style={thStyle}>Cost</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style={tdStyle}>International</td>
                  <td style={tdStyle}>7–14 business days</td>
                  <td style={tdStyle}>Free</td>
                </tr>
              </tbody>
            </table>

            <p style={bodyStyle}>
              Orders are processed within 1 business day. You will receive a shipping confirmation
              email with a tracking number once your order ships.{' '}
            </p>
            <p style={bodyStyle}>
              International orders may be subject to customs duties and import taxes levied by the
              destination country. These charges are the responsibility of the recipient and are not
              included in our free shipping offer.
            </p>
          </div>

          {/* Returns */}
          <div>
            <h2 style={sectionHeadStyle}>Returns</h2>
            <p style={bodyStyle}>
              We accept returns within <strong>30 days</strong> of delivery. Items must be unworn,
              in original condition, and in original packaging.
            </p>
            <ul style={listStyle}>
              <li>
                Initiate a return by emailing{' '}
                <a
                  href={`mailto:${SUPPORT_EMAIL}`}
                  style={{ color: 'var(--ink)', textDecoration: 'underline' }}
                >
                  {SUPPORT_EMAIL}
                </a>{' '}
                with your order number.
              </li>
              <li>We will provide a prepaid return label for all returns.</li>
              <li>
                Once we receive and inspect the returned item, your refund will be processed to your
                original payment method within 5–7 business days.
              </li>
              <li>Piercing jewelry that has been worn cannot be returned for hygiene reasons.</li>
            </ul>
          </div>

          {/* Exchanges */}
          <div>
            <h2 style={sectionHeadStyle}>Exchanges</h2>
            <p style={bodyStyle}>
              Need a different size or material? We offer free exchanges within{' '}
              <strong>30 days</strong> of delivery.
            </p>
            <ul style={listStyle}>
              <li>Size swaps: we will send the correct size once we receive your return.</li>
              <li>
                Material swaps: exchanges between Grade 23 Titanium, Niobium, and 316L Surgical
                Steel variants of the same style.
              </li>
              <li>A prepaid return label is provided for all exchange requests.</li>
              <li>International exchange shipping costs may apply.</li>
            </ul>
            <p style={bodyStyle}>
              To start an exchange, email{' '}
              <a
                href={`mailto:${SUPPORT_EMAIL}`}
                style={{ color: 'var(--ink)', textDecoration: 'underline' }}
              >
                {SUPPORT_EMAIL}
              </a>{' '}
              with your order number and the item you would like instead.
            </p>
          </div>

          {/* Contact */}
          <div>
            <h2 style={sectionHeadStyle}>Questions?</h2>
            <p style={bodyStyle}>
              Contact our support team at{' '}
              <a
                href={`mailto:${SUPPORT_EMAIL}`}
                style={{ color: 'var(--ink)', textDecoration: 'underline' }}
              >
                {SUPPORT_EMAIL}
              </a>
              . We respond within 24 hours on business days.
            </p>
          </div>
        </section>
      </main>
      <Footer />
    </>
  )
}
