import Link from 'next/link'
import type { HJCollection } from '@/lib/shopify/types'

interface CollectionCardProps {
  collection: HJCollection
}

export function CollectionCard({ collection }: CollectionCardProps) {
  return (
    <Link
      href={`/shop/${collection.handle}`}
      aria-label={`View ${collection.title} collection`}
      style={{
        display: 'block',
        position: 'relative',
        overflow: 'hidden',
        textDecoration: 'none',
        backgroundColor: 'var(--nacre)',
        padding: '32px',
      }}
    >
      {/* Text content */}
      <div>
        <span className="label-eyebrow" style={{ marginBottom: '8px', display: 'block' }}>
          {collection.count} pieces
        </span>
        <h3
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'var(--text-xl)',
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: 'var(--ink)',
            lineHeight: 1.2,
            margin: '0 0 8px',
          }}
        >
          {collection.title}
        </h3>
        <p
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: 'var(--text-sm)',
            color: 'var(--graphite)',
            fontWeight: 300,
            margin: 0,
          }}
        >
          {collection.description}
        </p>
      </div>
    </Link>
  )
}

export default CollectionCard
