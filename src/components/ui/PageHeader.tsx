import type { CSSProperties } from 'react'

/**
 * The eyebrow + title block every non-homepage route opens with.
 *
 * It exists because nine pages each inlined their own `<h1>` styles and drifted
 * apart: the same element was rendering at weight 700, 300 and 500 on different
 * routes, across two font sizes, with only the homepage asking for a weight the
 * site actually downloads. Centralising the definition is what stops that
 * recurring — a page can no longer invent a heading treatment by accident.
 *
 * Weight is deliberately fixed at 500 and not exposed as a prop.
 * `src/app/layout.tsx` loads Barlow Condensed at 400 and 500 only, so anything
 * heavier is synthesised by the browser: it smears the strokes of the nearest
 * face and distorts the letterform proportions, which is why those pages read
 * as a different typeface. `src/tests/unit/typography-weights.test.ts` enforces
 * that no code asks for a weight the loader does not provide.
 */

/**
 * Two tiers, chosen by what the page is for — not by how important it felt at
 * the time it was written:
 *
 * - `display` — brand and marketing routes (Our Story, Contact, Materials,
 *   Stores). Large statement headline.
 * - `compact` — utility and legal routes (FAQ, Shipping, Terms, Privacy,
 *   Legal). Same treatment, smaller, so a policy page does not shout.
 */
export type PageHeaderVariant = 'display' | 'compact'

interface PageHeaderProps {
  title: string
  /** Small uppercase label above the title. Omit for pages that have none. */
  eyebrow?: string
  variant?: PageHeaderVariant
  /** Extra space below the block, when a page needs more room than the default. */
  style?: CSSProperties
}

const VARIANT_STYLES: Record<PageHeaderVariant, CSSProperties> = {
  display: {
    fontSize: 'var(--text-display)',
    lineHeight: 1.05,
    marginBottom: '32px',
  },
  compact: {
    fontSize: 'var(--text-2xl)',
    lineHeight: 1.1,
    marginBottom: '24px',
  },
}

export function PageHeader({ title, eyebrow, variant = 'display', style }: PageHeaderProps) {
  const { marginBottom, ...typeStyles } = VARIANT_STYLES[variant]

  return (
    <div style={{ marginBottom, ...style }}>
      {eyebrow && (
        <p className="label-eyebrow" style={{ marginBottom: '24px' }}>
          {eyebrow}
        </p>
      )}

      <h1
        style={{
          fontFamily: 'var(--font-display)',
          // 500 is the heaviest Barlow Condensed face the app loads. See the
          // note above before changing this.
          fontWeight: 500,
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
          color: 'var(--ink)',
          margin: 0,
          ...typeStyles,
        }}
      >
        {title}
      </h1>
    </div>
  )
}

export default PageHeader
