/**
 * **The site's face, for the documents that are not rendered inside the layout.**
 *
 * `next/font` puts the site face on every page by wrapping it in a hashed `@font-face` and a
 * CSS variable on `<html>`. Two documents are not rendered inside that layout, and neither can
 * reach either:
 *
 * - the 410 page a retired URL (`/checkout`, `/orders/…`) answers with, which is a plain
 *   `Response` built from a string (`src/lib/http/goneResponse.ts`);
 * - `global-error.tsx`, which replaces the root layout when it fails, `<html>` included.
 *
 * Both used to name a stack the visitor's machine decides: the first `system-ui, -apple-system,
 * "Segoe UI"` (San Francisco on a Mac, Segoe on Windows, Roboto on Android), the second
 * `"Zen Kaku Gothic Antique", sans-serif`, a family nothing defines there, so plain
 * `sans-serif`. A visitor who followed an old link saw the one page of the site set in their
 * operating system's type.
 *
 * So they declare the face themselves, from two files in `public/fonts/` at stable URLs (the
 * loader's own are content-hashed per build). Those files are the loader's, byte for byte;
 * `site-face.test.ts` compares them, so a copy cannot drift from the source. Only the two weights
 * the site ships, and `font-synthesis: none` so nothing is drawn that was not shipped (ADR 050).
 */

export const SITE_FACE_FAMILY = 'Zen Kaku Gothic Antique'

/** The stack for a document that declares {@link SITE_FACE_FONT_FACE_CSS}. */
export const SITE_FACE_STACK = `"${SITE_FACE_FAMILY}", sans-serif`

/** Public URL → weight, the only two weights the site ships. */
export const SITE_FACE_FILES = [
  { weight: 400, url: '/fonts/zen-kaku-gothic-antique-latin-400.woff2' },
  { weight: 500, url: '/fonts/zen-kaku-gothic-antique-latin-500.woff2' },
] as const

/** Two `@font-face` rules, for a `<style>` in a document outside the layout. */
export const SITE_FACE_FONT_FACE_CSS = SITE_FACE_FILES.map(
  ({ weight, url }) =>
    `@font-face{font-family:"${SITE_FACE_FAMILY}";font-style:normal;font-weight:${weight};` +
    `font-display:swap;src:url("${url}") format("woff2")}`
).join('\n')
