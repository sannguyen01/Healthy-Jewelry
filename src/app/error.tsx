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
        backgroundColor: 'var(--bg, #FAF9F5)',
        color: 'var(--ink, #1A1918)',
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
          fontFamily: 'var(--font-ui)',
          fontWeight: 500,
          fontSize: 'var(--text-xs)',
          letterSpacing: 'var(--tracking-label)',
          textTransform: 'uppercase',
          color: 'var(--ink-2, #5F5B55)',
        }}
      >
        Something went wrong
      </p>
      <h1
        style={{
          fontFamily: 'var(--font-display)',
          textTransform: 'uppercase',
          fontWeight: 500,
          fontSize: 'clamp(2.4rem, 5vw, 4rem)',
          letterSpacing: 'var(--tracking-display)',
          lineHeight: 1.1,
          margin: 0,
        }}
      >
        Unexpected error
      </h1>
      <p
        style={{
          fontFamily: 'var(--font-body)',
          fontWeight: 300,
          fontSize: '1rem',
          color: 'var(--graphite, #3D3935)',
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
            border: '1px solid var(--ink, #1A1918)',
            backgroundColor: 'transparent',
            fontFamily: 'var(--font-ui)',
            fontWeight: 500,
            fontSize: 'var(--text-xs)',
            letterSpacing: 'var(--tracking-label)',
            textTransform: 'uppercase',
            cursor: 'pointer',
            color: 'var(--ink, #1A1918)',
          }}
        >
          Try again
        </button>
        <Link
          href="/"
          style={{
            padding: '12px 28px',
            backgroundColor: 'var(--ink, #1A1918)',
            color: 'var(--bg, #FAF9F5)',
            fontFamily: 'var(--font-ui)',
            fontWeight: 500,
            fontSize: 'var(--text-xs)',
            letterSpacing: 'var(--tracking-label)',
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
