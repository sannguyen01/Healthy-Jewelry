interface CampaignBandProps {
  headline?: string
  subline?: string
}

export function CampaignBand({
  headline = 'SCIENCE BEFORE AESTHETICS.',
  subline = 'GRADE 23 TITANIUM · NIOBIUM · 316L SURGICAL STEEL',
}: CampaignBandProps) {
  return (
    <section
      className="campaign-band"
      style={{
        backgroundColor: 'var(--black)',
        padding: `clamp(56px, 8vw, 96px) var(--space-gutter, clamp(20px,4vw,64px))`,
      }}
    >
      <div
        style={{
          maxWidth: '960px',
          margin: '0 auto',
          textAlign: 'center',
        }}
      >
        <h2
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'var(--text-display, clamp(2.4rem, 6vw, 4.5rem))',
            color: 'var(--bg)',
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            margin: '0 0 20px',
            lineHeight: 1,
          }}
        >
          {headline}
        </h2>
        <p
          style={{
            fontFamily: 'var(--font-ui)',
            fontSize: 'var(--text-sm, 0.8rem)',
            color: 'rgba(247,245,241,0.5)',
            letterSpacing: '0.2em',
            textTransform: 'uppercase',
            margin: 0,
          }}
        >
          {subline}
        </p>
      </div>
    </section>
  )
}

export default CampaignBand
