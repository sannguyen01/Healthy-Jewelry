'use client'

import type { CSSProperties } from 'react'

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
    className,
    style,
  }

  switch (type) {
    case 'ring-arc':
      return (
        <svg {...baseProps} viewBox="0 0 80 80">
          <circle cx="40" cy="40" r="33" stroke={c1} strokeWidth="7" fill="none" />
          <circle cx="40" cy="40" r="22" stroke={c2} strokeWidth="1" fill="none" opacity="0.5" />
        </svg>
      )

    case 'ring-dome':
      return (
        <svg {...baseProps} viewBox="0 0 80 80">
          <circle cx="40" cy="40" r="33" stroke={c1} strokeWidth="13" fill="none" />
          <ellipse cx="40" cy="28" rx="12" ry="6" fill={c2} opacity="0.6" />
        </svg>
      )

    case 'ring-flat':
      return (
        <svg {...baseProps} viewBox="0 0 80 80">
          <circle cx="40" cy="40" r="33" stroke={c1} strokeWidth="9" fill="none" />
        </svg>
      )

    case 'ring-split':
      return (
        <svg {...baseProps} viewBox="0 0 80 80">
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
        <svg {...baseProps} viewBox="0 0 80 100">
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
        <svg {...baseProps} viewBox="0 0 80 100">
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
        <svg {...baseProps} viewBox="0 0 80 110">
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
        <svg {...baseProps} viewBox="0 0 80 80">
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
        <svg {...baseProps} viewBox="0 0 40 80">
          {/* Post */}
          <line x1="20" y1="10" x2="20" y2="45" stroke={c3} strokeWidth="2" strokeLinecap="round" />
          {/* Stud */}
          <circle cx="20" cy="20" r="9" fill={c1} />
        </svg>
      )

    case 'earring-hoop':
      return (
        <svg {...baseProps} viewBox="0 0 80 80">
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
        <svg {...baseProps} viewBox="0 0 40 100">
          {/* Post */}
          <line x1="20" y1="6" x2="20" y2="22" stroke={c3} strokeWidth="2" strokeLinecap="round" />
          {/* Elongated oval drop */}
          <ellipse cx="20" cy="60" rx="14" ry="34" fill={c1} />
        </svg>
      )

    case 'earring-cone':
      return (
        <svg {...baseProps} viewBox="0 0 40 100">
          {/* Post */}
          <line x1="20" y1="6" x2="20" y2="22" stroke={c3} strokeWidth="2" strokeLinecap="round" />
          {/* Cone triangle */}
          <path d="M8 28 L32 28 L20 88 Z" fill={c1} />
        </svg>
      )

    case 'bracelet-cuff':
      return (
        <svg {...baseProps} viewBox="0 0 80 80">
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
        <svg {...baseProps} viewBox="0 0 80 80">
          {/* Closed oval bangle */}
          <ellipse cx="40" cy="40" rx="28" ry="20" stroke={c1} strokeWidth="7" fill="none" />
        </svg>
      )

    case 'bracelet-link':
      return (
        <svg {...baseProps} viewBox="0 0 80 80">
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

    default:
      return null
  }
}

export default JewelrySVG
