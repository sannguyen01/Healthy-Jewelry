import type { Metadata } from 'next'
import { Nav } from '@/components/layout/Nav'
import { Footer } from '@/components/layout/Footer'
import { PageHeader } from '@/components/ui/PageHeader'
import { LEGAL_EMAIL, LEGAL_ENTITY_NAME, SITE_DOMAIN } from '@/config/site'

export const metadata: Metadata = {
  title: 'Legal Notice',
  description:
    `Legal notice for ${LEGAL_ENTITY_NAME}. Company information, intellectual property, trademarks, and disclaimer of warranties.`,
}

const sectionHeadStyle: React.CSSProperties = {
  fontFamily: 'var(--font-title)',
  fontWeight: 400,
  fontSize: 'var(--text-xl, 1.4rem)',
  letterSpacing: 'var(--tracking-title)',
  color: 'var(--ink)',
  margin: '0 0 16px',
}

const bodyStyle: React.CSSProperties = {
  fontFamily: 'var(--font-body)',
  fontSize: 'var(--text-base)',
  color: 'var(--graphite)',
  lineHeight: 1.75,
  fontWeight: 400,
  margin: '0 0 16px',
}

export default function LegalPage() {
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
              <strong>Company name:</strong> {LEGAL_ENTITY_NAME}
              <br />
              <strong>Website:</strong> {SITE_DOMAIN}
              <br />
              <strong>Contact:</strong>{' '}
              <a
                href={`mailto:${LEGAL_EMAIL}`}
                style={{ color: 'var(--ink)', textDecoration: 'underline' }}
              >
                {LEGAL_EMAIL}
              </a>
            </p>
            {/*
              "specializing in implant-grade metals" until 2026-09-26. The rest of this page is
              a legal instrument and is WS-H's to revise; this was the one sentence in it that
              asserted a regulatory property of the metals rather than a legal fact, so it is
              the one sentence changed.
            */}
            <p style={bodyStyle}>
              {LEGAL_ENTITY_NAME} is a premium jewelry brand working in three metals: Grade 23
              Titanium, Niobium, and 316L Surgical Steel.
            </p>
          </div>

          {/* Intellectual property */}
          <div>
            <h2 style={sectionHeadStyle}>Intellectual Property</h2>
            <p style={bodyStyle}>
              All content on {SITE_DOMAIN} — including but not limited to text, photography,
              graphics, product designs, logos, page layouts, and source code — is the exclusive
              property of {LEGAL_ENTITY_NAME} and is protected under applicable copyright law and
              applicable international treaties.
            </p>
            <p style={bodyStyle}>© 2026 {LEGAL_ENTITY_NAME}. All rights reserved.</p>
            <p style={bodyStyle}>
              No part of this website or its content may be reproduced, distributed, transmitted,
              modified, adapted, publicly displayed, or otherwise exploited without the prior
              written permission of {LEGAL_ENTITY_NAME}. Requests for licensing or permitted use should
              be directed to{' '}
              <a
                href={`mailto:${LEGAL_EMAIL}`}
                style={{ color: 'var(--ink)', textDecoration: 'underline' }}
              >
                {LEGAL_EMAIL}
              </a>
              .
            </p>
          </div>

          {/* Trademark */}
          <div>
            <h2 style={sectionHeadStyle}>Trademark Notice</h2>
            <p style={bodyStyle}>
              &ldquo;{LEGAL_ENTITY_NAME}&rdquo; and the {LEGAL_ENTITY_NAME} logotype are trademarks of
              {' '}{LEGAL_ENTITY_NAME}. The tagline &ldquo;Metal that works with your body&rdquo; is the
              proprietary brand copy of {LEGAL_ENTITY_NAME}. Use of these marks without explicit written
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
              The content on {SITE_DOMAIN} is provided for informational purposes. While we make
              every effort to ensure accuracy, we make no representations or warranties of any kind,
              express or implied, regarding the completeness, accuracy, reliability, or availability
              of the information on this site.
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
                href={`mailto:${LEGAL_EMAIL}`}
                style={{ color: 'var(--ink)', textDecoration: 'underline' }}
              >
                {LEGAL_EMAIL}
              </a>
              <br />
              <strong>Address:</strong> {LEGAL_ENTITY_NAME}
            </p>
          </div>
        </section>
      </main>
      <Footer />
    </>
  )
}
