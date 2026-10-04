/**
 * One query-string value as the single string a page means by it.
 *
 * Next types a page's `searchParams` loosely and fills them literally: `?q=ring` arrives as
 * `'ring'`, but `?q=ring&q=band` arrives as `['ring', 'band']`. `/search` declared `q?: string`
 * and called `.trim()` on it, so the repeated form threw inside the results boundary and the
 * page showed "Something went wrong" (found 2026-10-04 by probing the running build). A link
 * that repeats a parameter is ordinary — a form with two fields of one name, a hand-edited URL,
 * a crawler — and must get a page, not an error. The first value wins, as it does for
 * `URLSearchParams.get`.
 */
export function firstParam(value: string | readonly string[] | undefined): string {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return typeof value[0] === 'string' ? value[0] : ''
  return ''
}
