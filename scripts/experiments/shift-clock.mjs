// Preloaded with `node --import` by `scripts/experiment-claim-expiry.mjs`, and nowhere else.
//
// Shifts this process's wall clock by HJ_CLOCK_SHIFT_MS so a production server can be asked
// what it serves *after* a claim approval has lapsed, without waiting for the calendar and
// without a test-only seam in application code. Everything that reads the time through `Date`
// — the claim resolver, and Next's own incremental-cache staleness check — sees the shifted
// clock. `performance.now()` is untouched; it measures durations, not dates.

const shift = Number(process.env.HJ_CLOCK_SHIFT_MS ?? 0)

if (Number.isFinite(shift) && shift !== 0) {
  const RealDate = Date
  function ShiftedDate(...args) {
    if (!new.target) return new RealDate(RealDate.now() + shift).toString()
    return args.length === 0 ? new RealDate(RealDate.now() + shift) : new RealDate(...args)
  }
  ShiftedDate.prototype = RealDate.prototype
  ShiftedDate.now = () => RealDate.now() + shift
  ShiftedDate.parse = RealDate.parse
  ShiftedDate.UTC = RealDate.UTC
  globalThis.Date = ShiftedDate
}
