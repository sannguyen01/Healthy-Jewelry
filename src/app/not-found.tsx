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
          textTransform: 'uppercase',
          fontWeight: 500,
          fontSize: 'clamp(6rem, 20vw, 14rem)',
          color: 'var(--ash)',
          lineHeight: 1,
          margin: '0 0 16px',
          letterSpacing: 'var(--tracking-display)',
        }}
        aria-hidden="true"
      >
        404
      </p>
      <h1
        style={{
          fontFamily: 'var(--font-display)',
          textTransform: 'uppercase',
          letterSpacing: 'var(--tracking-title)',
          fontSize: 'var(--text-xl)',
          color: 'var(--ink)',
          margin: '0 0 12px',
          fontWeight: 500,
        }}
      >
        This piece doesn&apos;t exist.
      </h1>
      <p
        style={{
          fontFamily: 'var(--font-body)',
          fontWeight: 300,
          fontSize: 'var(--text-sm)',
          lineHeight: 'var(--leading-text)',
          color: 'var(--graphite)',
          margin: '0 0 40px',
        }}
      >
        The page you&apos;re looking for has moved or never existed.
      </p>
      <Link href="/" className="btn-primary">
        Back to Home
      </Link>
    </main>
  )
}
