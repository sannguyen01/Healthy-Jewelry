'use client'

import { useEffect } from 'react'
import Link from 'next/link'

interface ErrorProps {
  error: Error & { digest?: string }
  reset: () => void
}

export default function Error({ error, reset }: ErrorProps) {
  useEffect(() => {
    console.error('[HJ Error Boundary]', error)
  }, [error])

  return (
    <main
      style={{
        backgroundColor: 'var(--bg, #F7F5F1)',
        color: 'var(--ink, #1A1714)',
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'clamp(24px, 6vw, 80px)',
        textAlign: 'center',
        gap: '32px',
      }}
    >
      <p
        style={{
          fontFamily: 'var(--font-ui, DM Sans, sans-serif)',
          fontSize: '0.65rem',
          letterSpacing: '0.22em',
          textTransform: 'uppercase',
          color: 'var(--graphite, #6B6762)',
        }}
      >
        Something went wrong
      </p>
      <h1
        style={{
          fontFamily: 'var(--font-display, Barlow Condensed, sans-serif)',
          fontWeight: 500,
          fontSize: 'clamp(2.4rem, 5vw, 4rem)',
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
          lineHeight: 1.1,
          margin: 0,
        }}
      >
        Unexpected error
      </h1>
      <p
        style={{
          fontFamily: 'var(--font-body, DM Sans, sans-serif)',
          fontWeight: 300,
          fontSize: '1rem',
          color: 'var(--graphite, #6B6762)',
          maxWidth: '400px',
          lineHeight: 1.6,
          margin: 0,
        }}
      >
        We&apos;re sorry — something didn&apos;t work as expected. You can try again or return home.
      </p>
      <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', justifyContent: 'center' }}>
        <button
          onClick={reset}
          style={{
            padding: '12px 28px',
            border: '1px solid var(--ink, #1A1714)',
            backgroundColor: 'transparent',
            fontFamily: 'var(--font-ui, DM Sans, sans-serif)',
            fontSize: '0.65rem',
            letterSpacing: '0.16em',
            textTransform: 'uppercase',
            cursor: 'pointer',
            color: 'var(--ink, #1A1714)',
          }}
        >
          Try again
        </button>
        <Link
          href="/"
          style={{
            padding: '12px 28px',
            backgroundColor: 'var(--ink, #1A1714)',
            color: 'var(--bg, #F7F5F1)',
            fontFamily: 'var(--font-ui, DM Sans, sans-serif)',
            fontSize: '0.65rem',
            letterSpacing: '0.16em',
            textTransform: 'uppercase',
            textDecoration: 'none',
          }}
        >
          Return home
        </Link>
      </div>
    </main>
  )
}
