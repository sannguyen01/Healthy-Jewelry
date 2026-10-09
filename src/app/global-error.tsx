'use client'

import { SITE_FACE_FONT_FACE_CSS, SITE_STACKS } from '@/lib/design/siteFace'

interface GlobalErrorProps {
  error: Error & { digest?: string }
  reset: () => void
}

/**
 * Rendered in place of the root layout, so the loader's faces and tokens are not here. It declares
 * the site's faces itself (`src/lib/design/siteFace.ts`) rather than naming a family nothing
 * defines, which fell to plain `sans-serif`, and so sizes are literals instead of tokens. A
 * `<button>` does not inherit a font by default, so it names the label voice itself.
 */
export default function GlobalError({ reset }: GlobalErrorProps) {
  return (
    <html lang="en">
      <head>
        <style>{SITE_FACE_FONT_FACE_CSS}</style>
      </head>
      <body
        style={{
          backgroundColor: '#FAF9F5',
          color: '#1A1918',
          margin: 0,
          fontFamily: SITE_STACKS.body,
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
        <p
          style={{
            fontFamily: SITE_STACKS.label,
            fontWeight: 500,
            fontSize: '0.8125rem',
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: '#5F5B55',
            margin: 0,
          }}
        >
          Critical error
        </p>
        <h1
          style={{
            fontFamily: SITE_STACKS.display,
            fontSize: '2.5rem',
            fontWeight: 500,
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            margin: 0,
          }}
        >
          Something went wrong
        </h1>
        <button
          onClick={reset}
          style={{
            padding: '12px 28px',
            border: '1px solid #1A1918',
            backgroundColor: 'transparent',
            fontFamily: SITE_STACKS.label,
            fontWeight: 500,
            fontSize: '0.8125rem',
            letterSpacing: '0.14em',
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
