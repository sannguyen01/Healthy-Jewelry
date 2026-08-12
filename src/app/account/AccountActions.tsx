/**
 * Sign in and sign out.
 *
 * Plain forms, no client JavaScript. Sign-out has to be a POST — a link on
 * another site could otherwise sign someone out by embedding it as an image —
 * and a form is the way to POST without shipping a component to do it. Sign-in
 * is a link because it is a navigation, and it still works with JS disabled.
 */
export function AccountActions({ signedIn }: { signedIn: boolean }) {
  if (!signedIn) {
    return (
      <a href="/api/auth/login" className="btn-ghost" style={{ display: 'inline-block' }}>
        Sign in
      </a>
    )
  }

  return (
    <form action="/api/auth/logout" method="post" style={{ marginTop: '32px' }}>
      <button type="submit" className="btn-ghost">
        Sign out
      </button>
    </form>
  )
}

export default AccountActions
