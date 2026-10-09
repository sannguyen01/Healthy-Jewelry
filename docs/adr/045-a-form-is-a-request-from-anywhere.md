# ADR 045 — A form is a request from anywhere

**Date**: 2026-10-04
**Status**: Accepted. The audit was the owner's request ("determine the responsiveness of the
website, functionality of all interactive components across formats … security-review the
frontend and backend"); the decisions below are engineering decisions, each with a test that was
seen to fail without it.

## Context

The site had per-feature guards and no measurement of the whole. The audit took four passes
against a production build: adversarial requests to every API route and page; a width sweep of all
fourteen page routes (306 measurements, 320–1920px, desktop and touch emulation); an interaction
sweep of every control on both formats (71 checks); and `pnpm audit`.

What it found, by severity:

| Severity | Finding | Where |
|---|---|---|
| Critical | Next.js 16.3.5: remote code execution in `next/og` `ImageResponse` (GHSA-vcvr-r3jv-pc5j) — and both share cards render through `ImageResponse` | `package.json` |
| High | A cross-site form could send this inbox mail: the contact route parsed any body as JSON whatever its content type, so `<form enctype="text/plain">` on another site worked, under the visitor's own rate-limit budget | `/api/contact` |
| High | A form submitted before hydration, or with scripts off, was a GET to `/contact` carrying name, email and message in the URL — into history and request logs — and sent nothing | `ContactForm` |
| Medium | The sender's name reached the notification's subject header and body unsanitised; the subject beside it was cleaned | `/api/contact` |
| Medium | `/search?q=a&q=b` rendered "Something went wrong": Next passes a repeated parameter as an array, and the page called `.trim()` on it | `/search` |
| Medium | `/search` at 320px pushed its SEARCH button 17px off-screen | `/search` |
| Low | A JSON `null` body answered 500, not 400 | `/api/contact` |
| Low | The homepage strip hid its scrollbar on every device: a mouse reached the cards past its edge only with Shift+wheel | `HorizontalScroll` |
| Low | `/about`'s rule ran past the viewport at every width; three links had 16–20px targets | `.rule`, links |
| Info | Dev tooling: `brace-expansion` (patched here), Vitest < 4.1.11 and `braces` (see Consequences) | dev dependencies |

Clean on every pass: overlapping controls, clipped text, broken images, console errors, reflected
input (`/search?q=<script>…` is escaped), path traversal on the dynamic routes, the webhook's HMAC
(timing-safe, length-checked), the JSON-LD (`<` escaped), external links (`noopener noreferrer`),
and the response headers (HSTS, CSP with `frame-ancestors 'none'`, `nosniff`).

## Decision

- **Next.js to 16.3.8**, the latest patch of the line, not merely the first patched release.
- **The contact route refuses another site before anything else** — before the limiter, so a
  forged request cannot spend a visitor's budget. `Sec-Fetch-Site: cross-site`, an `Origin` on a
  different host, an opaque `Origin: null` or an unparsable one are refused with 403. A request
  with neither header is not a browser on another site and is left to the rate limit, as before.
- **The form works without JavaScript, and posts.** `method="post" action="/api/contact"`; the
  route accepts `application/x-www-form-urlencoded` (32 KB, since percent-encoding triples
  non-Latin bytes) and answers a form with a page — never echoing what was typed — and the
  scripted form with JSON, from one validation path.
- **Every field written onto a line of the notification is one line** (`sanitizeLine`), and the
  name is validated as the line it becomes.
- **A query parameter is one string before a page uses it** (`firstParam`, the first value, as
  `URLSearchParams.get` takes it).
- **Fine pointers see the strip's scrollbar**, a hairline in `--graphite` (8.23:1; `--ash` would be
  1.3:1 against the 3:1 a control needs). Touch keeps none.
- **The rate limiter's trust in `x-forwarded-for` is settled**, not assumed: Vercel's documentation
  states it overwrites the header to prevent spoofing (recorded at `clientIp`, with the condition
  that would reopen it).

## Consequences

- `e2e/responsive-sweep.spec.ts` makes the width sweep permanent: every page route at every width
  its project stands for, asserting nothing past the viewport, 24px targets, no overlapping
  controls, no page errors. It caught the `/search` overflow when the fix was reverted.
- `api-contact-route.test.ts` gains the cross-site, form-post, `null`-body and one-line-name cases;
  `search-param.test.ts` the parameter; `contact.spec.ts` the no-JavaScript submission (asserting no
  typed value reaches any URL); `navigation.spec.ts` the repeated query; `homepage.spec.ts` the
  scrollbar by pointer type. Two sentinels (`contact-cross-site`, `search-first-param`) prove the
  unit guards can fail.
- Deferred, each a change of its own rather than a widening of this one: Vitest 4 (a major, for
  GHSA-82fw-gwwq-j7x9, dev-only) and `eslint-config-next` 16 (the outdated 15.x config is the path
  to `braces`, which has no patched release). `/api/health` continues to say which infrastructure is
  configured; it is an operator's endpoint by design, rate limited, and names no value.
