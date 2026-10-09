import Link from 'next/link'
import { footerGroups, legalLinks, socialLinks } from '@/config/navigation'
import { FooterGroup } from '@/components/layout/FooterGroup'
import { BrandLockup } from '@/components/layout/BrandLockup'
import { MeasurementPreferences } from '@/components/analytics/MeasurementPreferences'
import { claimText } from '@/lib/catalog'
import { LEGAL_ENTITY_NAME } from '@/config/site'

/**
 * The positioning line, twice below. "Metal that works with your body" is a
 * biocompatibility claim pending in the registry, so both places render its brand-voice
 * fallback until it is approved. Resolved once per render; a server component, so the
 * registry never reaches the browser.
 */
function tagline(): string {
  return claimText('brand-positioning', { kind: 'site' })
}

// The board's column head: a label in ink-2, not a second paragraph colour (ADR 051).
const columnHeadStyle: React.CSSProperties = {
  fontFamily: 'var(--font-ui)',
  fontWeight: 500,
  fontSize: 'var(--text-label)',
  letterSpacing: 'var(--tracking-label)',
  textTransform: 'uppercase' as const,
  color: 'var(--ink-2)',
}

const linkStyle: React.CSSProperties = {
  display: 'block',
  fontFamily: 'var(--font-body)',
  fontWeight: 300,
  fontSize: 'var(--text-sm)',
  color: 'var(--graphite)',
  textDecoration: 'none',
  // 12px above and below clears the 44px touch target on a 0.85rem line.
  padding: '12px 0',
  marginBottom: 0,
  transition: 'color var(--duration-fast) var(--ease)',
}

export function Footer() {
  return (
    <footer
      role="contentinfo"
      style={{
        backgroundColor: 'var(--bg)',
        borderTop: '1px solid var(--ash)',
        padding: 'var(--space-section) var(--space-gutter)',
      }}
    >
      <div
        style={{
          maxWidth: '1200px',
          margin: '0 auto',
        }}
      >
        {/* Top: brand + columns */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1.4fr repeat(3, 1fr)',
            gap: 'clamp(32px, 4vw, 64px)',
            alignItems: 'start',
            marginBottom: 'clamp(40px, 5vw, 64px)',
          }}
          className="hj-footer-grid"
        >
          {/* Brand column */}
          <div className="hj-brand-col">
            <BrandLockup
              variant="stacked"
              style={{
                padding: '12px 0',
                // The name as the footer set it before the Songmont reference: 1.1rem, 0.12em,
                // capitals, and 400 — the face it rendered at, since it declared no weight and
                // the body's 300 fell to the nearest real one. Its face, Barlow Condensed, is set
                // on the name itself by .hj-lockup-text in globals.css (ADR 048).
                fontWeight: 400,
                fontSize: '1.1rem',
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                color: 'var(--ink)',
                marginBottom: '4px',
              }}
            />
            <p
              style={{
                fontFamily: 'var(--font-body)',
                fontWeight: 300,
                fontSize: 'var(--text-sm)',
                color: 'var(--graphite)',
                maxWidth: '280px',
                lineHeight: 'var(--leading-long)',
              }}
            >
              {tagline()} Grade 23 titanium, niobium and 316L surgical steel.
            </p>
            <nav
              aria-label="Social"
              // -8px: each link carries 8px of side padding for its tap target, so the row is
              // pulled back by the same amount to line its text up with the column above.
              style={{ display: 'flex', flexWrap: 'wrap', gap: '0 4px', margin: '12px 0 0 -8px' }}
            >
              {socialLinks.map((link) => (
                <a
                  key={link.label}
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ ...linkStyle, display: 'inline-block', padding: '12px 8px' }}
                >
                  {link.label}
                </a>
              ))}
            </nav>
          </div>

          {/* Disclosure columns */}
          {footerGroups.map((group) => (
            <FooterGroup key={group.title} title={group.title} headStyle={columnHeadStyle}>
              {group.links.map((link) =>
                link.external ? (
                  <a
                    key={link.label}
                    href={link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={linkStyle}
                  >
                    {link.label}
                  </a>
                ) : (
                  <Link key={link.label} href={link.href} style={linkStyle}>
                    {link.label}
                  </Link>
                )
              )}
            </FooterGroup>
          ))}

          {/* Legal column */}
          <FooterGroup title="Legal" headStyle={columnHeadStyle}>
            {legalLinks.map((link) => (
              <Link key={link.href} href={link.href} style={linkStyle}>
                {link.label}
              </Link>
            ))}
          </FooterGroup>
        </div>

        {/* Bottom bar */}
        <div
          style={{
            paddingTop: '24px',
            borderTop: '1px solid var(--ash)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '12px',
          }}
        >
          <span
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: 'var(--text-xs)',
              lineHeight: 'var(--leading-text)',
              color: 'var(--ink-2)',
            }}
          >
            {/* The registered company, not the display name: see LEGAL_ENTITY_NAME. */}
            © 2026 {LEGAL_ENTITY_NAME}
          </span>
          {/*
            Withdrawing consent has to be as easy as giving it, and the prompt that gave it
            appears once. This reopens it from every page (CONSENT_OPEN_EVENT in
            src/lib/analytics/consent.ts). It lives in the bottom bar rather than a link group
            because the groups collapse on phones, and a control that is one tap further away
            when you want to leave than when you arrived is not as easy. A <button>
            underneath, since it opens something rather than going anywhere.
          */}
          <MeasurementPreferences
            style={{
              ...linkStyle,
              fontSize: 'var(--text-xs)',
              lineHeight: 'var(--leading-text)',
              // The 44px target is stated, not left to padding plus a line box: it was 13px of padding
              // round an 18px line until the type and the leading moved onto their scales, and the
              // box came out 42px on a phone. A control's size is its own declaration.
              display: 'inline-flex',
              alignItems: 'center',
              minHeight: '44px',
              padding: '12px 0',
              color: 'var(--ink-2)',
              textDecoration: 'underline',
              textUnderlineOffset: '3px',
              textAlign: 'left',
            }}
          />
          <span
            style={{
              fontFamily: 'var(--font-ui)',
              fontWeight: 500,
              fontSize: 'var(--text-xs)',
              letterSpacing: 'var(--tracking-label)',
              textTransform: 'uppercase',
              color: 'var(--titanium-text)',
            }}
          >
            {tagline()}
          </span>
        </div>
      </div>

      <style>{`
        .footer-summary {
          list-style: none;
        }
        .footer-summary::-webkit-details-marker {
          display: none;
        }
        .footer-icon {
          display: none;
        }
        .footer-group-inner {
          padding-top: 16px;
        }

        @media (min-width: 769px) {
          .footer-summary {
            margin-bottom: 16px;
            display: block;
            pointer-events: none;
          }
        }

        @media (max-width: 768px) {
          .hj-footer-grid {
            grid-template-columns: 1fr !important;
            gap: 0 !important;
          }
          .hj-brand-col {
            margin-bottom: 32px;
          }
          
          .footer-group {
            border-top: 1px solid var(--ash);
          }
          .footer-summary {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 16px 0;
            cursor: pointer;
            margin-bottom: 0;
          }
          .footer-icon {
            display: inline-block;
            font-size: var(--text-lg);
            transition: transform var(--duration-fast) var(--ease);
            font-weight: 300;
            /* A symbol is not tracked. It inherited the summary's label tracking as a length, which
               made the glyph "running text, tracked" and left a gap after it that pulled the plus
               off the right edge and off the centre it rotates about. */
            letter-spacing: 0;
          }
          
          .footer-group-inner {
            padding-top: 0;
            padding-bottom: 16px;
          }
          .footer-group:not([open]) .footer-group-inner {
            display: none;
          }
          .footer-group[open] .footer-icon {
            transform: rotate(45deg);
          }
        }
      `}</style>
    </footer>
  )
}

export default Footer
