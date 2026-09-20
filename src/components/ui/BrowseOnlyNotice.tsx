import Link from 'next/link'
import { BROWSE_ONLY_STATEMENT } from '@/config/site'

/**
 * **The one statement every transactional page opens with.**
 *
 * `/terms`, `/shipping` and `/faq` each describe an order lifecycle — pricing, payment,
 * delivery, returns, exchanges. All three were written for a storefront that took orders,
 * and none was updated when PR #75 removed Add to Bag or when PR #82 retired `/cart`,
 * `/checkout` and `/account`. A visitor reading `/terms` today would find a list of
 * accepted payment methods on a site that processes no payments.
 *
 * ## Why a component and not three paragraphs
 *
 * The terms themselves survive the decommission and mostly should: a piece arranged with
 * an ambassador is still shipped, still returnable within thirty days, still under a
 * lifetime warranty against corrosion. What changed is **where an order comes from**, and
 * that is one fact stated on three pages — the exact shape that drifts silently, on the
 * exact kind of page where drift is a misrepresentation rather than a typo.
 *
 * ## Why it links rather than only asserting
 *
 * A notice that says "we do not take orders here" and stops converts a customer into a
 * dead end. `/contact` is the working alternative and it is one tap away, which is the
 * difference between a correction and a closure.
 */
export function BrowseOnlyNotice() {
  return (
    <aside
      aria-label="How to arrange a piece"
      style={{
        backgroundColor: 'var(--nacre)',
        border: '1px solid var(--ash)',
        borderLeft: '3px solid var(--titanium)',
        padding: 'clamp(20px, 3vw, 28px)',
        marginBottom: '48px',
      }}
    >
      <p
        style={{
          fontFamily: 'var(--font-body)',
          fontWeight: 300,
          fontSize: 'var(--text-base)',
          lineHeight: 1.7,
          color: 'var(--ink)',
          margin: '0 0 12px',
        }}
      >
        {BROWSE_ONLY_STATEMENT}
      </p>
      <p
        style={{
          fontFamily: 'var(--font-ui)',
          fontSize: 'var(--text-xs)',
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          margin: 0,
        }}
      >
        <Link href="/contact" style={{ color: 'var(--titanium-text)' }}>
          Contact an ambassador
        </Link>
      </p>
    </aside>
  )
}

export default BrowseOnlyNotice
