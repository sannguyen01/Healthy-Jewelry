'use client'

interface GlobalErrorProps {
  error: Error & { digest?: string }
  reset: () => void
}

export default function GlobalError({ reset }: GlobalErrorProps) {
  return (
    <html lang="en">
      <body
        style={{
          backgroundColor: '#F7F5F1',
          color: '#1A1714',
          margin: 0,
          fontFamily: 'DM Sans, sans-serif',
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
        <p style={{ fontSize: '0.65rem', letterSpacing: '0.22em', textTransform: 'uppercase', color: '#6B6762', margin: 0 }}>
          Critical error
        </p>
        <h1 style={{ fontFamily: 'Barlow Condensed, sans-serif', fontSize: '2.5rem', letterSpacing: '0.04em', textTransform: 'uppercase', margin: 0 }}>
          Something went wrong
        </h1>
        <button
          onClick={reset}
          style={{
            padding: '12px 28px',
            border: '1px solid #1A1714',
            backgroundColor: 'transparent',
            fontSize: '0.65rem',
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
