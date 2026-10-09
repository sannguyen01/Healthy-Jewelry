# ADR 049 — A wait that names what it waits for

**Date**: 2026-10-09
**Status**: Accepted as a mitigation with a diagnostic attached. **Not a root cause.** The cause of
the stall below is unknown, and this ADR says what would settle it.

## Context

Twelve phone-project E2E tests stalled at `waitForLoadState('networkidle')` (and, for the no-JS
spec, at `goto`'s `load`) on CI. Every run on this branch through round 5 was green, on Next 16.3.5.
After the bump to 16.3.8, which the `next/og` RCE (GHSA-vcvr-r3jv-pc5j) forced, E2E failed on three
of four runs with the same twelve tests, and passed on the fourth with the runtime code identical.

| Run | Head | Next | E2E | What the log named |
|---|---|---|---|---|
| green | `03db3cb` | 16.3.5 | pass | |
| red | `434c3c9` | 16.3.8 | 13 failed | `/shipping` overflow (fixed separately) and 12 stalls, nothing named |
| red | `531b6eb` | 16.3.8 | 12 failed | `charms.jpg` and `earrings.jpg` at `w=640` unfinished after 20s. An independent HTTP client got **no answer in 6s**; `/robots.txt` answered in 0.0s |
| green | `56cbe4e` | 16.3.8 | pass | |
| red | `4806efc` | 16.3.8 | 12 failed (the same twelve) | two `lazy` images at `w=3840` unfinished; **nothing in flight that the diagnostic could re-ask** |

What those runs support:
- the twelve are the tests that open the homepage and wait for the network to go quiet;
- a test's retry fails exactly as the first attempt did, so the state is **per server process**, not
  per test;
- the server answers other routes while two photograph variants stay unanswered;
- it tracks the Next bump, and it does not reproduce locally (cold-variant aborts, concurrent
  requests, twelve widths, all `200` in under 1.7s).

What they do not support is a cause. This was checked, not assumed:

| Candidate | Result |
|---|---|
| The local-image fetch path (`fetchInternalImage`) | Byte-identical between 16.3.5 and 16.3.8 |
| `sharp` and its binaries | Unchanged (0.35.4, libvips 1.3.3) |
| The 16.3.5 → 16.3.8 optimizer rewrite | It is the **remote**-image fetch (pinned lookup, upstream agents, content-encoding decoders). This site serves local photographs only |
| The response-cache refactor (`route: 'image'`, `getCacheContext`) | Reads coherently; the batcher keys and scheduler are unchanged |
| Aborted optimizer requests wedging a variant | Tested locally, including mid-processing aborts: refuted |
| An upstream report | A web search found none |

Whether Vercel's own image service in front of `/_next/image` is affected is **unmeasured**. CI
serves the route from `next start`; production does not. "CI-only" is an inference.

## Decision

1. **Warm the optimizer before the suite, serially, and fail fast.** `e2e/global-setup.ts` runs once,
   after `webServer` is up. It reads every `/_next/image` URL on eleven pages (`src`, `srcset`,
   preloads, and the copies the framework embeds in its payload) and requests each, **one at a
   time, twice**: a cold pass, so no test is the first to ask for a photograph and none asks beside
   another, and a warm pass, so the cached path is proven to answer too. Each request has a 20s
   ceiling and must deliver a whole `image/*` body. After three failures it stops and throws, naming
   the URL, the verdict and the pass.
2. **The stall diagnostic asks about every incomplete image.** `networkQuiet` only saw requests that
   started after it was called, so a request begun during `goto` was invisible. It now also
   re-requests each incomplete `<img>`'s `currentSrc` with Playwright's own HTTP client.
3. **Keep every assertion and every wait.** Nothing was loosened. A hung image is exactly what those
   twelve tests exist to catch, and a weaker wait would hide it on the page a visitor sees.
4. **Do not roll Next back.** 16.3.5 carries the RCE, and no newer 16.3.x exists.

## Consequences

- **Measured on this container, production build, cold cache:** 43 variants from 11 pages; cold pass
  35.0s, warm pass 0.2s, slowest single request 2.1s. A hang is reported within about 20s per
  variant and 60s in all, against 7.3 minutes of twelve tests timing out twice with nothing named.
- **Proven able to fail:** `image-primer.test.ts` runs the primer against a stub server that really
  hangs, answers 500, serves a non-image, starts a body and never ends it, or answers once and then
  goes quiet, and holds each to its verdict and to the time it may take. Three deliberate
  breakages of the primer (no body read, any status accepted, no warm pass) each turned the matching
  tests red.
- **How to read the next outcome:**
  - *Green:* a supported inference that a cold or concurrent first optimisation is the trigger.
    Not a fix, not proof, and nothing about Vercel.
  - *Red at the primer:* the first direct measurement. The failing URL and pass are the upstream
    report. Do not loosen any assertion.
  - *Red elsewhere:* read the named cause; the stall message now lists the images, fonts and
    requests it was waiting on, and what the server says when asked again.
- **Removal condition:** a Next release that fixes it, then three green runs without the primer. The
  primer adds about 35s to a run, so it is cheap to keep until then.
- **Local caveat:** this container's Chromium is build 1194 and Playwright 1.63 wants 1243. Local runs
  need `PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium`; without it every test dies at
  `browserType.launch`, before any page loads, which looks like 21 failures and tests nothing.
