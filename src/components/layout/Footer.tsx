import Link from 'next/link'
import { legalLinks } from '@/config/navigation'

const shopLinks = [
  { label: 'Rings', href: '/shop/rings' },
  { label: 'Necklaces', href: '/shop/necklaces' },
  { label: 'Earrings', href: '/shop/earrings' },
  { label: 'Bracelets', href: '/shop/bracelets' },
]

const infoLinks = [
  { label: 'Our Story', href: '/about' },
  { label: 'Materials', href: '/materials' },
  { label: 'Contact', href: '/contact' },
]

const columnHeadStyle: React.CSSProperties = {
  fontFamily: 'var(--font-ui)',
  fontSize: '0.62rem',
  letterSpacing: '0.22em',
  textTransform: 'uppercase' as const,
  color: 'var(--graphite)',
  marginBottom: '16px',
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
            gridTemplateColumns: '1fr repeat(3, auto)',
            gap: 'clamp(32px, 4vw, 64px)',
            alignItems: 'start',
            marginBottom: 'clamp(40px, 5vw, 64px)',
          }}
          className="hj-footer-grid"
        >
          {/* Brand column */}
          <div>
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
              Metal that works with your body. Implant-grade titanium, niobium, and surgical steel.
            </p>
          </div>

          {/* Shop column */}
          <div>
            <p style={columnHeadStyle}>Shop</p>
            {shopLinks.map((link) => (
              <Link key={link.href} href={link.href} style={linkStyle}>
                {link.label}
              </Link>
            ))}
          </div>

          {/* Info column */}
          <div>
            <p style={columnHeadStyle}>Info</p>
            {infoLinks.map((link) => (
              <Link key={link.href} href={link.href} style={linkStyle}>
                {link.label}
              </Link>
            ))}
          </div>

          {/* Legal column */}
          <div>
            <p style={columnHeadStyle}>Legal</p>
            {legalLinks.map((link) => (
              <Link key={link.href} href={link.href} style={linkStyle}>
                {link.label}
              </Link>
            ))}
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
              color: 'var(--titanium)',
            }}
          >
            © 2026 Healthy Jewelry · Hà Nội, Việt Nam
          </span>
          <span
            style={{
              fontFamily: 'var(--font-ui)',
              fontSize: '0.65rem',
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: 'var(--titanium)',
              fontStyle: 'italic',
            }}
          >
            Metal that works with your body.
          </span>
        </div>
      </div>

      <style>{`
        @media (max-width: 768px) {
          .hj-footer-grid {
            grid-template-columns: 1fr 1fr !important;
          }
        }
        @media (max-width: 480px) {
          .hj-footer-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </footer>
  )
}

export default Footer
