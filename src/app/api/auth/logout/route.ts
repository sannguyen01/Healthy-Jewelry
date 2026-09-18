import { NextRequest, NextResponse } from 'next/server'
import { buildLogoutUrl } from '@/lib/shopify/customer/oauth'
import { customerAccountConfig, isCustomerAccountsConfigured } from '@/lib/shopify/customer/config'
import { openSession, SESSION_COOKIE } from '@/lib/shopify/customer/session'

/**
 * Sign out here **and** at Shopify.
 *
 * Clearing the local cookie alone leaves the customer signed in at Shopify, so
 * the next "Sign in" click returns them instantly with no prompt. That looks
 * exactly like logout being broken — and on a shared computer it is worse than
 * looking broken.
 *
 * A POST, so a link on another site cannot sign someone out by embedding an
 * image. The local cookie is cleared before the redirect, so even if Shopify's
 * end-session endpoint is unreachable this deployment has already forgotten them.
 */
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest): Promise<NextResponse> {
  const home = new URL('/', request.nextUrl.origin).toString()

  let destination = home
  if (isCustomerAccountsConfigured()) {
    try {
      // `id_token_hint`, now that there is one to send. This used to pass `null`
      // with a comment explaining that the project never stored the ID token —
      // which was true, and was the same omission that left the login nonce
      // unverifiable. Without the hint Shopify shows the customer a "do you want
      // to sign out?" confirmation instead of ending the session, so a logout
      // that looks like it worked leaves them signed in at Shopify.
      //
      // `openSession` returns null for anything it cannot open, and a session
      // sealed before `idToken` existed simply has none — both reduce to
      // `undefined` here, which is the old behaviour rather than a failure.
      const session = openSession(
        request.cookies.get(SESSION_COOKIE)?.value,
        customerAccountConfig.sessionSecret
      )
      destination = await buildLogoutUrl(session?.idToken, home)
    } catch (err) {
      // Local sign-out still happens below. Failing to reach Shopify must not
      // leave the customer signed in *here* as well.
      console.error('[auth/logout] could not build the Shopify logout URL', err)
    }
  }

  const response = NextResponse.redirect(destination, { status: 303 })
  response.cookies.delete(SESSION_COOKIE)
  return response
}
