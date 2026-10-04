import { AMBASSADOR_NEXT_STEP, BROWSE_NEXT_STEP, retiredRoute } from '@/lib/http/goneResponse'
import { SITE_NAME } from '@/config/site'

/**
 * `/account` and `/account/*` — **308 to `/contact` for browsing, 410 for anything else.**
 *
 * `/account/login`, `/account/register`, `/account/orders`, `/account/addresses`. Customer
 * accounts were built and never switched on, so no visitor has credentials to use here, and a
 * login becomes the person who replaces it: a GET redirects to `/contact`. A POST is a sign-in
 * or registration form submitted from an old page, and following a 308 would have re-POSTed
 * the visitor's email address to the contact page — so it gets the page that says nothing was
 * sent, rather than a page that implies it was. See `retiredRoute()` in
 * `src/lib/http/goneResponse.ts`.
 */
const COPY = {
  title: `Accounts are not available — ${SITE_NAME}`,
  heading: 'This website does not hold accounts.',
  paragraphs: [
    'Customer accounts were never switched on here, so there is nothing to sign in to, and ' +
      'nothing you entered was sent or saved.',
    AMBASSADOR_NEXT_STEP,
    BROWSE_NEXT_STEP,
  ],
} as const

export const { GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS } = retiredRoute({ successor: '/contact', copy: COPY })
