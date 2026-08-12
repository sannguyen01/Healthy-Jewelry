import { NextRequest, NextResponse } from 'next/server'
import { customerAccountConfig, isCustomerAccountsConfigured } from '@/lib/shopify/customer/config'
import { callbackUrl, exchangeCodeForSession, STATE_COOKIE } from '@/lib/shopify/customer/oauth'
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
  response.cookies.delete(STATE_COOKIE)
  return response
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

  if (!code || !returnedState || !expectedState || !safeEquals(returnedState, expectedState)) {
    console.warn('[auth/callback] rejected: missing code or state mismatch')
    return failed(origin)
  }

  let sealed: string
  try {
    const session = await exchangeCodeForSession(code, callbackUrl(origin))
    sealed = sealSession(session, customerAccountConfig.sessionSecret)
  } catch (err) {
    console.error('[auth/callback] token exchange failed', err)
    return failed(origin)
  }

  const response = NextResponse.redirect(new URL('/account', origin))
  response.cookies.set(SESSION_COOKIE, sealed, sessionCookieOptions(SESSION_MAX_AGE_SECONDS))
  // One state value, one login. Clearing it makes a captured callback URL
  // useless the moment it has been used once.
  response.cookies.delete(STATE_COOKIE)
  return response
}
