import { type CSSProperties } from 'react'
import Link from 'next/link'
import { MetalDot } from '@/components/ui/MetalDot'
import { HeroPicture } from '@/components/home/HeroPicture'
import type { HeroMedia } from '@/lib/catalog'

interface HeroProps {
  /**
   * The art direction of this screen: the crop for a wide screen and for a narrow one, where each crop's
   * subject is, which corner the copy sits in, and where the photograph came from. A record in
   * `src/content/hero/`, read through the catalogue reader by the page that renders this.
   */
  media: HeroMedia
  /**
   * The headline, one entry per line, resolved by the page that renders this.
   *
   * It is the positioning line, and that line is a biocompatibility claim, pending in the claims registry.
   * The page resolves it through `claimLines()` and passes the result down, so this component never names a
   * claim or which wording it received. The lines come from the registry's own line-break hints.
   */
  headlineLines: readonly string[]
}

/** A normalised coordinate as a CSS percentage, without float noise (0.69 * 100 is 68.99999999999999). */
const percent = (n: number): string => `${Math.round(n * 10000) / 100}%`

/** The corner the copy sits in, as a grid alignment. */
const gridEdge = (zone: 'bottom-start' | 'bottom-end'): string => (zone === 'bottom-end' ? 'end' : 'start')

/**
 * The copy card's ceiling (ADR 013): a fraction of the photograph it sits on, so that the protection that
 * keeps the copy legible cannot grow until the photograph is decoration behind a floating memo.
 *
 * It is applied to `.hj-hero-copy`, which is a box only while the active crop is a card: under an overlay
 * that element is `display: contents`, so the bound has no box to bound and nothing needs to undo it. The
 * property line below is held verbatim, indentation included, by the sentinel `hero-card-measured`, which
 * replaces it with an unbounded card and requires the browser test to see the difference.
 */
const CARD_BOUND: CSSProperties = {
          maxWidth: 'calc(var(--hj-hero-card-max-ratio) * 100%)',
}

/** The position of a copy block in its entrance, read by `animation-delay` in the stylesheet. */
const step = (i: number): CSSProperties => ({ '--hj-i': i }) as CSSProperties

/**
 * The first screen: one image-led composition on every width (ADR 054).
 *
 * The photograph is the hero's geometry and begins under the fixed header. The header, the copy and the
 * actions are layered inside it, in zones the stylesheet defines from `--header-height`, the record's copy
 * corner and the consent notice's published height, not from offsets typed here. Nothing opaque sits between
 * the visitor and the photograph unless the record asks for a card.
 *
 * It is a server component, and its entrance is CSS (`hjSlideUp`, staggered by a token and removed under
 * `prefers-reduced-motion`). It was a client component for one reason, a timer that set every child to
 * `opacity: 0` after hydration and back to 1 over 440ms; with JavaScript off, late or blocked, that left the
 * copy where it started. Nothing here waits for a script now.
 *
 * Two attributes carry the variants (`data-variant-wide`, `data-variant-narrow`) rather than one, because the
 * server cannot know the viewport: the stylesheet picks by breakpoint.
 */
export function Hero({ media, headlineLines }: HeroProps) {
  const { desktop, mobile } = media
  // Only the wide crop can be a card: the schema makes the narrow one an overlay (a card bounded to a fraction of the
  // photograph is too narrow to read at a phone's width).
  const hasCard = desktop.variant === 'card'

  return (
    <section
      className="hj-hero"
      data-variant-wide={desktop.variant}
      data-variant-narrow={mobile.variant}
      style={
        {
          '--hj-focal-wide': `${percent(desktop.focal.x)} ${percent(desktop.focal.y)}`,
          '--hj-focal-narrow': `${percent(mobile.focal.x)} ${percent(mobile.focal.y)}`,
          '--hj-zone-wide': gridEdge(desktop.copyZone),
          '--hj-zone-narrow': gridEdge(mobile.copyZone),
        } as CSSProperties
      }
    >
      {/* The photograph. The wrapper is not hidden from assistive technology: the photograph has a literal
          description in the record. The header's veil is the header's own (ADR 054), not drawn here. */}
      <div className="hj-hero-media">
        <HeroPicture media={media} />
      </div>

      {/* The safe zone: clear of the header, the page's gutters and the consent notice. It is a grid whose last
          row is the copy, so the veil that makes the copy legible can share that row and be exactly as tall as
          the copy plus a fade above it, whatever size the copy is. */}
      <div className="hj-hero-safe">
        <div className="hj-hero-veil" data-edge="bottom" aria-hidden="true" />
        <div className="hj-hero-copy" style={hasCard ? CARD_BOUND : undefined}>
          <div className="hj-hero-content">
            {/* "Implant-Grade Titanium" until 2026-09-26: a regulatory claim in the first words a visitor
                reads. The eyebrow names the three metals by specification, behind the titanium dot the board
                puts at the head of the line. */}
            <span
              className="label-eyebrow"
              style={{ ...step(0), display: 'flex', alignItems: 'flex-start', gap: '10px', marginBottom: '28px' }}
            >
              <span style={{ paddingTop: '4px' }}>
                <MetalDot metal="titanium" />
              </span>
              {/* The words in an element of their own, so the box measured for legibility is the words' and
                  not the dot's: a pixel of --titanium is not what the text sits on. */}
              <span>Grade 23 Titanium · Niobium · 316L Steel</span>
            </span>

            <h1
              style={{
                ...step(1),
                fontFamily: 'var(--font-display)',
                textTransform: 'uppercase',
                fontSize: 'var(--text-hero)',
                fontWeight: 500,
                color: 'var(--hj-fg)',
                lineHeight: 'var(--leading-display)',
                letterSpacing: 'var(--tracking-display)',
                margin: '0 0 24px',
              }}
            >
              {/* The lines are the registry's own breaks, set as blocks and joined by a real space so the
                  heading reads as one sentence to anything that does not render the blocks. No <br>: the
                  line count is the content's and the width's, not forced by an element. */}
              {headlineLines.map((line, i) => (
                <span key={i}>
                  {i > 0 && ' '}
                  <span className="hj-hero-line">{line}</span>
                </span>
              ))}
            </h1>

            <p
              style={{
                ...step(2),
                fontFamily: 'var(--font-body)',
                fontWeight: 300,
                fontSize: 'var(--text-base)',
                color: 'var(--hj-fg-body)',
                margin: '0 0 40px',
                lineHeight: 'var(--leading-text)',
                maxWidth: '400px',
              }}
            >
              No stones. No fillers. Pure material integrity.
            </p>

            <div className="hj-hero-actions" style={step(3)}>
              <Link href="/shop" className="btn-primary">
                Explore the pieces
              </Link>
              <Link href="/about" className="btn-ghost">
                Our story
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* The end of the hero, a header's height above its bottom edge: when this leaves the top of the
          viewport the photograph has passed under the bar, and the header turns solid. */}
      <div className="hj-hero-end" data-hero-end aria-hidden="true" />
    </section>
  )
}

export default Hero
