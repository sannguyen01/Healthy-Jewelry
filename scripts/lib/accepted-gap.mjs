/**
 * When a deliberately-accepted control gap stops counting as deliberate.
 *
 * ## Why this is a file and not a constant in a test
 *
 * `ACCEPTED_GAP_MAX_AGE_DAYS` lived in exactly one place — a `const` inside
 * `src/tests/unit/control-registry.test.ts` — which was fine for as long as the only
 * consumer was that test. It is not any more: `probe-branch-protection.mjs` needs the same
 * threshold to decide whether an absent merge gate has gone from *accepted* to *forgotten*,
 * and a probe that redeclared `30` would be the two-writers-no-reader shape this repository
 * keeps paying for (`api-version.mjs` and `cacheTags.ts` exist for the same reason).
 *
 * A script cannot import from `src/tests`, and a test importing a script is the direction
 * this repo already uses everywhere. So the constant moves here, dependency-free, and both
 * sides read it.
 *
 * ## What the threshold means
 *
 * It is **not a deadline for fixing the gap**. It is a deadline for deciding again. A gap
 * nobody restates is indistinguishable from one nobody remembers, and the probe that watches
 * it stays quiet in either case — which is precisely the state `merge-gate` was in while
 * eleven commits reached `main` unverified.
 */

export const ACCEPTED_GAP_MAX_AGE_DAYS = 30

const MS_PER_DAY = 86_400_000

/**
 * Whole days since a control's gap was last consciously accepted.
 *
 * A control with no `acceptedSince` measures from the epoch, and therefore reads as
 * maximally stale. That is deliberate: "nobody wrote down when this was accepted" is a
 * worse state than "this was accepted a long time ago", not a reason to skip the check.
 *
 * @param {{ acceptedSince?: string }} control
 * @param {Date | number} [now]
 * @returns {number}
 */
export function daysSinceAccepted(control, now = new Date()) {
  const nowMs = now instanceof Date ? now.getTime() : now
  return Math.floor((nowMs - new Date(control?.acceptedSince ?? 0).getTime()) / MS_PER_DAY)
}

/**
 * @param {{ acceptedSince?: string }} control
 * @param {Date | number} [now]
 * @returns {boolean}
 */
export function isStale(control, now = new Date()) {
  return daysSinceAccepted(control, now) > ACCEPTED_GAP_MAX_AGE_DAYS
}
