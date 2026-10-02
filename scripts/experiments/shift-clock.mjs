// Preloaded with `node --import` by `scripts/experiment-claim-expiry.mjs`, and nowhere else.
//
// Moves this process's clocks forward by HJ_CLOCK_SHIFT_MS so a production server can be asked
// what it serves *after* a claim approval has lapsed, without waiting for the calendar and
// without a test-only seam in application code.
//
// **Both clocks, because they answer different questions.** `Date` is what the claim resolver
// reads to decide whether an approval has lapsed. Next's incremental cache does not use `Date`
// at all: it judges an entry's age with `performance.timeOrigin + performance.now()`
// (`next/dist/server/lib/incremental-cache/index.js`). The first version of this file moved
// only `Date`, on the reasoning that `performance` measures durations — and the experiment then
// reported FAIL for a build whose revalidation bound was correct, because the cache never saw
// any time pass. Measured 2026-09-27, before anything was concluded from it.
//
// HJ_CLOCK_JUMP_AT_MS (epoch milliseconds, real time) makes the move happen *during* the
// process's life rather than from its start. That is the real-world case — a server already
// running when the approval lapsed — and the only one that can show staleness: an entry loaded
// after the move is dated after the move, and is fresh. Unset or 0 means "moved from the start".

const shift = Number(process.env.HJ_CLOCK_SHIFT_MS ?? 0)
const jumpAt = Number(process.env.HJ_CLOCK_JUMP_AT_MS ?? 0)

if (Number.isFinite(shift) && shift !== 0) {
  const RealDate = Date
  const realNow = RealDate.now
  const offset = () => (Number.isFinite(jumpAt) && jumpAt > 0 && realNow() < jumpAt ? 0 : shift)
  const now = () => realNow() + offset()

  function ShiftedDate(...args) {
    if (!new.target) return new RealDate(now()).toString()
    return args.length === 0 ? new RealDate(now()) : new RealDate(...args)
  }
  ShiftedDate.prototype = RealDate.prototype
  ShiftedDate.now = now
  ShiftedDate.parse = RealDate.parse
  ShiftedDate.UTC = RealDate.UTC
  globalThis.Date = ShiftedDate

  // `timeOrigin + now()` is the cache's wall clock. timeOrigin is fixed, so moving now() moves it.
  const realPerformanceNow = performance.now.bind(performance)
  Object.defineProperty(performance, 'now', {
    configurable: true,
    value: () => realPerformanceNow() + offset(),
  })
}
