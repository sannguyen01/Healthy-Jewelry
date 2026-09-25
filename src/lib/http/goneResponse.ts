/**
 * **HTTP 410 Gone, as a thing this codebase can say more than once.**
 *
 * `/checkout` has answered 410 since PR #82, and the reasoning it carries is the reasoning
 * every retired commerce URL needs. Contract §7 retires four more families —
 * `/checkouts/*`, `/orders/*`, `/discount/*` and `/checkout` itself — and four copies of a
 * hand-rolled `Response` is four places for the `X-Robots-Tag` to go missing from one of
 * them. Nothing would break. The page would render, the status would be right, and one
 * withdrawn capability would quietly be indexable.
 *
 * ## Why 410 and not 308, restated because it keeps being the question
 *
 * A redirect says *this moved*. Nothing moved: Healthy Jewellery stopped selling online, and
 * the capability is withdrawn rather than relocated. 410 is the one status that says so, and
 * it is the one a crawler treats as final — a 404 invites re-crawling for months, a 410 does
 * not.
 *
 * The test is not "is a redirect softer". It is **does a destination exist that answers the
 * visitor's actual question.** A bag becomes the shelf it was filled from; a login becomes
 * the person who replaces it; a Shopify collection URL becomes `/shop`. Those redirect. An
 * order status, a discount code and a checkout have no successor, and sending somebody to
 * `/shop` after they clicked Checkout tells them nothing about why they cannot buy.
 *
 * ## Why the markup is inline and ugly on purpose
 *
 * A 410 must not depend on the app shell, its fonts or its CSS pipeline — any of which may
 * be the thing that is gone. This is the one response on the site that has to render when
 * the rest of it does not, so it carries its own styles, names its colours as literals
 * rather than as `var(--bg)`, and loads nothing.
 *
 * The literals are the T4 tokens (`--bg`, `--ink`, `--graphite`, `--titanium-text`) written
 * out. That duplication is deliberate and is the only place in this codebase where it is:
 * resolving a custom property requires the stylesheet, and requiring the stylesheet is
 * exactly the dependency this page exists without.
 */

/** What a retired capability says for itself. */
export interface GoneCopy {
  /** Browser tab and `<title>`. Ends up in a search result if one was ever indexed. */
  title: string
  /** The `<h1>`. A sentence, not a label — "Gone" tells a person nothing. */
  heading: string
  /**
   * Body paragraphs, as pre-escaped HTML fragments.
   *
   * Callers are module-level constants in this repository, never request data, so there is
   * nothing to escape and an escaping pass would only stop the anchors from working. If
   * that ever stops being true, escape at the call site — a `renderGonePage` that sanitised
   * would be a template engine, and this file's whole value is that it is not one.
   */
  paragraphs: readonly string[]
}

/**
 * The document.
 *
 * Exported separately from `goneResponse` so a test can read the body without constructing
 * a `Response` and awaiting `.text()` — the kind of friction that makes people assert on
 * the status alone and leave the copy uncovered.
 */
export function renderGonePage(copy: GoneCopy): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${copy.title}</title>
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
  <h1>${copy.heading}</h1>
  ${copy.paragraphs.map((p) => `<p>${p}</p>`).join('\n  ')}
</main>
</body>
</html>`
}

/** The response, with the three headers a withdrawn capability needs. */
export function goneResponse(copy: GoneCopy): Response {
  return new Response(renderGonePage(copy), {
    status: 410,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      // A withdrawn capability is not a page worth indexing, and the header carries the
      // instruction even where the meta tag is not parsed — a crawler reading only headers,
      // or a response served to something that never builds a DOM.
      'X-Robots-Tag': 'noindex, nofollow',
      // Gone is a durable answer, but not a permanent one: it must be re-askable cheaply if
      // this ever changes. An immutable cache on a 410 is a decision nobody can reverse
      // without waiting out every intermediary.
      'Cache-Control': 'public, max-age=3600',
    },
  })
}

/**
 * Every HTTP method, answering the same way.
 *
 * A `POST /cart/add` from a restored tab, or a `PUT` from a stale service worker, must get
 * the same answer as a `GET`. Next's default for an unhandled verb is **405 Method Not
 * Allowed**, which says the resource exists and the verb is wrong — the opposite of true
 * here, and the kind of reply that makes somebody try again with a different client.
 *
 * Spread into a route module: `export const { GET, POST, ... } = goneRoute(COPY)`. Returning
 * the map rather than asking each route file to alias seven exports by hand is what stops
 * the seventh being forgotten in one of them.
 */
export function goneRoute(copy: GoneCopy) {
  const handler = (): Response => goneResponse(copy)
  return {
    GET: handler,
    HEAD: handler,
    POST: handler,
    PUT: handler,
    PATCH: handler,
    DELETE: handler,
    OPTIONS: handler,
  }
}

/**
 * The sentence every one of these pages ends on.
 *
 * Shared because it is the *point* of the page: a 410 that only says no has answered the
 * crawler and abandoned the person who followed a link from an old email. Each caller adds
 * the sentence specific to what they retired; this is the part that must never vary, and
 * `browse-only-copy.test.tsx` already records what it costs when the same fact is written
 * four times in four places.
 */
export const AMBASSADOR_NEXT_STEP =
  'Pieces are arranged with a Healthy Jewelry ambassador. ' +
  '<a href="/contact">Use the official contact channel</a> and we will put you in touch.'

/** The other half: there is still a catalogue, and it is still worth looking at. */
export const BROWSE_NEXT_STEP = '<a href="/shop">Browse the catalogue</a>'
