# ADR 038 — What a control observes is not what it claims

**Date**: 2026-09-27 (executed 2026-09-27 to 2026-10-02)
**Status**: Accepted
**Supersedes**: nothing. Extends [ADR 018](018-a-claim-about-a-control-is-not-a-control.md),
[ADR 024](024-a-tool-never-pointed-at-a-known-answer.md) and
[ADR 037](037-a-reconciliation-at-the-wrong-grain.md).

## Context

PR #90 shipped green on every required context. A release review of it asked four questions
of what a visitor, a log or the gate actually receives — not of what the tests assert — and
each had a control whose claim was wider than its observation:

| Control | What it claimed | What it observed | Falsifying example, run before any fix |
|---|---|---|---|
| Retired-route matrix | every retired URL answers deliberately | the first hop of a GET, HEAD or POST | a stale multipart product form followed to its end: Chromium left the visitor on a bare "Server action not found." The spec pinned that table as *expected*. |
| Analytics allowlist | no identifier reaches the log | the union of every event's fields | a forged `product_viewed` carrying `query: "customer@example.com order 10001"` was logged |
| Claims registry | an expired approval renders its fallback | `resolveClaim()` called in a unit test | built with an approval expiring that day and served two days later: 8 of 8 cache HITs still carried the wording |
| Live-surface probe | the site is clean, or the cause is X | a body sliced *after* full download; "both show commerce" before "are they one build" | — (a read cap that downloads everything first; a source-chain verdict for two different builds) |
| Merge-denial proof | blocked because of the failing check | `mergeable_state` alone | GitHub reported PR #90 `clean` while it was a draft |

None of these was a test that could not fail. Each could fail — at the wrong grain.

The experiment that falsified the claims control had the same defect one level up. Its first
version moved `Date` and not `performance`, which is the clock Next's cache reads, and started
the server after the clock had moved, so every entry looked fresh. It reported FAIL for the build
whose fix was correct. It was caught because the result was checked against a mechanism
(`incremental-cache/index.js`) before being believed, and the earlier FAIL from the same design
was discarded rather than kept as evidence.

## Decision

1. **A control states the grain it observes**, in its `knownLimit`, in the same words a reader
   would use to rely on it: "the first hop", "a prefix of 2 MB", "an approval resolved at build".
2. **A fix starts from a falsifying example against the real artifact** — a production build,
   a real browser, a forged request at the public route — written first and seen to fail for the
   stated reason. A test that pins observed behaviour as *expected* is a record of a defect, not a
   control, unless the behaviour was judged acceptable by a person.
3. **An instrument is pointed at a known answer in both directions before its verdict counts**
   (ADR 024 applied to experiments): it must FAIL the known-bad build *and* PASS the known-good
   one. An experiment that can only fail measures itself.
4. **Observation before attribution.** A verdict about cause is computed from a recorded
   observation of identity — which build, which bytes, which hop — and an unknown observation
   is `unevaluable`, never the nearest guess.
5. **A bound on what is kept is not a bound on what is read**, and an absence found in a prefix
   is not an absence: truncation is part of the answer.

## Consequences

- The 308 families are route handlers (`retiredRoute()`); the analytics sink is one strict schema
  per event and records no search text; claim-bearing segments revalidate within
  `CLAIM_WITHDRAWAL_BOUND_SECONDS`; the live-surface probe reads under a streaming cap, settles
  identity first and opens an issue a named person must acknowledge; `denied` requires a
  non-draft, conflict-free, up-to-date canary whose head and test-merge commit agree.
- Each changed invariant has a sentinel that was applied and seen red before it was registered.
- `scripts/experiment-claim-expiry.mjs` is manual by design: it is re-run when the rendering mode
  or Next's major version changes, because a framework can change which clock its cache reads.
- What no control here can observe stays with people, and `AGENTS.md` lists the actions no agent
  takes: merging, credentials, DNS, webhook subscriptions, and approving a claim.
