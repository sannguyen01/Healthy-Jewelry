/**
 * The arrow that ends a destination link ("View all", "The materials page", a row of the
 * collection index). An inline SVG and never the glyph U+2192: the latin slice the site ships has
 * no arrow, so a glyph would be drawn by the fallback face in the middle of a label
 * (`e2e/glyph-coverage.spec.ts`). Decorative; the words beside it are the link's name.
 */
export function ArrowIcon() {
  return (
    <svg width="14" height="10" viewBox="0 0 14 10" fill="none" aria-hidden="true" focusable="false">
      <path d="M0 5h12M8 1l4 4-4 4" stroke="currentColor" strokeWidth="1.25" />
    </svg>
  )
}

export default ArrowIcon
