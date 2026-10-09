/**
 * The viewport width from which the header shows the brand name beside the knot mark, read out
 * of the stylesheet: `globals.css` sets the name to `display: none` up to one pixel below it.
 *
 * One reader for three consumers — `doc-numeric-claims.test.ts` (CLAUDE.md states it),
 * `design-consistency.test.ts` (DESIGN.md states it) and `e2e/header-fit.spec.ts` (the browser
 * must agree with it). Each used to carry its own copy of this regex or of the number, so a
 * refactor of the rule had three places to go stale. Returns `undefined` when the rule is not
 * found, which every caller treats as a failure rather than a default.
 */
export function nameShownFromPx(css: string): number | undefined {
  const hiddenTo = css.match(
    /@media \(max-width: (\d+)px\)\s*\{[^@]*?\.hj-lockup-text\s*\{\s*display:\s*none/
  )?.[1]
  return hiddenTo === undefined ? undefined : Number(hiddenTo) + 1
}
