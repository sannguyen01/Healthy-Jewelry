import Link from 'next/link'
import { claimText } from '@/lib/catalog'

interface CampaignBandProps {
  headline?: string
  body?: string
}

/**
 * The body is a claim — "Grade 23 titanium passes through the body without reaction" — so
 * its default comes from the registry and renders the neutral fallback until a reviewer
 * approves it. A server component, which is what lets it read the registry directly.
 */
export function CampaignBand({
  headline = 'SCIENCE BEFORE AESTHETICS.',
  body = claimText('campaign-band', { kind: 'site' }),
}: CampaignBandProps) {
  return (
    <section
      className="campaign-band"
      style={{
        backgroundColor: 'var(--black)',
        padding: `clamp(64px, 9vw, 112px) var(--space-gutter)`,
      }}
    >
      <div style={{ maxWidth: '800px' }}>
        <h2
          style={{
            fontFamily: 'var(--font-display)',
            textTransform: 'uppercase',
            fontSize: 'var(--text-display)',
            fontWeight: 500,
            color: 'var(--bg)',
            letterSpacing: 'var(--tracking-display)',
            margin: '0 0 28px',
            lineHeight: 1,
          }}
        >
          {headline}
        </h2>
        <p
          style={{
            fontFamily: 'var(--font-body)',
            fontWeight: 300,
            fontSize: 'var(--text-lg)',
            color: 'rgba(247,245,241,0.6)',
            lineHeight: 'var(--leading-text)',
            margin: '0 0 36px',
            maxWidth: '520px',
          }}
        >
          {body}
        </p>
        <Link href="/materials" className="btn-ghost-dark">
          Read the science
        </Link>
      </div>
    </section>
  )
}

export default CampaignBand
