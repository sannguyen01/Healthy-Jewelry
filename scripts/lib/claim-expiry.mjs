// Healthy Jewelry — does an expired claim approval actually leave the page a visitor is served?
//
// ## Why this is an experiment and not a unit test
//
// `resolveClaim()` is pure and its tests prove that an approval past `expiresOn` resolves to the
// fallback *when it is called*. They cannot prove when it is called. Every page here was
// prerendered at build time with `initialRevalidateSeconds: false` (measured 2026-09-27 on
// `228fdaf`: 37 of 37 routes), and the Footer resolves the positioning claim on every one of
// them — so "resolved at render" meant "resolved at build", and an approval that lapsed the day
// after a deploy would have stayed in served HTML until the next deploy, however long that was.
//
// The only way to know is to build an artifact with an approval in it, serve it after the
// approval has lapsed, and look. `scripts/experiment-claim-expiry.mjs` does the building and
// serving; everything that decides anything is here, pure, so each verdict is reachable from a
// fixture (ADR 024) rather than only from a two-minute build.
//
// The fixture approval is never written to the repository's registry. It lives in a scratch
// copy built from `git archive`, and its reviewer and document say plainly what it is.

/** The claim the experiment approves: it renders on every page (Footer), the homepage hero and metadata, and the share card. */
export const EXPERIMENT_CLAIM_ID = 'brand-positioning'

const FIXTURE_NAME = 'Claim-expiry experiment fixture'

/** `YYYY-MM-DD` for a UTC instant. */
export function isoDay(date) {
  return date.toISOString().slice(0, 10)
}

/**
 * The registry with one claim approved from yesterday and expiring at the end of today (UTC).
 *
 * Valid against `claims-schema.ts`: evidence covering every material (the only evidence that
 * covers a `site` context), a named reviewer, and `expiresOn` after `decidedOn`. Everything else
 * in the registry is returned untouched.
 *
 * @param {{ claims: Array<{ id: string }> }} registry the parsed `claims.json`
 * @param {Date} now the build-time clock
 */
export function withExpiringApproval(registry, now) {
  const today = isoDay(now)
  const yesterday = isoDay(new Date(now.getTime() - 86_400_000))
  let found = false
  const claims = registry.claims.map((claim) => {
    if (claim.id !== EXPERIMENT_CLAIM_ID) return claim
    found = true
    return {
      ...claim,
      evidence: [
        {
          documentId: 'EXPERIMENT-FIXTURE-NOT-EVIDENCE',
          title: `${FIXTURE_NAME} — not evidence, never committed`,
          appliesTo: { kind: 'material', materials: ['titanium', 'niobium', 'surgical-steel'] },
          reviewer: FIXTURE_NAME,
          reviewedOn: yesterday,
        },
      ],
      decision: { state: 'approved', reviewer: FIXTURE_NAME, decidedOn: yesterday, expiresOn: today },
    }
  })
  if (!found) throw new Error(`The registry holds no "${EXPERIMENT_CLAIM_ID}" claim to approve.`)
  return { ...registry, claims }
}

/** The claim's text as one line, the way every surface but a multi-line heading renders it. */
export function inlineText(text) {
  return String(text)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join(' ')
}

/** Tag-stripped, entity-light, whitespace-collapsed text of an HTML document. */
export function readableText(html) {
  return String(html)
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
}

/** Every `<meta>` `content` and every JSON-LD block, as one searchable string per surface. */
export function surfacesOf(html) {
  const source = String(html)
  const meta = [...source.matchAll(/<meta\b[^>]*\bcontent="([^"]*)"[^>]*>/gi)].map((m) => m[1]).join('\n')
  const jsonLd = [...source.matchAll(/<script\b[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)]
    .map((m) => m[1])
    .join('\n')
  return { visible: readableText(source), metadata: meta.replace(/\s+/g, ' '), jsonLd: jsonLd.replace(/\s+/g, ' ') }
}

/**
 * Where on one page the wording appears. A surface the claim never reaches reads `false` both
 * before and after, which is why the verdict compares against the baseline rather than assuming
 * every surface carries it.
 *
 * @param {string} html
 * @param {string} wording the claim's wording, inline
 */
export function wordingOn(html, wording) {
  const s = surfacesOf(html)
  const needle = inlineText(wording)
  return { visible: s.visible.includes(needle), metadata: s.metadata.includes(needle), jsonLd: s.jsonLd.includes(needle) }
}

/**
 * The verdict.
 *
 * - `unevaluable` when the baseline (real clock) never showed the wording anywhere: the fixture
 *   did not render, so its later absence would prove nothing (ADR 020's vacuous green).
 * - `FAIL` when, after the clock passed expiry, any surface that carried the wording in the
 *   baseline still carries it on the last attempt.
 * - `PASS` when every such surface lost it — and the record says on which attempt, because "the
 *   first request after expiry was stale" is part of the measured bound, not a detail.
 *
 * @param {{ baseline: Record<string, { visible: boolean, metadata: boolean, jsonLd: boolean }>, attempts: Record<string, Array<{ visible: boolean, metadata: boolean, jsonLd: boolean, cache?: string | null }>> }} observed
 */
export function judgeExpiry({ baseline, attempts }) {
  const carried = []
  for (const [path, where] of Object.entries(baseline)) {
    for (const [surface, present] of Object.entries(where)) if (present) carried.push({ path, surface })
  }
  if (carried.length === 0) {
    return { verdict: 'unevaluable', reason: 'fixture-never-rendered', carried, lingering: [], withdrawnAt: {} }
  }
  const lingering = []
  const withdrawnAt = {}
  for (const { path, surface } of carried) {
    const series = attempts[path] ?? []
    const last = series[series.length - 1]
    if (!last || last[surface]) {
      lingering.push({ path, surface, attempts: series.length })
      continue
    }
    const first = series.findIndex((a) => !a[surface])
    withdrawnAt[`${path} ${surface}`] = first + 1
  }
  return lingering.length > 0
    ? { verdict: 'FAIL', reason: 'expired-wording-still-served', carried, lingering, withdrawnAt }
    : { verdict: 'PASS', reason: 'expired-wording-withdrawn', carried, lingering, withdrawnAt }
}
