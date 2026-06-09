import type { Metadata } from 'next'
import { Nav } from '@/components/layout/Nav'
import { Footer } from '@/components/layout/Footer'
import { CartDrawer } from '@/components/layout/CartDrawer'

export const metadata: Metadata = {
  title: 'Privacy Policy — Healthy Jewelry',
  description: 'How Healthy Jewelry collects, uses, and protects your personal data.',
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

export default function PrivacyPage() {
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
            Privacy Policy
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
          {/* 1. What data we collect */}
          <div>
            <h2 style={sectionHeadStyle}>What Data We Collect</h2>
            <p style={bodyStyle}>
              When you interact with Healthy Jewelry, we may collect the following information:
            </p>
            <ul style={listStyle}>
              <li>
                <strong>Identity data:</strong> your name as provided during checkout or contact.
              </li>
              <li>
                <strong>Contact data:</strong> email address, phone number (if provided).
              </li>
              <li>
                <strong>Order data:</strong> items purchased, order amounts, delivery address,
                payment method type (we do not store full card numbers).
              </li>
              <li>
                <strong>Technical data:</strong> IP address, browser type, pages visited, referring
                URL, time on site.
              </li>
              <li>
                <strong>Communication data:</strong> messages you send us via the contact form or
                email.
              </li>
            </ul>
            <p style={bodyStyle}>
              We do not collect sensitive personal data such as national ID numbers, health records,
              or biometric data.
            </p>
          </div>

          {/* 2. How we use it */}
          <div>
            <h2 style={sectionHeadStyle}>How We Use Your Data</h2>
            <p style={bodyStyle}>We use your data for the following purposes:</p>
            <ul style={listStyle}>
              <li>
                <strong>Order fulfillment:</strong> to process, pack, and ship your order and send
                order confirmation emails.
              </li>
              <li>
                <strong>Customer service:</strong> to respond to your inquiries and resolve any
                issues with your order.
              </li>
              <li>
                <strong>Marketing communications:</strong> to send you updates about new products,
                promotions, and brand news — only if you have opted in. You may unsubscribe at any
                time via the link in any marketing email.
              </li>
              <li>
                <strong>Site improvement:</strong> to analyze how visitors use our site and improve
                the experience.
              </li>
              <li>
                <strong>Legal compliance:</strong> to meet our obligations under applicable law.
              </li>
            </ul>
            <p style={bodyStyle}>
              We do not sell your personal data to third parties. We may share data with trusted
              service providers (shipping carriers, payment processors, email platforms) solely to
              operate our business. These providers are contractually bound to protect your data.
            </p>
          </div>

          {/* 3. Cookies */}
          <div>
            <h2 style={sectionHeadStyle}>Cookies</h2>
            <p style={bodyStyle}>We use two types of cookies:</p>
            <ul style={listStyle}>
              <li>
                <strong>Session cookies:</strong> essential for site functionality such as
                maintaining your shopping cart. These expire when you close your browser.
              </li>
              <li>
                <strong>Analytics cookies:</strong> used to understand aggregate traffic patterns.
                These do not identify you personally. You may opt out via your browser settings or a
                cookie preference tool.
              </li>
            </ul>
            <p style={bodyStyle}>
              We do not use advertising or tracking cookies. You can disable cookies in your browser
              settings, though some site features may not function correctly without them.
            </p>
          </div>

          {/* 4. Your rights */}
          <div>
            <h2 style={sectionHeadStyle}>Your Rights</h2>
            <p style={bodyStyle}>You have the following rights regarding your personal data:</p>
            <ul style={listStyle}>
              <li>
                <strong>Access:</strong> request a copy of the data we hold about you.
              </li>
              <li>
                <strong>Correction:</strong> request that we correct inaccurate or incomplete data.
              </li>
              <li>
                <strong>Deletion:</strong> request that we delete your personal data, subject to
                legal retention requirements.
              </li>
              <li>
                <strong>Objection:</strong> object to the processing of your data for marketing
                purposes at any time.
              </li>
              <li>
                <strong>Portability:</strong> request your data in a structured, machine-readable
                format.
              </li>
            </ul>
            <p style={bodyStyle}>
              To exercise any of these rights, email us at{' '}
              <a
                href="mailto:privacy@healthyjewelry.com"
                style={{ color: 'var(--ink)', textDecoration: 'underline' }}
              >
                privacy@healthyjewelry.com
              </a>
              . We will respond within 30 days.
            </p>
          </div>

          {/* 5. Contact */}
          <div>
            <h2 style={sectionHeadStyle}>Contact</h2>
            <p style={bodyStyle}>For privacy-related inquiries, contact our Privacy Team:</p>
            <p style={bodyStyle}>
              <strong>Email:</strong>{' '}
              <a
                href="mailto:privacy@healthyjewelry.com"
                style={{ color: 'var(--ink)', textDecoration: 'underline' }}
              >
                privacy@healthyjewelry.com
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
