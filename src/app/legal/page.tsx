import type { Metadata } from 'next'
import { Nav } from '@/components/layout/Nav'
import { Footer } from '@/components/layout/Footer'
import { CartDrawer } from '@/components/layout/CartDrawer'
import { PageHeader } from '@/components/ui/PageHeader'

export const metadata: Metadata = {
  title: 'Legal Notice',
  description:
    'Legal notice for Healthy Jewelry. Company information, intellectual property, trademarks, and disclaimer of warranties.',
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

export default function LegalPage() {
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
<PageHeader eyebrow="Legal" title="Legal Notice" variant="compact" />
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
          {/* Company info */}
          <div>
            <h2 style={sectionHeadStyle}>Company Information</h2>
            <p style={bodyStyle}>
              <strong>Company name:</strong> Healthy Jewelry
              <br />
              <strong>Website:</strong> healthyjewelry.com
              <br />
              <strong>Contact:</strong>{' '}
              <a
                href="mailto:legal@healthyjewelry.com"
                style={{ color: 'var(--ink)', textDecoration: 'underline' }}
              >
                legal@healthyjewelry.com
              </a>
            </p>
            <p style={bodyStyle}>
              Healthy Jewelry is a premium jewelry brand specializing in implant-grade metals: Grade
              23 Titanium, Niobium, and 316L Surgical Steel.
            </p>
          </div>

          {/* Intellectual property */}
          <div>
            <h2 style={sectionHeadStyle}>Intellectual Property</h2>
            <p style={bodyStyle}>
              All content on healthyjewelry.com — including but not limited to text, photography,
              graphics, product designs, logos, page layouts, and source code — is the exclusive
              property of Healthy Jewelry and is protected under applicable copyright law and
              applicable international treaties.
            </p>
            <p style={bodyStyle}>© 2026 Healthy Jewelry. All rights reserved.</p>
            <p style={bodyStyle}>
              No part of this website or its content may be reproduced, distributed, transmitted,
              modified, adapted, publicly displayed, or otherwise exploited without the prior
              written permission of Healthy Jewelry. Requests for licensing or permitted use should
              be directed to{' '}
              <a
                href="mailto:legal@healthyjewelry.com"
                style={{ color: 'var(--ink)', textDecoration: 'underline' }}
              >
                legal@healthyjewelry.com
              </a>
              .
            </p>
          </div>

          {/* Trademark */}
          <div>
            <h2 style={sectionHeadStyle}>Trademark Notice</h2>
            <p style={bodyStyle}>
              &ldquo;Healthy Jewelry&rdquo; and the Healthy Jewelry logotype are trademarks of
              Healthy Jewelry. The tagline &ldquo;Metal that works with your body&rdquo; is the
              proprietary brand copy of Healthy Jewelry. Use of these marks without explicit written
              authorization is prohibited.
            </p>
            <p style={bodyStyle}>
              All other trademarks, product names, and company names mentioned on this site are the
              property of their respective owners.
            </p>
          </div>

          {/* Disclaimer */}
          <div>
            <h2 style={sectionHeadStyle}>Disclaimer of Warranties</h2>
            <p style={bodyStyle}>
              The content on healthyjewelry.com is provided for informational purposes. While we
              make every effort to ensure accuracy, we make no representations or warranties of any
              kind, express or implied, regarding the completeness, accuracy, reliability, or
              availability of the information on this site.
            </p>
            <p style={bodyStyle}>
              Material science information provided on this site (including specifications for
              titanium, niobium, and surgical steel) is offered in good faith based on established
              metallurgical standards. This information is not a substitute for professional medical
              advice regarding biocompatibility for specific medical conditions. Consult a medical
              professional if you have concerns about metal sensitivity or implanted devices.
            </p>
            <p style={bodyStyle}>
              Our product warranty terms are set out in the{' '}
              <a href="/terms" style={{ color: 'var(--ink)', textDecoration: 'underline' }}>
                Terms of Service
              </a>
              . Nothing in this Legal Notice limits rights you may have under applicable consumer
              protection law.
            </p>
          </div>

          {/* Contact */}
          <div>
            <h2 style={sectionHeadStyle}>Legal Contact</h2>
            <p style={bodyStyle}>
              For legal matters, intellectual property inquiries, or trademark questions:
            </p>
            <p style={bodyStyle}>
              <strong>Email:</strong>{' '}
              <a
                href="mailto:legal@healthyjewelry.com"
                style={{ color: 'var(--ink)', textDecoration: 'underline' }}
              >
                legal@healthyjewelry.com
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
