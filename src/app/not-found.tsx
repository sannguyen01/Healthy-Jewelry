import Link from 'next/link'

export default function NotFound() {
  return (
    <main
      style={{
        minHeight: '100dvh',
        backgroundColor: 'var(--bg)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        padding: '0 clamp(20px, 4vw, 64px)',
        gap: '0',
      }}
    >
      <p
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 'clamp(6rem, 20vw, 14rem)',
          color: 'var(--ash)',
          lineHeight: 1,
          margin: '0 0 16px',
          letterSpacing: '0.02em',
        }}
        aria-hidden="true"
      >
        404
      </p>
      <h1
        style={{
          fontFamily: 'var(--font-display)',
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
          fontSize: 'clamp(1.4rem, 3vw, 2rem)',
          color: 'var(--ink)',
          margin: '0 0 12px',
          fontWeight: 700,
        }}
      >
        This piece doesn&apos;t exist.
      </h1>
      <p
        style={{
          fontFamily: 'var(--font-body)',
          fontWeight: 300,
          fontSize: '0.9rem',
          color: 'var(--graphite)',
          margin: '0 0 40px',
        }}
      >
        The page you&apos;re looking for has moved or never existed.
      </p>
      <Link
        href="/"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '14px 32px',
          backgroundColor: 'var(--ink)',
          color: 'var(--bg)',
          fontFamily: 'var(--font-ui)',
          fontSize: '0.72rem',
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          textDecoration: 'none',
          transition: 'background-color 0.25s ease',
        }}
      >
        Back to Home
      </Link>
    </main>
  )
}
