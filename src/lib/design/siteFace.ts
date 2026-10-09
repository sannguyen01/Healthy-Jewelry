/**
 * **The site's faces, for the documents that are not rendered inside the layout.**
 *
 * `next/font` puts the site's faces on every page by wrapping them in hashed `@font-face` rules
 * and CSS variables on `<html>`. Two documents are not rendered inside that layout, and neither
 * can reach either:
 *
 * - the 410 page a retired URL (`/checkout`, `/orders/…`) answers with, which is a plain
 *   `Response` built from a string (`src/lib/http/goneResponse.ts`);
 * - `global-error.tsx`, which replaces the root layout when it fails, `<html>` included.
 *
 * Both used to name a stack the visitor's machine decides: the first `system-ui, -apple-system,
 * "Segoe UI"` (San Francisco on a Mac, Segoe on Windows, Roboto on Android), the second a family
 * nothing defined there, so plain `sans-serif`. A visitor who followed an old link saw the one
 * page of the site set in their operating system's type.
 *
 * So they declare the faces themselves, from files in `public/fonts/` at stable URLs (the
 * loader's own are content-hashed per build). Those files are the loader's, byte for byte;
 * `type-system-floor.test.ts` compares them, so a copy cannot drift from the source.
 *
 * **Three voices, one file each** (ADR 051): the 24pt Bodoni Moda cut for the heading, DM Sans for
 * running text, Barlow Condensed 500 for the label and the button. Only what these two documents
 * set, and `font-synthesis: none` so nothing is drawn that was not shipped (ADR 050).
 */

export type SiteVoice = 'title' | 'body' | 'label'

export interface SiteFace {
  readonly voice: SiteVoice
  readonly family: string
  readonly weight: 400 | 500
  /** The loader's file in `src/app/fonts/`; the public copy has the same name. */
  readonly file: string
}

export const SITE_FACES: readonly SiteFace[] = [
  { voice: 'title', family: 'Bodoni Moda', weight: 400, file: 'bodoni-moda-24pt-latin-400.woff2' },
  { voice: 'body', family: 'DM Sans', weight: 400, file: 'dm-sans-9pt-latin-400.woff2' },
  { voice: 'label', family: 'Barlow Condensed', weight: 500, file: 'barlow-condensed-latin-500.woff2' },
]

/** One stack per voice, each ending in a generic keyword and naming no installed font. */
export const SITE_STACKS: Readonly<Record<SiteVoice, string>> = {
  title: '"Bodoni Moda", serif',
  body: '"DM Sans", sans-serif',
  label: '"Barlow Condensed", sans-serif',
}

/** Public URL of each face. */
export const SITE_FACE_FILES = SITE_FACES.map((face) => ({ ...face, url: `/fonts/${face.file}` }))

/** One `@font-face` rule per face, for a `<style>` in a document outside the layout. */
export const SITE_FACE_FONT_FACE_CSS = SITE_FACE_FILES.map(
  ({ family, weight, url }) =>
    `@font-face{font-family:"${family}";font-style:normal;font-weight:${weight};` +
    `font-display:swap;src:url("${url}") format("woff2")}`
).join('\n')
