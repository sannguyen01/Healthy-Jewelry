import { NextRequest, NextResponse } from 'next/server'
import { customerAccountConfig, isCustomerAccountsConfigured } from '@/lib/shopify/customer/config'
import {
  callbackUrl,
  exchangeCodeForSession,
  NONCE_COOKIE,
  STATE_COOKIE,
} from '@/lib/shopify/customer/oauth'
import {
  safeEquals,
  sealSession,
  sessionCookieOptions,
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
} from '@/lib/shopify/customer/session'

/**
 * Where Shopify returns the customer after they sign in.
 *
 * ## The `state` check is the whole point
 *
 * Without it, anyone can send a victim's browser to this URL carrying *their own*
 * authorization code, and the victim ends up signed into the attacker's account —
 * where every subsequent order and address is visible to whoever owns it. The
 * cookie set by `/api/auth/login` is the proof that this callback belongs to a
 * login this browser actually started.
 *
 * Compared in constant time, and the cookie is cleared whatever the outcome so a
 * captured `state` cannot be replayed.
 *
 * ## Every failure lands on the same page
 *
 * A missing code, a mismatched state, a refused exchange — all redirect to
 * `/account?status=failed`. Naming which one failed would tell someone probing
 * this endpoint exactly which half of their attempt was wrong, and tells a real
 * customer nothing they can act on.
 */
export const dynamic = 'force-dynamic'

function failed(origin: string): NextResponse {
  const response = NextResponse.redirect(new URL('/account?status=failed', origin))
  clearAttemptCookies(response)
  return response
}

/**
 * Both single-use values from this login attempt, cleared together.
 *
 * One function rather than two `delete` calls at four sites: the state cookie
 * was already cleared on every exit path, and adding a second cookie that has to
 * be cleared in exactly the same places is how one of them ends up surviving a
 * branch somebody added later.
 */
function clearAttemptCookies(response: NextResponse): void {
  response.cookies.delete(STATE_COOKIE)
  response.cookies.delete(NONCE_COOKIE)
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { origin, searchParams } = request.nextUrl

  if (!isCustomerAccountsConfigured()) {
    return NextResponse.redirect(new URL('/account?status=unavailable', origin))
  }

  // Shopify reports a refusal — including the customer simply pressing Cancel —
  // as an `error` parameter rather than an HTTP status.
  if (searchParams.get('error')) {
    return NextResponse.redirect(new URL('/account?status=cancelled', origin))
  }

  const code = searchParams.get('code')
  const returnedState = searchParams.get('state')
  const expectedState = request.cookies.get(STATE_COOKIE)?.value
  const expectedNonce = request.cookies.get(NONCE_COOKIE)?.value

  if (!code || !returnedState || !expectedState || !safeEquals(returnedState, expectedState)) {
    console.warn('[auth/callback] rejected: missing code or state mismatch')
    return failed(origin)
  }

  // A callback with no nonce cookie cannot have its ID token checked, and this
  // route refuses rather than skipping the check. The alternative — verify when
  // the cookie happens to be there — is a control that silently disables itself
  // under exactly the conditions an attacker controls, since a third party can
  // strip a cookie from a request it constructs but cannot forge one.
  if (!expectedNonce) {
    console.warn('[auth/callback] rejected: no nonce cookie for this attempt')
    return failed(origin)
  }

  let sealed: string
  try {
    const session = await exchangeCodeForSession(code, callbackUrl(origin), expectedNonce)
    sealed = sealSession(session, customerAccountConfig.sessionSecret)
  } catch (err) {
    console.error('[auth/callback] token exchange failed', err)
    return failed(origin)
  }

  const response = NextResponse.redirect(new URL('/account', origin))
  response.cookies.set(SESSION_COOKIE, sealed, sessionCookieOptions(SESSION_MAX_AGE_SECONDS))
  // One state value, one nonce, one login. Clearing them makes a captured
  // callback URL useless the moment it has been used once.
  clearAttemptCookies(response)
  return response
}
