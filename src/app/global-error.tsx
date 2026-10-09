'use client'

import { SITE_FACE_FONT_FACE_CSS, SITE_FACE_STACK } from '@/lib/design/siteFace'

interface GlobalErrorProps {
  error: Error & { digest?: string }
  reset: () => void
}

/**
 * Rendered in place of the root layout, so the loader's face and tokens are not here. It declares
 * the site face itself (`src/lib/design/siteFace.ts`) rather than naming a family nothing
 * defines, which fell to plain `sans-serif`, and so sizes are literals at the label floor
 * (0.7rem) instead of `--text-xs`. A `<button>` does not inherit a font by default, hence
 * `fontFamily: 'inherit'`.
 */
export default function GlobalError({ reset }: GlobalErrorProps) {
  return (
    <html lang="en">
      <head>
        <style>{SITE_FACE_FONT_FACE_CSS}</style>
      </head>
      <body
        style={{
          backgroundColor: '#F3F2EC',
          color: '#1A1714',
          margin: 0,
          fontFamily: SITE_FACE_STACK,
          fontSynthesis: 'none',
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '24px',
          textAlign: 'center',
          padding: '40px',
        }}
      >
        <p style={{ fontSize: '0.7rem', letterSpacing: '0.22em', textTransform: 'uppercase', color: '#4A4744', margin: 0 }}>
          Critical error
        </p>
        <h1 style={{ fontSize: '2.5rem', fontWeight: 500, letterSpacing: '-0.01em', margin: 0 }}>
          Something went wrong
        </h1>
        <button
          onClick={reset}
          style={{
            padding: '12px 28px',
            border: '1px solid #1A1714',
            backgroundColor: 'transparent',
            fontFamily: 'inherit',
            fontSize: '0.7rem',
            letterSpacing: '0.16em',
            textTransform: 'uppercase',
            cursor: 'pointer',
          }}
        >
          Try again
        </button>
      </body>
    </html>
  )
}
