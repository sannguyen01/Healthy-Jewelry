import { NextRequest, NextResponse } from 'next/server'
import { discoverEndpoints, isCustomerAccountsConfigured, customerAccountConfig } from '@/lib/shopify/customer/config'
import {
  buildAuthorizationUrl,
  callbackUrl,
  randomToken,
  STATE_COOKIE,
  STATE_MAX_AGE_SECONDS,
} from '@/lib/shopify/customer/oauth'
import { sessionCookieOptions } from '@/lib/shopify/customer/session'

/**
 * Start the sign-in flow.
 *
 * A GET, because it is reached by clicking a link and ends in a redirect to
 * Shopify. Nothing about it mutates state on this side beyond a short-lived
 * cookie holding the `state` value, which is the only thing tying the eventual
 * callback to this browser's attempt.
 */
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!isCustomerAccountsConfigured()) {
    // Not an error. Accounts are optional, and the /account page explains the
    // state in words rather than leaving someone at a 500.
    return NextResponse.redirect(new URL('/account?status=unavailable', request.nextUrl.origin))
  }

  let authorization: string
  try {
    ;({ authorization } = await discoverEndpoints())
  } catch (err) {
    console.error('[auth/login] endpoint discovery failed', err)
    return NextResponse.redirect(new URL('/account?status=unavailable', request.nextUrl.origin))
  }

  const state = randomToken()
  const nonce = randomToken(16)

  const response = NextResponse.redirect(
    buildAuthorizationUrl({
      authorizationEndpoint: authorization,
      clientId: customerAccountConfig.clientId,
      // The request's own origin, so a preview deployment returns to itself
      // rather than bouncing a developer to production.
      redirectUri: callbackUrl(request.nextUrl.origin),
      state,
      nonce,
    })
  )

  response.cookies.set(STATE_COOKIE, state, sessionCookieOptions(STATE_MAX_AGE_SECONDS))
  return response
}
