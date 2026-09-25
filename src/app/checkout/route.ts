import { AMBASSADOR_NEXT_STEP, BROWSE_NEXT_STEP, goneRoute } from '@/lib/http/goneResponse'

/**
 * `/checkout` — **410 Gone**, deliberately, and not a redirect.
 *
 * ## Why 410 and not 308
 *
 * A redirect says *this moved*. Nothing moved: Healthy Jewellery stopped selling online, and
 * the capability is withdrawn rather than relocated. 410 is the one status that says so, and
 * it is the one a crawler treats as final — a 404 invites re-crawling for months, a 410 does
 * not.
 *
 * `/cart`, `/account`, `/collections/*` and `/policies/*` **do** redirect (308, in
 * `next.config.ts`), because for those a destination exists that answers the visitor's actual
 * question: a bag becomes the shelf it was filled from, a login becomes the person who
 * replaces it, a Shopify collection URL becomes the shelf it named. A checkout has no such
 * successor. Sending someone to `/shop` after they clicked Checkout tells them nothing about
 * why they cannot buy.
 *
 * ## Why a route handler
 *
 * A `page.tsx` cannot set a status code; it renders, and Next answers 200. That is the exact
 * soft-404 shape `verify-browse-only.mjs` reports as `unknown-not-404` and which
 * `e2e/retired-routes.spec.ts` asserts against with a real status read — because
 * `toHaveURL()` and a rendered word "Gone" both pass on an HTTP 200.
 *
 * So this is a `route.ts`. A route handler and a page cannot coexist on one path, which is
 * why `checkout/page.tsx` is deleted rather than kept alongside.
 *
 * ## Why the body now comes from `@/lib/http/goneResponse`
 *
 * This file used to hold its own copy of the markup, the headers and the verb aliases. It
 * was the only 410 on the site, so that was fine. Contract §7 retires four more families,
 * and four hand-rolled copies is four places for the `X-Robots-Tag` to go missing from one —
 * a failure that breaks nothing, renders correctly, and leaves one withdrawn capability
 * indexable. The reasoning above is the part worth keeping in this file; the bytes are not.
 */
const COPY = {
  title: 'Checkout is closed — Healthy Jewellery',
  heading: 'This catalogue no longer accepts online orders.',
  paragraphs: [AMBASSADOR_NEXT_STEP, BROWSE_NEXT_STEP],
} as const

export const { GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS } = goneRoute(COPY)
