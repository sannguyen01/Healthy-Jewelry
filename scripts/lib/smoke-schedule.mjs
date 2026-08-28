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
