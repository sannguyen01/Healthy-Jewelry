import type { Metadata } from 'next'
import { Nav } from '@/components/layout/Nav'
import { Footer } from '@/components/layout/Footer'
import { CartDrawer } from '@/components/layout/CartDrawer'

export const metadata: Metadata = {
  title: 'Terms of Service',
  description:
    'Terms of Service for Healthy Jewelry. Lifetime warranty against corrosion. Free returns within 30 days.',
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

export default function TermsPage() {
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
            maxWidth: '800px',
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
            Legal
          </p>
          <h1
            style={{
              fontFamily: 'var(--font-display)',
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              fontSize: 'var(--text-2xl)',
              fontWeight: 700,
              lineHeight: 1.1,
              color: 'var(--ink)',
              margin: '0 0 16px',
            }}
          >
            Terms of Service
          </h1>
          <p style={{ ...bodyStyle, color: 'var(--graphite)' }}>Last updated: January 2026</p>
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
            maxWidth: '800px',
            display: 'flex',
            flexDirection: 'column',
            gap: '48px',
          }}
        >
          {/* 1. Acceptance */}
          <div>
            <h2 style={sectionHeadStyle}>Acceptance of Terms</h2>
            <p style={bodyStyle}>
              By accessing or using the Healthy Jewelry website (healthyjewelry.com) or placing an
              order, you agree to be bound by these Terms of Service. If you do not agree, please do
              not use our site or services.
            </p>
            <p style={bodyStyle}>
              These terms apply to all visitors, customers, and others who access or use our
              services. We reserve the right to update these terms at any time. Continued use of the
              site after changes constitutes acceptance of the revised terms.
            </p>
          </div>

          {/* 2. Products and pricing */}
          <div>
            <h2 style={sectionHeadStyle}>Products and Pricing</h2>
            <p style={bodyStyle}>
              All products are made from implant-grade metals: Grade 23 Titanium, Niobium, or 316L
              Surgical Steel. Product descriptions and material specifications are accurate to the
              best of our knowledge.
            </p>
            <p style={bodyStyle}>
              Prices are displayed in US Dollars (USD). We reserve the right to change prices at any
              time without notice. The price shown at the time of your order confirmation is the
              price you will pay.
            </p>
            <p style={bodyStyle}>
              We make every effort to display product colors accurately, but actual colors may vary
              depending on your screen settings. All dimensions listed are approximate.
            </p>
          </div>

          {/* 3. Order process */}
          <div>
            <h2 style={sectionHeadStyle}>Order Process and Confirmation</h2>
            <p style={bodyStyle}>
              Placing an item in your cart does not constitute a purchase. Your order is confirmed
              when you receive an order confirmation email from us. We reserve the right to cancel
              orders in cases of:
            </p>
            <ul style={listStyle}>
              <li>Stock unavailability after order placement</li>
              <li>Pricing errors on the website</li>
              <li>Suspected fraudulent transactions</li>
              <li>Delivery address issues we cannot resolve</li>
            </ul>
            <p style={bodyStyle}>
              If we cancel your order, you will receive a full refund to your original payment
              method within 5–7 business days.
            </p>
          </div>

          {/* 4. Payment */}
          <div>
            <h2 style={sectionHeadStyle}>Payment Methods</h2>
            <p style={bodyStyle}>We accept the following payment methods:</p>
            <ul style={listStyle}>
              <li>Credit and debit cards (Visa, Mastercard)</li>
              <li>PayPal</li>
              <li>Bank transfer</li>
            </ul>
            <p style={bodyStyle}>
              All transactions are processed securely. We do not store your full card details on our
              servers.
            </p>
          </div>

          {/* 5. Warranty */}
          <div>
            <h2 style={sectionHeadStyle}>Lifetime Warranty</h2>
            <p
              style={{
                ...bodyStyle,
                fontFamily: 'var(--font-display)',
                fontSize: 'var(--text-lg, 1.1rem)',
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
                color: 'var(--ink)',
                fontWeight: 700,
              }}
            >
              If it corrodes, we replace it — no questions asked.
            </p>
            <p style={bodyStyle}>
              All Healthy Jewelry pieces carry a lifetime warranty against corrosion, tarnishing,
              and metal degradation. This warranty reflects our confidence in the materials:
              implant-grade titanium, niobium, and 316L surgical steel do not corrode under normal
              wear conditions.
            </p>
            <p style={bodyStyle}>
              The warranty covers manufacturing defects and corrosion failure. It does not cover
              physical damage from impact, loss, or damage from improper use (e.g., exposure to
              concentrated chemicals or extreme heat). To make a warranty claim, email{' '}
              <a
                href="mailto:hello@healthyjewelry.com"
                style={{ color: 'var(--ink)', textDecoration: 'underline' }}
              >
                hello@healthyjewelry.com
              </a>{' '}
              with your order number and a description of the issue.
            </p>
          </div>

          {/* 6. Limitation of liability */}
          <div>
            <h2 style={sectionHeadStyle}>Limitation of Liability</h2>
            <p style={bodyStyle}>
              To the fullest extent permitted by applicable law, Healthy Jewelry shall not be liable
              for any indirect, incidental, special, consequential, or punitive damages arising from
              your use of our products or services. Our total liability shall not exceed the amount
              you paid for the specific product or service that is the subject of the claim.
            </p>
            <p style={bodyStyle}>
              We make no warranties beyond those expressly stated in these Terms. All products are
              sold &quot;as described&quot; based on the material specifications provided.
            </p>
          </div>

          {/* 7. Governing law */}
          <div>
            <h2 style={sectionHeadStyle}>Governing Law</h2>
            <p style={bodyStyle}>
              These Terms are governed by applicable law. We aim to resolve any disputes arising
              from these Terms or your use of our services amicably before any formal proceedings.
            </p>
            <p style={bodyStyle}>
              Contact us at{' '}
              <a
                href="mailto:hello@healthyjewelry.com"
                style={{ color: 'var(--ink)', textDecoration: 'underline' }}
              >
                hello@healthyjewelry.com
              </a>{' '}
              before any formal proceedings.
            </p>
          </div>

          {/* 8. Contact */}
          <div>
            <h2 style={sectionHeadStyle}>Contact</h2>
            <p style={bodyStyle}>For questions about these Terms of Service:</p>
            <p style={bodyStyle}>
              <strong>Email:</strong>{' '}
              <a
                href="mailto:hello@healthyjewelry.com"
                style={{ color: 'var(--ink)', textDecoration: 'underline' }}
              >
                hello@healthyjewelry.com
              </a>
              <br />
              <strong>Address:</strong> Healthy Jewelry
            </p>
          </div>
        </section>
      </main>
      <Footer />
    </>
  )
}
