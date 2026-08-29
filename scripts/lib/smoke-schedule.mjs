/**
 * The production-smoke schedule, in one place, so the heartbeat's window and the
 * workflow's cron cannot drift apart.
 *
 * A monitor whose window is shorter than the interval it watches alarms on every quiet
 * gap; one whose window is much longer sleeps through a stopped tier. Neither failure is
 * visible from the monitor's own output, which is exactly the property that made this
 * whole workstream necessary — so `src/tests/unit/heartbeat-window.test.ts` parses the
 * cron out of `production-smoke.yml` and holds it against this constant.
 */
export const SMOKE_CRON_INTERVAL_HOURS = 6

/**
 * The outer bound on silence, and the outer bound on how rarely production may be
 * checked. **Neither derives from anything.**
 *
 * ## Why a second, independent anchor
 *
 * `heartbeat-window.test.ts` holds `DEFAULT_WINDOW_HOURS` against
 * `SMOKE_CRON_INTERVAL_HOURS`, which it asserts equals the cron in
 * `production-smoke.yml`. Every bound was therefore a *multiple of the number being
 * watched*, and that is a heartbeat with no fixed reference: widen the cron and widen the
 * window to match, and every assertion still passes while the tier goes silent for days.
 *
 * The distinction the bound restores is between "the patient is fine" and "the patient's
 * own pulse-reader broke". A monitor calibrated entirely against its subject cannot tell
 * those apart, because the subject is what moved.
 *
 * So these two are policy, written down once, answerable to nothing in the repository:
 *
 * - **48h** — production may not go unverified longer than two days, whatever the
 *   schedule says. Chosen as one weekend minus a margin: a Friday-evening break must be
 *   loud before Monday.
 * - **12h** — production must be checked at least twice a day. A schedule slower than
 *   this is not a slower heartbeat, it is a different decision, and it should fail the
 *   suite and be argued for rather than merged as a one-character edit to a cron.
 *
 * Changing either is a deliberate act with a diff and a reviewer. Changing the cron is
 * not — which is the whole reason these do not derive from it.
 *
 * See docs/adr/022-absence-needs-its-own-alarm.md.
 */
export const ABSOLUTE_MAX_WINDOW_HOURS = 48
export const MAX_ACCEPTABLE_SMOKE_INTERVAL_HOURS = 12
