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
 * Weight is deliberately fixed at 500 and not exposed as a prop: it is the display weight,
 * and anything else would be synthesised by the browser, smearing the strokes of the nearest
 * face until the page reads as a different typeface. Both variants are Barlow Condensed in
 * tracked capitals (ADR 052); they differ in size and tracking, not in face.
 * `typography-weights.test.ts` enforces that no code asks for a weight the loader does not
 * provide and that every display style declares its weight and its case.
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
    fontFamily: 'var(--font-display)',
    textTransform: 'uppercase',
    fontWeight: 500,
    fontSize: 'var(--text-display)',
    letterSpacing: 'var(--tracking-display)',
    lineHeight: 1.05,
    marginBottom: '32px',
  },
  compact: {
    fontFamily: 'var(--font-display)',
    textTransform: 'uppercase',
    fontWeight: 500,
    fontSize: 'var(--text-2xl)',
    letterSpacing: 'var(--tracking-title)',
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
