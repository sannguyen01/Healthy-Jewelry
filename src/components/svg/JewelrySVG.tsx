'use client'

import type { CSSProperties } from 'react'
import { viewBoxFor } from '@/lib/svg/viewbox'

interface JewelrySVGProps {
  type: string
  dark?: boolean
  className?: string
  style?: CSSProperties
}

export function JewelrySVG({ type, dark = false, className, style }: JewelrySVGProps) {
  const c1 = dark ? '#E0DDD8' : '#CECBC6'
  const c2 = dark ? '#F0EDE8' : '#E4E1DC'
  const c3 = dark ? '#A8A5A0' : '#8A8784'

  const baseProps = {
    xmlns: 'http://www.w3.org/2000/svg',
    fill: 'none',
    // One source of truth, shared with anything that needs to know how the mark is
    // proportioned. These were 25 literals that disagreed with each other in both
    // ratio and padding — see src/lib/svg/viewbox.ts.
    viewBox: viewBoxFor(type),
    // So a geometry probe can name the offender rather than reporting "an svg".
    'data-svg-type': type,
    className,
    style,
  }

  switch (type) {
    case 'ring-arc':
      return (
        <svg {...baseProps}>
          <circle cx="40" cy="40" r="33" stroke={c1} strokeWidth="7" fill="none" />
          <circle cx="40" cy="40" r="22" stroke={c2} strokeWidth="1" fill="none" opacity="0.5" />
        </svg>
      )

    case 'ring-dome':
      return (
        <svg {...baseProps}>
          <circle cx="40" cy="40" r="33" stroke={c1} strokeWidth="13" fill="none" />
          <ellipse cx="40" cy="28" rx="12" ry="6" fill={c2} opacity="0.6" />
        </svg>
      )

    case 'ring-flat':
      return (
        <svg {...baseProps}>
          <circle cx="40" cy="40" r="33" stroke={c1} strokeWidth="9" fill="none" />
        </svg>
      )

    case 'ring-split':
      return (
        <svg {...baseProps}>
          <path
            d="M14 40 A26 26 0 1 1 66 40"
            stroke={c1}
            strokeWidth="6"
            fill="none"
            strokeLinecap="round"
          />
          <circle cx="14" cy="40" r="4" fill={c1} />
          <circle cx="66" cy="40" r="4" fill={c1} />
        </svg>
      )

    case 'necklace-disc':
      return (
        <svg {...baseProps}>
          {/* Chain */}
          <path
            d="M40 8 C20 8 10 20 10 35"
            stroke={c3}
            strokeWidth="1.5"
            fill="none"
            strokeLinecap="round"
          />
          <path
            d="M40 8 C60 8 70 20 70 35"
            stroke={c3}
            strokeWidth="1.5"
            fill="none"
            strokeLinecap="round"
          />
          {/* Vertical drop */}
          <line x1="40" y1="8" x2="40" y2="55" stroke={c3} strokeWidth="1.5" />
          {/* Disc */}
          <circle cx="40" cy="68" r="14" fill={c1} />
          {/* Ring */}
          <circle cx="40" cy="68" r="8" stroke={c2} strokeWidth="1" fill="none" opacity="0.7" />
        </svg>
      )

    case 'necklace-bar':
      return (
        <svg {...baseProps}>
          {/* Chain */}
          <path
            d="M40 8 C20 8 10 22 10 38"
            stroke={c3}
            strokeWidth="1.5"
            fill="none"
            strokeLinecap="round"
          />
          <path
            d="M40 8 C60 8 70 22 70 38"
            stroke={c3}
            strokeWidth="1.5"
            fill="none"
            strokeLinecap="round"
          />
          <line x1="40" y1="8" x2="40" y2="55" stroke={c3} strokeWidth="1.5" />
          {/* Horizontal bar */}
          <rect x="18" y="60" width="44" height="6" rx="3" fill={c1} />
        </svg>
      )

    case 'necklace-drop':
      return (
        <svg {...baseProps}>
          {/* Chain */}
          <path
            d="M40 8 C20 8 10 22 10 38"
            stroke={c3}
            strokeWidth="1.5"
            fill="none"
            strokeLinecap="round"
          />
          <path
            d="M40 8 C60 8 70 22 70 38"
            stroke={c3}
            strokeWidth="1.5"
            fill="none"
            strokeLinecap="round"
          />
          <line x1="40" y1="8" x2="40" y2="52" stroke={c3} strokeWidth="1.5" />
          {/* Teardrop */}
          <path d="M40 55 C28 65 28 82 40 88 C52 82 52 65 40 55 Z" fill={c1} />
        </svg>
      )

    case 'necklace-chain':
      return (
        <svg {...baseProps}>
          {/* S-curve belcher links */}
          <path
            d="M15 20 C15 12 25 12 25 20 C25 28 35 28 35 20 C35 12 45 12 45 20 C45 28 55 28 55 20 C55 12 65 12 65 20"
            stroke={c1}
            strokeWidth="3"
            fill="none"
            strokeLinecap="round"
          />
          <path
            d="M15 40 C15 32 25 32 25 40 C25 48 35 48 35 40 C35 32 45 32 45 40 C45 48 55 48 55 40 C55 32 65 32 65 40"
            stroke={c1}
            strokeWidth="3"
            fill="none"
            strokeLinecap="round"
          />
          <path
            d="M15 60 C15 52 25 52 25 60 C25 68 35 68 35 60 C35 52 45 52 45 60 C45 68 55 68 55 60 C55 52 65 52 65 60"
            stroke={c1}
            strokeWidth="3"
            fill="none"
            strokeLinecap="round"
          />
        </svg>
      )

    case 'earring-stud':
      return (
        <svg {...baseProps}>
          {/* Post */}
          <line x1="20" y1="10" x2="20" y2="45" stroke={c3} strokeWidth="2" strokeLinecap="round" />
          {/* Stud */}
          <circle cx="20" cy="20" r="9" fill={c1} />
        </svg>
      )

    case 'earring-hoop':
      return (
        <svg {...baseProps}>
          {/* Open arc hoop */}
          <path
            d="M20 40 A20 20 0 1 1 60 40"
            stroke={c1}
            strokeWidth="5"
            fill="none"
            strokeLinecap="round"
          />
        </svg>
      )

    case 'earring-drop':
      return (
        <svg {...baseProps}>
          {/* Post */}
          <line x1="20" y1="6" x2="20" y2="22" stroke={c3} strokeWidth="2" strokeLinecap="round" />
          {/* Elongated oval drop */}
          <ellipse cx="20" cy="60" rx="14" ry="34" fill={c1} />
        </svg>
      )

    case 'earring-cone':
      return (
        <svg {...baseProps}>
          {/* Post */}
          <line x1="20" y1="6" x2="20" y2="22" stroke={c3} strokeWidth="2" strokeLinecap="round" />
          {/* Cone triangle */}
          <path d="M8 28 L32 28 L20 88 Z" fill={c1} />
        </svg>
      )

    case 'bracelet-cuff':
      return (
        <svg {...baseProps}>
          {/* Open oval cuff */}
          <path
            d="M18 40 A22 16 0 1 1 62 40"
            stroke={c1}
            strokeWidth="8"
            fill="none"
            strokeLinecap="round"
          />
        </svg>
      )

    case 'bracelet-bangle':
      return (
        <svg {...baseProps}>
          {/* Closed oval bangle */}
          <ellipse cx="40" cy="40" rx="28" ry="20" stroke={c1} strokeWidth="7" fill="none" />
        </svg>
      )

    case 'bracelet-link':
      return (
        <svg {...baseProps}>
          {/* Rectangular links chain */}
          <rect
            x="6"
            y="32"
            width="14"
            height="16"
            rx="3"
            stroke={c1}
            strokeWidth="2.5"
            fill="none"
          />
          <rect
            x="24"
            y="32"
            width="14"
            height="16"
            rx="3"
            stroke={c1}
            strokeWidth="2.5"
            fill="none"
          />
          <rect
            x="42"
            y="32"
            width="14"
            height="16"
            rx="3"
            stroke={c1}
            strokeWidth="2.5"
            fill="none"
          />
          <rect
            x="60"
            y="32"
            width="14"
            height="16"
            rx="3"
            stroke={c1}
            strokeWidth="2.5"
            fill="none"
          />
          {/* Connectors */}
          <line x1="20" y1="40" x2="24" y2="40" stroke={c2} strokeWidth="2" />
          <line x1="38" y1="40" x2="42" y2="40" stroke={c2} strokeWidth="2" />
          <line x1="56" y1="40" x2="60" y2="40" stroke={c2} strokeWidth="2" />
        </svg>
      )

    // ── Rings ──────────────────────────────────────────────────────────────

    case 'ring-halo':
      return (
        <svg {...baseProps}>
          {/* Band with a raised outer halo ring */}
          <circle cx="40" cy="40" r="33" stroke={c1} strokeWidth="6" fill="none" />
          <circle cx="40" cy="40" r="26" stroke={c2} strokeWidth="3" fill="none" opacity="0.7" />
          <circle cx="40" cy="14" r="6" fill={c1} />
          <circle cx="40" cy="14" r="10" stroke={c3} strokeWidth="1.5" fill="none" opacity="0.6" />
        </svg>
      )

    case 'ring-facet':
      return (
        <svg {...baseProps}>
          {/* Band with a faceted, cut-metal crown — geometry, never a stone */}
          <circle cx="40" cy="44" r="30" stroke={c1} strokeWidth="6" fill="none" />
          <path d="M40 6 L54 20 L40 34 L26 20 Z" fill={c1} />
          <path d="M40 6 L54 20 L40 20 Z" fill={c2} opacity="0.65" />
          <path d="M26 20 L40 20 L40 34 Z" fill={c3} opacity="0.35" />
        </svg>
      )

    // ── Earrings ───────────────────────────────────────────────────────────

    case 'earring-threader':
      return (
        <svg {...baseProps}>
          {/* A fine chain that threads through the lobe and hangs long */}
          <path
            d="M20 8 C10 22 30 34 20 50 C12 64 24 76 20 94"
            stroke={c1}
            strokeWidth="2.5"
            fill="none"
            strokeLinecap="round"
          />
          <circle cx="20" cy="8" r="3" fill={c3} />
          <circle cx="20" cy="94" r="4" fill={c1} />
        </svg>
      )

    // ── Bracelets ──────────────────────────────────────────────────────────

    case 'bracelet-chain':
      return (
        <svg {...baseProps}>
          {/* Interlocking oval links around the wrist line */}
          <ellipse cx="16" cy="40" rx="9" ry="6" stroke={c1} strokeWidth="3.5" fill="none" />
          <ellipse cx="32" cy="40" rx="9" ry="6" stroke={c2} strokeWidth="3.5" fill="none" />
          <ellipse cx="48" cy="40" rx="9" ry="6" stroke={c1} strokeWidth="3.5" fill="none" />
          <ellipse cx="64" cy="40" rx="9" ry="6" stroke={c2} strokeWidth="3.5" fill="none" />
        </svg>
      )

    case 'bracelet-bead':
      return (
        <svg {...baseProps}>
          {/* Beads strung on a cord */}
          <path
            d="M10 40 A30 22 0 0 1 70 40"
            stroke={c3}
            strokeWidth="1.5"
            fill="none"
            opacity="0.5"
          />
          <circle cx="14" cy="43" r="6" fill={c1} />
          <circle cx="28" cy="30" r="7" fill={c2} />
          <circle cx="43" cy="26" r="7" fill={c1} />
          <circle cx="57" cy="31" r="7" fill={c2} />
          <circle cx="68" cy="43" r="6" fill={c1} />
        </svg>
      )

    // ── Charms ─────────────────────────────────────────────────────────────
    // These were declared in HJSvgType but never drawn, so every product in the
    // Charms collection rendered an empty tile — the `default: return null`
    // below made it silent.

    case 'charm-classic':
      return (
        <svg {...baseProps}>
          {/* Bail plus a teardrop charm body */}
          <circle cx="40" cy="16" r="8" stroke={c3} strokeWidth="3" fill="none" />
          <path d="M40 28 C56 44 52 66 40 70 C28 66 24 44 40 28 Z" fill={c1} />
        </svg>
      )

    case 'charm-disc':
      return (
        <svg {...baseProps}>
          {/* Bail plus a flat engraved disc */}
          <circle cx="40" cy="14" r="7" stroke={c3} strokeWidth="3" fill="none" />
          <circle cx="40" cy="48" r="22" fill={c1} />
          <circle cx="40" cy="48" r="14" stroke={c2} strokeWidth="1.5" fill="none" opacity="0.7" />
        </svg>
      )

    case 'charm-anchor':
      return (
        <svg {...baseProps}>
          <circle cx="40" cy="12" r="6" stroke={c3} strokeWidth="3" fill="none" />
          {/* Shank, crossbar and fluked arms */}
          <line x1="40" y1="22" x2="40" y2="62" stroke={c1} strokeWidth="5" strokeLinecap="round" />
          <line x1="26" y1="32" x2="54" y2="32" stroke={c1} strokeWidth="4" strokeLinecap="round" />
          <path
            d="M20 48 C20 66 40 70 40 70 C40 70 60 66 60 48"
            stroke={c1}
            strokeWidth="5"
            fill="none"
            strokeLinecap="round"
          />
        </svg>
      )

    case 'charm-star':
      return (
        <svg {...baseProps}>
          <circle cx="40" cy="12" r="6" stroke={c3} strokeWidth="3" fill="none" />
          {/* Five-point star */}
          <path
            d="M40 24 L47 44 L68 44 L51 56 L58 76 L40 64 L22 76 L29 56 L12 44 L33 44 Z"
            fill={c1}
          />
        </svg>
      )

    case 'charm-heart':
      return (
        <svg {...baseProps}>
          <circle cx="40" cy="12" r="6" stroke={c3} strokeWidth="3" fill="none" />
          <path
            d="M40 72 C10 52 16 26 32 26 C38 26 40 32 40 34 C40 32 42 26 48 26 C64 26 70 52 40 72 Z"
            fill={c1}
          />
        </svg>
      )

    default:
      // Never `null`. A type that reaches here is either a new HJSvgType with
      // no case yet (svg-coverage.test.ts fails on that) or an unrecognised
      // Shopify tag that parseSvgType should already have mapped to a
      // collection fallback. Returning nothing is what turned nine products
      // into blank boxes, so the last resort is a visible mark rather than an
      // invisible one.
      return (
        <svg {...baseProps} data-svg-fallback="true">
          <circle cx="40" cy="40" r="30" stroke={c1} strokeWidth="5" fill="none" />
          <circle cx="40" cy="40" r="18" stroke={c2} strokeWidth="1.5" fill="none" opacity="0.6" />
        </svg>
      )
  }
}

export default JewelrySVG
