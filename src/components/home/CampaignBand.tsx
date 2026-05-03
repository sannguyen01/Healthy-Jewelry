import Link from 'next/link'

interface CampaignBandProps {
  headline?: string
  body?: string
}

export function CampaignBand({
  headline = 'SCIENCE BEFORE AESTHETICS.',
  body = 'Every piece engineered for biocompatibility. Grade 23 titanium passes through the body without reaction. That’s not a feature — it’s the foundation.',
}: CampaignBandProps) {
  return (
    <section
      className="campaign-band"
      style={{
        backgroundColor: 'var(--black)',
        padding: `clamp(64px, 9vw, 112px) var(--space-gutter, clamp(20px,4vw,64px))`,
      }}
    >
      <div style={{ maxWidth: '800px' }}>
        <h2
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'var(--text-display)',
            fontWeight: 500,
            color: 'var(--bg)',
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
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
            lineHeight: 1.65,
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
