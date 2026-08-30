/**
 * Side-effect CSS imports need a module declaration under TypeScript 6.
 *
 * `src/app/layout.tsx` does `import './globals.css'`. TypeScript 5 silently
 * allowed a side-effect import it could not resolve; TypeScript 6 reports
 * TS2882 instead, so the merge gate went red on a file nobody had touched.
 *
 * The declaration Next.js supplies for this lives in `next-env.d.ts`, which
 * `next build` generates and `.gitignore` (line 44) excludes — so it does not
 * exist in a fresh clone. CI runs `pnpm type-check` *before* `pnpm build`,
 * which means the generated file has never been present when this check runs.
 * The type-check was passing on an error TypeScript had not yet started
 * reporting, not on a declaration that was there.
 *
 * Hence a committed declaration rather than a build-order change: it holds in a
 * fresh clone, in CI, and in an editor opened before anything is built.
 */
declare module '*.css'
