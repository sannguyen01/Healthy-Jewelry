import type { Metadata } from 'next'
import { Nav } from '@/components/layout/Nav'
import { Footer } from '@/components/layout/Footer'
import { PageHeader } from '@/components/ui/PageHeader'
import { CONTACT_EMAIL, PRIVACY_EMAIL } from '@/config/site'
import { CONSENT_STORAGE_KEY } from '@/lib/analytics/consent'
import { MeasurementPreferences } from '@/components/analytics/MeasurementPreferences'

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
          <p style={{ ...bodyStyle, color: 'var(--graphite)' }}>Last updated: 25 September 2026</p>
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
            {/*
              Corrected again on 2026-09-25, against the code rather than against the
              previous wording.

              "Technical data" listed browser type, pages visited, referring URL and time on
              site as things this site collects. It measures none of them: the only
              first-party records are three consent-gated events (src/lib/analytics/events.ts),
              and the rest is what the hosting platform sees when it serves a request, which
              is now said as that. The IP address was described as "hashed and short-lived"
              while both rate-limiter implementations keyed on the raw address; it is now
              pseudonymised in src/lib/utils/rateLimit.ts, and the sentence below describes
              both modes because which one is live is a deployment setting, reported by
              /api/health as ipKeying. The storage key is imported, not typed, so this page
              cannot drift from the code that sets it.

              Corrected on 2026-09-27: this bullet said search text was recorded, lower-cased
              and shortened to 64 characters. It no longer is — a search is reported as the
              collections and metals it named (searchFacets in src/lib/catalog), because an
              email address or an order number fits in 64 characters too.
            */}
            <ul style={listStyle}>
              <li>
                <strong>Contact data:</strong> the name, email address, subject and message you
                send through the contact form. It is delivered by email to our inbox at{' '}
                {CONTACT_EMAIL} and is not stored by this website. Nothing else on this site
                asks for a name.
              </li>
              <li>
                <strong>Measurement data, only if you allow it:</strong> which piece and
                collection pages are opened, and for a site search, how many results it found
                and which of our collections or metals it named. What you type into search is
                never recorded. No cookie, identifier or IP address is attached to these
                records, and nothing is sent until you choose Allow.
              </li>
              <li>
                <strong>Request data:</strong> when your browser asks for a page, our hosting
                provider receives what any web request carries — your IP address, the address
                requested, the time and your browser&apos;s user-agent — in order to serve it,
                and records it in its platform logs.
              </li>
              <li>
                <strong>Rate limiting:</strong> this website uses your IP address for one thing
                itself — limiting how often the contact form, site search and two technical
                endpoints can be called, to stop abuse. Before it is counted, the address is
                turned into a one-way key: an HMAC-SHA256 under a secret key when one is
                configured, or otherwise a SHA-256 hash with a fixed prefix. The second form
                is pseudonymous rather than anonymous — someone holding the key and this
                site&apos;s published code could work back to the address — so we do not call
                either form anonymous. The address itself is never written to the rate-limit
                store. The counters are temporary: in the shared counter store they expire
                automatically, at the latest about two hours after your last request, and
                where that store is not in use they exist only in the memory of the server
                that handled the request.
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
                <strong>Site improvement:</strong> to learn which pieces, collections and
                searches people look for, from the measurement data above — only if you have
                allowed it.
              </li>
              <li>
                <strong>Abuse prevention:</strong> to rate-limit the site&apos;s forms and
                endpoints, as described above.
              </li>
              <li>
                <strong>Legal compliance:</strong> to meet our obligations under applicable law.
              </li>
            </ul>
            <p style={bodyStyle}>
              We do not sell your personal data to third parties. This website passes data to
              three service providers, each for one purpose:
            </p>
            <ul style={listStyle}>
              <li>
                <strong>Vercel</strong> hosts the site. Its platform logs record the request
                data above, and the measurement records are written to its function logs,
                which is the only place they are kept.
              </li>
              <li>
                <strong>Upstash</strong> holds the temporary rate-limit counters, keyed by the
                one-way key described above and never by your address.
              </li>
              <li>
                <strong>Resend</strong> delivers contact-form messages by email to our inbox
                at {CONTACT_EMAIL}.
              </li>
            </ul>
            <p style={bodyStyle}>
              Separately, for a piece you have arranged with an ambassador, shipping carriers
              and payment processors receive what that arrangement requires. These providers
              are contractually bound to protect your data.
            </p>
          </div>

          {/* 3. Cookies and browser storage */}
          <div>
            <h2 style={sectionHeadStyle}>Cookies and Browser Storage</h2>
            {/*
              This section described "two types of cookies" — a session cookie remembering
              the consent answer and expiring with the browser, and analytics cookies — until
              2026-09-25. The site sets no cookie of either kind and never has: the consent
              answer is one localStorage entry (src/lib/analytics/consent.ts), deliberately
              not a cookie so it never travels with a request, and it persists until the
              visitor clears it rather than expiring at the end of a session. The first
              version of this comment recorded an earlier correction to the same list (its
              session-cookie example was "maintaining your shopping cart"); the list was
              wrong in a second way the whole time.
            */}
            <p style={bodyStyle}>
              This website sets no cookies — none for measurement, none for sessions and
              none for advertising.
            </p>
            <p style={bodyStyle}>
              It stores one thing in your browser: your answer to the measurement prompt,
              under the local-storage key &lsquo;{CONSENT_STORAGE_KEY}&rsquo;, with the value
              &ldquo;granted&rdquo; or &ldquo;denied&rdquo;. It is read only by your browser
              and is never sent to us.
            </p>
            {/*
              Until 2026-09-27 the only way to change the answer was to clear this site's data
              in the browser. Withdrawing consent has to be as easy as giving it, so the same
              prompt now reopens from "Measurement preferences" at the foot of every page and
              from the button below. `track()` reads the stored answer on every call, so a
              Decline stops the very next event. What it cannot do is reach back: records
              already written are not deleted by changing the answer, and the sentence says so
              rather than implying otherwise.
            */}
            <p style={bodyStyle}>
              You can change your answer at any time from &ldquo;Measurement preferences&rdquo;
              at the foot of every page, or here: <MeasurementPreferences />. Choosing Decline
              stops measurement from the next page you open. It does not delete records
              already made while measurement was allowed.
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
