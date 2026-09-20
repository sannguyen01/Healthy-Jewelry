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
 * `/cart` and `/account` **do** redirect (308, in `next.config.ts`), because for those a
 * destination exists that answers the visitor's actual question: a bag becomes the shelf it
 * was filled from, and a login becomes the person who replaces it. A checkout has no such
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
 * The body is served for the human who followed an old link. It is deliberately plain HTML
 * with inline styles: a 410 must not depend on the app shell, its fonts or its CSS pipeline,
 * any of which may be the thing that is gone.
 */

const GONE_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Checkout is closed — Healthy Jewellery</title>
<style>
  :root { color-scheme: light dark; }
  body {
    margin: 0; min-height: 100vh; display: grid; place-items: center;
    background: #F7F5F1; color: #1A1714;
    font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
    line-height: 1.6; padding: 24px;
  }
  main { max-width: 34rem; }
  h1 { font-size: 1.5rem; font-weight: 500; margin: 0 0 1rem; letter-spacing: 0.01em; }
  p { margin: 0 0 1rem; color: #6B6762; }
  a { color: #59636B; }
</style>
</head>
<body>
<main>
  <h1>This catalogue no longer accepts online orders.</h1>
  <p>
    Please meet a Healthy Jewellery ambassador, or
    <a href="/contact">use the official contact channel</a>.
  </p>
  <p><a href="/shop">Browse the catalogue</a></p>
</main>
</body>
</html>`

export function GET(): Response {
  return new Response(GONE_HTML, {
    status: 410,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      // A withdrawn capability is not a page worth indexing, and the header carries the
      // instruction even where the meta tag is not parsed.
      'X-Robots-Tag': 'noindex, nofollow',
      // Gone is a durable answer, but not a permanent one: it must be re-askable cheaply if
      // this ever changes.
      'Cache-Control': 'public, max-age=3600',
    },
  })
}

/**
 * Every other method gets the same answer.
 *
 * A `POST /checkout` from a stale form must not fall through to Next's 405: the resource is
 * gone regardless of what the caller wanted to do with it.
 */
export const POST = GET
export const PUT = GET
export const PATCH = GET
export const DELETE = GET
export const HEAD = GET
