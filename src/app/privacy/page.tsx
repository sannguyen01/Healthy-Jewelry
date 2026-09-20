import type { Metadata } from 'next'
import { Nav } from '@/components/layout/Nav'
import { Footer } from '@/components/layout/Footer'
import { PageHeader } from '@/components/ui/PageHeader'
import { PRIVACY_EMAIL } from '@/config/site'

export const metadata: Metadata = {
  title: 'Privacy Policy',
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
          <PageHeader eyebrow="Privacy" title="Privacy Policy" variant="compact" />
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
            {/*
              Split into two lists on 2026-09-20, and the split is the correction.

              This section claimed the site collects "your name as provided during
              checkout" and an "Order data" category covering items purchased, order
              amounts, delivery addresses and payment method type. There is no checkout on
              this site and never a payment; it takes a contact form, an analytics beacon
              and an IP address for rate limiting, and that is the whole of it.

              Over-claiming in a privacy policy is the legally safer direction and it is
              still wrong: the point of the document is that a visitor can find out what
              actually happens to their data, and a list padded with categories the site
              does not hold makes the ones it does hold harder to see. What was true of the
              old list is true of the brand rather than the website, so it is stated as
              that instead of being deleted.
            */}
            <p style={bodyStyle}>
              <strong>This website</strong> collects only the following:
            </p>
            <ul style={listStyle}>
              <li>
                <strong>Contact data:</strong> the name, email address and message you send
                through the contact form. Nothing else on this site asks for a name.
              </li>
              <li>
                <strong>Technical data:</strong> IP address, browser type, pages visited,
                referring URL, time on site. Your IP address is also used, hashed and
                short-lived, to rate-limit the contact form and site search against abuse.
              </li>
            </ul>
            <p style={bodyStyle}>
              There is no cart, no checkout and no account on this site, so it holds no order
              history, no delivery address and no payment details of any kind.
            </p>
            <p style={bodyStyle}>
              <strong>Separately, when you arrange a piece with an ambassador</strong>,
              Healthy Jewelry holds what that arrangement requires: your name, the piece, the
              amount agreed, a delivery address, and the method of payment — never full card
              numbers, which are handled by the payment provider and never reach us.
            </p>
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
                <strong>Fulfilment:</strong> to pack, ship and confirm a piece you have
                arranged with an ambassador. Nothing on this website initiates this.
              </li>
              <li>
                <strong>Customer service:</strong> to respond to your enquiries and resolve
                any issues with a piece you hold.
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
              We do not sell your personal data to third parties. We may share data with
              trusted service providers — shipping carriers and payment processors for a
              piece you have arranged, and an email platform for the contact form — solely to
              operate our business. These providers are contractually bound to protect your
              data.
            </p>
          </div>

          {/* 3. Cookies */}
          <div>
            <h2 style={sectionHeadStyle}>Cookies</h2>
            {/*
              The session-cookie example was "maintaining your shopping cart". There is no
              cart: `src/store/` and the persisted bag went with the commerce UI in PR #82,
              and `/cart` answers 308. Naming a cookie's purpose that does not exist makes
              the whole list unverifiable — a reader has no way to tell which of the two
              entries is current.
            */}
            <p style={bodyStyle}>We use two types of cookies:</p>
            <ul style={listStyle}>
              <li>
                <strong>Session cookies:</strong> essential for site functionality, such as
                remembering whether you have answered the analytics consent prompt. These
                expire when you close your browser. Nothing on this site keeps a basket, a
                saved list or a signed-in session, because none of those exist here.
              </li>
              <li>
                <strong>Analytics cookies:</strong> used to understand aggregate traffic
                patterns. These do not identify you personally, and nothing is sent until you
                have opted in. You may opt out at any time via your browser settings or the
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
                href={`mailto:${PRIVACY_EMAIL}`}
                style={{ color: 'var(--ink)', textDecoration: 'underline' }}
              >
                {PRIVACY_EMAIL}
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
                href={`mailto:${PRIVACY_EMAIL}`}
                style={{ color: 'var(--ink)', textDecoration: 'underline' }}
              >
                {PRIVACY_EMAIL}
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
