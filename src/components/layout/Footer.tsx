import Link from 'next/link'
import { legalLinks } from '@/config/navigation'
import { SOCIAL_LINKS } from '@/config/site'
import { MeasurementPreferences } from '@/components/analytics/MeasurementPreferences'
import { claimText } from '@/lib/catalog'

/**
 * The positioning line, twice below. "Metal that works with your body" is a
 * biocompatibility claim pending in the registry, so both places render its brand-voice
 * fallback until it is approved. Resolved once per render; a server component, so the
 * registry never reaches the browser.
 */
function tagline(): string {
  return claimText('brand-positioning', { kind: 'site' })
}

const groups = [
  {
    title: 'Explore',
    links: [
      { label: 'Pieces', href: '/shop' },
      { label: 'Metals', href: '/materials' },
      { label: 'Our Story', href: '/about' },
    ],
  },
  {
    title: 'Help',
    links: [
      { label: 'Contact', href: '/contact' },
      { label: 'FAQ', href: '/faq' },
    ],
  },
  {
    title: 'Find us',
    links: [
      { label: 'Instagram', href: SOCIAL_LINKS.instagram },
      { label: 'TikTok', href: SOCIAL_LINKS.tiktok },
      { label: 'Pinterest', href: SOCIAL_LINKS.pinterest },
      { label: 'YouTube', href: SOCIAL_LINKS.youtube },
    ],
  },
]

const columnHeadStyle: React.CSSProperties = {
  fontFamily: 'var(--font-ui)',
  fontSize: '0.62rem',
  letterSpacing: '0.22em',
  textTransform: 'uppercase' as const,
  color: 'var(--graphite)',
}

const linkStyle: React.CSSProperties = {
  display: 'block',
  fontFamily: 'var(--font-body)',
  fontWeight: 300,
  fontSize: 'var(--text-sm, 0.85rem)',
  color: 'var(--graphite)',
  textDecoration: 'none',
  marginBottom: '10px',
  transition: 'color 0.2s ease',
}

export function Footer() {
  return (
    <footer
      role="contentinfo"
      style={{
        backgroundColor: 'var(--bg)',
        borderTop: '1px solid var(--ash)',
        padding: 'clamp(48px, 6vw, 80px) var(--space-gutter, clamp(20px,4vw,64px))',
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
            gridTemplateColumns: '1fr repeat(4, auto)',
            gap: 'clamp(32px, 4vw, 64px)',
            alignItems: 'start',
            marginBottom: 'clamp(40px, 5vw, 64px)',
          }}
          className="hj-footer-grid"
        >
          {/* Brand column */}
          <div className="hj-brand-col">
            <Link
              href="/"
              aria-label="Healthy Jewelry — home"
              style={{
                display: 'block',
                fontFamily: 'var(--font-display)',
                fontSize: '1.1rem',
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                color: 'var(--ink)',
                textDecoration: 'none',
                marginBottom: '16px',
              }}
            >
              Healthy Jewelry
            </Link>
            <p
              style={{
                fontFamily: 'var(--font-body)',
                fontWeight: 300,
                fontSize: 'var(--text-sm, 0.85rem)',
                color: 'var(--graphite)',
                maxWidth: '280px',
                lineHeight: 1.7,
              }}
            >
              {tagline()} Grade 23 titanium, niobium and 316L surgical steel.
            </p>
          </div>

          {/* Accordion Columns */}
          {groups.map((group, i) => (
            <div key={group.title} className="footer-group">
              <input
                type="checkbox"
                id={`footer-group-${i}`}
                className="footer-checkbox"
                aria-hidden="true"
              />
              <label
                htmlFor={`footer-group-${i}`}
                className="footer-summary"
                style={columnHeadStyle}
              >
                {group.title}
                <span className="footer-icon">+</span>
              </label>
              <div className="footer-group-content">
                <div className="footer-group-inner">
                  {group.links.map((link) =>
                    link.href.startsWith('http') ? (
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
                </div>
              </div>
            </div>
          ))}

          {/* Legal column */}
          <div>
            <p style={columnHeadStyle}>Legal</p>
            {legalLinks.map((link) => (
              <Link key={link.href} href={link.href} style={linkStyle}>
                {link.label}
              </Link>
            ))}
            {/*
              Withdrawing consent has to be as easy as giving it, and the prompt that gave it
              appears once. This reopens it from every page (CONSENT_OPEN_EVENT in
              src/lib/analytics/consent.ts). Styled as a link so the column reads as one list,
              and a <button> underneath because it opens something rather than going anywhere.
            */}
            <MeasurementPreferences
              style={{ ...linkStyle, textDecoration: 'none', textAlign: 'left' }}
            />
          </div>
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
              fontFamily: 'var(--font-ui)',
              fontSize: '0.65rem',
              letterSpacing: '0.12em',
              color: 'var(--titanium-text)',
            }}
          >
            © 2026 Healthy Jewelry
          </span>
          <span
            style={{
              fontFamily: 'var(--font-ui)',
              fontSize: '0.65rem',
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: 'var(--titanium-text)',
              fontStyle: 'italic',
            }}
          >
            {tagline()}
          </span>
        </div>
      </div>

      <style>{`
        .footer-checkbox {
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
            font-size: 1.2rem;
            transition: transform 0.3s ease-out;
            font-weight: 300;
          }
          
          .footer-group-content {
            display: grid;
            grid-template-rows: 0fr;
            transition: grid-template-rows 0.3s ease-out, opacity 0.3s ease-out;
            opacity: 0;
          }
          .footer-group-inner {
            min-height: 0;
            overflow: hidden;
            padding-top: 0;
          }
          
          .footer-checkbox:checked ~ .footer-group-content {
            grid-template-rows: 1fr;
            opacity: 1;
          }
          .footer-checkbox:checked ~ .footer-group-content .footer-group-inner {
            padding-bottom: 16px;
          }
          .footer-checkbox:checked ~ .footer-summary .footer-icon {
            transform: rotate(45deg);
          }
        }
      `}</style>
    </footer>
  )
}

export default Footer
