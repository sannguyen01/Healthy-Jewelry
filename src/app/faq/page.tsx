import type { Metadata } from 'next'
import { Nav } from '@/components/layout/Nav'
import { Footer } from '@/components/layout/Footer'
import { CartDrawer } from '@/components/layout/CartDrawer'

export const metadata: Metadata = {
  title: 'FAQ — Healthy Jewelry',
  description:
    'Frequently asked questions about Healthy Jewelry. Materials, care, sizing, and orders.',
}

interface QAItem {
  q: string
  a: string
}

interface Section {
  title: string
  items: QAItem[]
}

const sections: Section[] = [
  {
    title: 'Materials',
    items: [
      {
        q: 'Is Grade 23 Titanium really safe?',
        a: 'Yes. Grade 23 Titanium (Ti-6Al-4V ELI — Extra Low Interstitial) is the same alloy used in hip replacements, bone screws, dental implants, and spinal surgery hardware. It is the gold standard for implantable medical devices because the human body simply does not react to it. No corrosion, no leaching, no sensitization.',
      },
      {
        q: 'What is niobium?',
        a: 'Niobium is a soft, lustrous transition metal that is completely biocompatible and nickel-free. It is naturally hypoallergenic and is one of the safest metals for people with metal sensitivities. We anodize our niobium pieces to create vivid colors without any dyes or coatings — the color comes from a thin oxide layer on the metal itself.',
      },
      {
        q: 'Can I wear it in water?',
        a: 'Yes. All three of our materials — Grade 23 Titanium, Niobium, and 316L Surgical Steel — are fully waterproof. You can shower, swim, and exercise without removing your jewelry. Salt water and chlorine will not affect implant-grade metals under normal exposure conditions.',
      },
      {
        q: 'Is it MRI-safe?',
        a: 'Titanium and niobium are non-ferromagnetic, meaning they are not attracted to MRI magnetic fields and will not cause interference or artifact in most MRI scans. 316L surgical steel is also considered MRI-conditional. However, always inform your radiologist or medical team about any jewelry or metal you are wearing before an MRI procedure. Removal is always the safest option when possible.',
      },
    ],
  },
  {
    title: 'Care',
    items: [
      {
        q: 'How do I clean my jewelry?',
        a: 'Rinse with warm water and mild soap, then pat dry with a soft cloth. For deeper cleaning, you can soak titanium and surgical steel pieces in warm soapy water for a few minutes. Avoid harsh chemicals, bleach, and abrasive cleaners. Niobium can be cleaned the same way — the anodized color is durable and will not wash off.',
      },
      {
        q: 'Will it scratch or tarnish?',
        a: 'Titanium is highly scratch-resistant due to its hardness (Mohs ~6). Niobium is softer and may show fine surface scratches over time, but it will not tarnish or corrode. 316L surgical steel is also corrosion-resistant and maintains its finish well. None of our materials will tarnish, rust, or discolor under normal wear conditions.',
      },
      {
        q: 'Can I wear it 24/7?',
        a: 'Yes. All of our jewelry is designed for continuous wear. Implant-grade materials are used precisely because they withstand prolonged contact with the body. There is no need to remove your Healthy Jewelry for sleep, exercise, or bathing.',
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
    title: 'Orders',
    items: [
      {
        q: 'How long does shipping take?',
        a: 'International orders arrive in 7–14 business days. All orders ship free with no minimum order value.',
      },
      {
        q: 'Can I return or exchange?',
        a: 'Yes. We accept returns and exchanges within 30 days of delivery. Items must be unworn and in original condition. Email support@healthyjewelry.com with your order number to initiate a return or exchange. We provide a prepaid return label for all eligible orders.',
      },
    ],
  },
]

export default function FAQPage() {
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
            Support
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
              margin: 0,
            }}
          >
            Frequently Asked Questions
          </h1>
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
          {sections.map((section) => (
            <div key={section.title}>
              <p
                style={{
                  fontFamily: 'var(--font-ui)',
                  fontSize: '0.62rem',
                  letterSpacing: '0.22em',
                  textTransform: 'uppercase',
                  color: 'var(--titanium)',
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
                        fontSize: 'var(--text-lg, 1.1rem)',
                        letterSpacing: '0.04em',
                        textTransform: 'uppercase',
                        color: 'var(--ink)',
                        margin: '0 0 14px',
                        fontWeight: 600,
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
                fontSize: 'var(--text-xl, 1.3rem)',
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
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
