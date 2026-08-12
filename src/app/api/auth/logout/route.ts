import { NextRequest, NextResponse } from 'next/server'
import { buildLogoutUrl } from '@/lib/shopify/customer/oauth'
import { isCustomerAccountsConfigured } from '@/lib/shopify/customer/config'
import { SESSION_COOKIE } from '@/lib/shopify/customer/session'

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
      // No `id_token_hint`: this project never stores the ID token, only the
      // access and refresh tokens. Shopify accepts the request without it and
      // shows a confirmation instead of logging out silently.
      destination = await buildLogoutUrl(null, home)
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
