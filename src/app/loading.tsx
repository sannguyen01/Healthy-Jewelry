export default function Loading() {
  return (
    <div
      style={{
        backgroundColor: 'var(--bg, #F7F5F1)',
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <p
        style={{
          fontFamily: 'var(--font-ui, DM Sans, sans-serif)',
          fontSize: '0.6rem',
          letterSpacing: '0.24em',
          textTransform: 'uppercase',
          color: 'var(--graphite, #6B6762)',
        }}
      >
        Loading
      </p>
    </div>
  )
}
