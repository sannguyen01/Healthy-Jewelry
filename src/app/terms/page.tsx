import type { Metadata } from 'next'
import { Nav } from '@/components/layout/Nav'
import { Footer } from '@/components/layout/Footer'
import { BrowseOnlyNotice } from '@/components/ui/BrowseOnlyNotice'
import { PageHeader } from '@/components/ui/PageHeader'
import { CONTACT_EMAIL, ORDER_REFERENCE_HINT, SITE_DOMAIN } from '@/config/site'

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
          <PageHeader eyebrow="Terms" title="Terms of Service" variant="compact" />
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
          <BrowseOnlyNotice />

          {/* 1. Acceptance */}
          <div>
            <h2 style={sectionHeadStyle}>Acceptance of Terms</h2>
            <p style={bodyStyle}>
              By accessing or using the Healthy Jewelry website ({SITE_DOMAIN}), you agree to be
              bound by these Terms of Service. If you do not agree, please do not use our site or
              services.
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
              {/*
                This paragraph has been wrong twice, in two different ways, and both are
                worth remembering because a sentence has no type checker.

                It first said prices were "in US Dollars (USD)" while the store charged
                VND — the same defect the code carried until `HJProduct.currencyCode` was
                threaded end to end. That was corrected to "the currency shown at
                checkout", which was right until there was no checkout.

                Naming a currency in legal copy means re-editing legal copy whenever the
                store's changes. Naming a *checkout* means re-editing it whenever the
                selling model does. This names neither, because this site now publishes no
                price at all — see BROWSE_ONLY_STATEMENT in src/config/site.ts.
              */}
              This site publishes no prices. What a piece costs, in which currency, and how
              it is paid for are settled in the conversation with your ambassador before
              anything is agreed. Nothing on this website constitutes an offer to sell or a
              quotation.
            </p>
            <p style={bodyStyle}>
              Product imagery is illustrative. Where a piece has not yet been photographed its
              listing shows a line drawing rather than a photograph, so finishes — anodized
              niobium color in particular — are not depicted. Where a photograph is shown, colors
              may still vary with your screen settings. All dimensions listed are approximate.
            </p>
          </div>

          {/* 3. How a piece is arranged */}
          <div>
            <h2 style={sectionHeadStyle}>How a Piece Is Arranged</h2>
            {/*
              This section described a cart, an order-confirmation email, "pricing errors
              on the website" and a refund to "your original payment method" — an entire
              order lifecycle this site cannot begin. It is replaced rather than deleted:
              a customer arranging a piece still needs to know when the arrangement becomes
              binding and on what grounds it can be declined.
            */}
            <p style={bodyStyle}>
              Browsing this catalogue creates no obligation on either side. An arrangement
              exists only once it has been confirmed directly with a Healthy Jewelry
              ambassador, in writing, including the piece, the size, the price and the
              delivery address.
            </p>
            <p style={bodyStyle}>An arrangement may be declined before it is confirmed where:</p>
            <ul style={listStyle}>
              <li>the piece is unavailable or is no longer made</li>
              <li>the delivery address cannot be served</li>
              <li>the request appears fraudulent</li>
            </ul>
            <p style={bodyStyle}>
              If an arrangement is declined after payment has been made, the amount paid is
              returned in full by the same method within 5–7 business days.
            </p>
          </div>

          {/* 4. Payment */}
          <div>
            <h2 style={sectionHeadStyle}>Payment</h2>
            {/*
              This listed Visa, Mastercard, PayPal and bank transfer as accepted methods and
              said "all transactions are processed securely. We do not store your full card
              details on our servers." Both sentences were true of a storefront with a
              hosted checkout and neither is true of this one: nothing on this site takes a
              payment, so listing methods it accepts is a claim about a capability it does
              not have.
            */}
            <p style={bodyStyle}>
              No payment is taken on this website. There is no checkout, no cart, and no
              payment form; this site holds no card details and never has any to hold.
            </p>
            <p style={bodyStyle}>
              Payment for a piece is arranged directly with your ambassador, who will tell
              you which methods are available and issue a receipt. Anyone asking you to pay
              through a form on this domain is not acting for Healthy Jewelry — please
              report it to{' '}
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                style={{ color: 'var(--ink)', textDecoration: 'underline' }}
              >
                {CONTACT_EMAIL}
              </a>
              .
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
                fontWeight: 500,
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
                href={`mailto:${CONTACT_EMAIL}`}
                style={{ color: 'var(--ink)', textDecoration: 'underline' }}
              >
                {CONTACT_EMAIL}
              </a>{' '}
              with {ORDER_REFERENCE_HINT} and a description of the issue.
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
                href={`mailto:${CONTACT_EMAIL}`}
                style={{ color: 'var(--ink)', textDecoration: 'underline' }}
              >
                {CONTACT_EMAIL}
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
                href={`mailto:${CONTACT_EMAIL}`}
                style={{ color: 'var(--ink)', textDecoration: 'underline' }}
              >
                {CONTACT_EMAIL}
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
