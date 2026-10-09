import type { Metadata } from 'next'
import { Nav } from '@/components/layout/Nav'
import { Footer } from '@/components/layout/Footer'
import { BrowseOnlyNotice } from '@/components/ui/BrowseOnlyNotice'
import { PageHeader } from '@/components/ui/PageHeader'
import { CONTACT_EMAIL, ORDER_REFERENCE_HINT, SITE_NAME, SUPPORT_EMAIL } from '@/config/site'
import { claimText } from '@/lib/catalog'

/**
 * Answers whose whole content was a claim come from the claims registry and render their
 * neutral fallback until a named reviewer approves the original wording against a document.
 * No question was dropped; one was rewritten because the question itself asserted the claim
 * ("Is it MRI-safe?"). Answers that restate shipping, returns or exchange terms are left
 * as they were — they are commercial terms for WS-H's legal review, held by count in
 * `legal-review-inventory.test.ts`, and are not this rewrite's to change.
 */
// An answer about one metal resolves against that metal; one about all three against the
// whole range, which only evidence spanning every material covers.
const SITE = { kind: 'site' } as const

export const metadata: Metadata = {
  title: 'FAQ',
  description:
    `Frequently asked questions about ${SITE_NAME}. Materials, care, sizing, and orders.`,
}

interface QAItem {
  q: string
  a: string
}

interface Section {
  title: string
  items: QAItem[]
}

/**
 * A function, not a constant: six answers resolve claims, and a claim is resolved at render
 * time — an approval that lapses, or one whose date arrives, changes this page on the next
 * render rather than on the next process start.
 */
const sections = (): Section[] => [
  {
    title: 'Materials',
    items: [
      {
        q: 'Is Grade 23 Titanium really safe?',
        a: claimText('faq-titanium-safety', { kind: 'material', material: 'titanium' }),
      },
      {
        q: 'What is niobium?',
        a: claimText('faq-niobium', { kind: 'material', material: 'niobium' }),
      },
      {
        q: 'Can I wear it in water?',
        a: claimText('faq-water', SITE),
      },
      {
        q: 'What about MRI scans?',
        a: claimText('faq-mri', SITE),
      },
    ],
  },
  {
    title: 'Care',
    items: [
      {
        q: 'How do I clean my jewelry?',
        // Care instructions stay; the closing "the anodized color is durable and will not
        // wash off" was a durability claim and is pending as `anodized-permanence`.
        a: 'Rinse with warm water and mild soap, then pat dry with a soft cloth. For deeper cleaning, you can soak titanium and surgical steel pieces in warm soapy water for a few minutes. Avoid harsh chemicals, bleach, and abrasive cleaners. Niobium can be cleaned the same way.',
      },
      {
        q: 'Will it scratch or tarnish?',
        a: claimText('faq-scratch-tarnish', SITE),
      },
      {
        q: 'Can I wear it 24/7?',
        a: claimText('faq-continuous-wear', SITE),
      },
    ],
  },
  {
    title: 'Sizing',
    items: [
      {
        q: 'How do I measure my ring size?',
        a: 'The most accurate method is to visit a local jeweler and have your finger measured with a ring sizer. Alternatively, wrap a thin strip of paper around the base of your finger, mark where it overlaps, measure the length in millimeters, and divide by 3.14 to get your diameter. Our size guide on each product page includes a full circumference-to-size conversion table.',
      },
      {
        q: "What if I'm between sizes?",
        a: 'If you fall between two sizes, we recommend sizing up for comfort, especially in warm climates where fingers tend to swell. Rings should slide on with slight resistance and come off with a bit of effort — they should never be loose. If you order the wrong size, we offer free size exchanges within 30 days.',
      },
    ],
  },
  {
    /*
     * Titled "Orders" and opening with shipping times, on a site that cannot take an
     * order. The first question a visitor now has is the one that was missing: *how do I
     * get one?* It goes first, and the two that survive keep their answers — a piece
     * arranged with an ambassador ships and returns on exactly the terms this page
     * already stated.
     */
    title: 'Getting a piece',
    items: [
      {
        q: 'How do I buy something?',
        a: `Not on this site — there is no cart and no checkout here. Pieces are arranged directly with a ${SITE_NAME} ambassador, who will confirm the size, the price and the delivery address with you in writing before anything is agreed. If you do not already know an ambassador, write to ${CONTACT_EMAIL} and we will put you in touch.`,
      },
      {
        q: 'Why are there no prices on the site?',
        a: 'Because a number published here would be a figure nobody could act on: this site takes no orders, so there is nothing for it to be the price of. What a piece costs is settled in the conversation with your ambassador, in the currency you will actually pay in.',
      },
      {
        q: 'How long does shipping take?',
        a: 'A confirmed arrangement is dispatched within 1 business day and arrives in 7–14 business days internationally. Shipping is free on every piece, with no minimum.',
      },
      {
        q: 'Can I return or exchange?',
        a: `Yes, on any piece however it was arranged. Returns and exchanges are accepted within 30 days of delivery; items must be unworn and in original condition. Email ${SUPPORT_EMAIL} with ${ORDER_REFERENCE_HINT} to start one. We provide a prepaid return label.`,
      },
    ],
  },
]

export default function FAQPage() {
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
            maxWidth: '900px',
          }}
        >
          <PageHeader eyebrow="Support" title="Frequently Asked Questions" variant="compact" />
          <div style={{ marginTop: '40px' }}>
            <BrowseOnlyNotice />
          </div>
        </section>

        {/* Divider */}
        <div
          style={{
            height: '1px',
            backgroundColor: 'var(--ash)',
            margin: '0 clamp(24px, 6vw, 120px)',
          }}
        />

        {/* Sections */}
        <section
          style={{
            padding: 'clamp(48px, 6vw, 80px) clamp(24px, 6vw, 120px)',
            maxWidth: '900px',
            display: 'flex',
            flexDirection: 'column',
            gap: '64px',
          }}
        >
          {sections().map((section) => (
            <div key={section.title}>
              <p
                style={{
                  fontFamily: 'var(--font-ui)',
                  fontWeight: 500,
                  fontSize: 'var(--text-xs)',
                  letterSpacing: '0.22em',
                  textTransform: 'uppercase',
                  color: 'var(--titanium-text)',
                  marginBottom: '32px',
                }}
              >
                {section.title}
              </p>

              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0',
                }}
              >
                {section.items.map((item, idx) => (
                  <div
                    key={idx}
                    style={{
                      padding: '28px 0',
                      borderBottom: '1px solid var(--ash)',
                    }}
                  >
                    <h2
                      style={{
                        fontFamily: 'var(--font-display)',
                        textTransform: 'uppercase',
                        fontSize: 'var(--text-lg, 1.1rem)',
                        letterSpacing: 'var(--tracking-title)',
                        color: 'var(--ink)',
                        margin: '0 0 14px',
                        fontWeight: 500,
                      }}
                    >
                      {item.q}
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
                      {item.a}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {/* Still have questions */}
          <div
            style={{
              backgroundColor: 'var(--nacre)',
              padding: 'clamp(32px, 4vw, 48px)',
            }}
          >
            <p
              style={{
                fontFamily: 'var(--font-display)',
                textTransform: 'uppercase',
                fontWeight: 500,
                fontSize: 'var(--text-xl, 1.3rem)',
                letterSpacing: 'var(--tracking-title)',
                color: 'var(--ink)',
                margin: '0 0 12px',
              }}
            >
              Still have questions?
            </p>
            <p
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: 'var(--text-base)',
                color: 'var(--graphite)',
                lineHeight: 1.7,
                fontWeight: 300,
                margin: '0 0 20px',
              }}
            >
              Our team responds within 24 hours on business days.
            </p>
            <a href="/contact" className="btn-ghost" style={{ display: 'inline-block' }}>
              Contact Us
            </a>
          </div>
        </section>
      </main>
      <Footer />
    </>
  )
}
