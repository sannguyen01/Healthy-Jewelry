/**
 * **What each server function ships, as Next traced it — and nothing of the repository's own.**
 *
 * `next build` writes a `.nft.json` beside every server function: the files that function
 * can read at runtime, which Vercel packages with it. On 2026-10-04 the product share card
 * (`src/app/products/[handle]/opengraph-image.tsx`) read its two fonts through
 * `readFile(FONT_FILES.regular)` — a path held in an object — and Turbopack, unable to resolve
 * it, traced **the whole repository** into that function and the product page beside it: 752
 * files and 54 MB against ~250 files and 43 MB for every other route. The tests, the ADRs,
 * the scripts and the e2e specs, shipped as server code on every deploy.
 *
 * The build said so, as a warning: "Dynamic filesystem access causes tracing of the whole
 * project". A warning in a log nobody opens is ADR 011's whole finding, so the question is
 * asked of the traces themselves, in two directions:
 *
 * 1. **Nothing extra.** No trace may contain a repository file — anything outside
 *    `node_modules/` and `.next/` — unless `RUNTIME_READS` names it for that trace.
 * 2. **Nothing missing.** Every `RUNTIME_READS` file must be in the trace it is named for.
 *    Today two passes keep the fonts traced however the path is written: Turbopack's static
 *    evaluator folds a constant path (even `['public', 'fonts'].join('/')`), and the build's
 *    file-trace pass follows a partly unknown one by wildcard. On 2026-10-04 four mutations —
 *    the object path with `turbopackIgnore`, the literal path with it, a folded array join,
 *    and a directory taken from an environment variable — all kept them. This half exists
 *    because that generosity belongs to two tools rather than to this repository: a file
 *    missing from a trace is on every developer's disk and on no Vercel function, so nothing
 *    local would notice the share card failing with ENOENT in production.
 *
 * See [ADR 047](../../docs/adr/047-a-function-ships-what-it-traces.md).
 */

/**
 * Files a server function reads from the repository at runtime, each named for the trace
 * that must carry it (`trace`) and for any trace that may carry it too (`alsoIn`). A list
 * rather than a pattern: `public/**` would have admitted the nine public files the
 * whole-project trace swept in, which is the defect, not an exception.
 *
 * The product page is in `alsoIn` because it imports the card module for its metadata
 * (`opengraph-image--metadata.js`), so the same two reads are traced into it. It never calls
 * them, so it is allowed to carry them rather than required to.
 *
 * @type {ReadonlyArray<{ file: string, trace: string, alsoIn?: string[], reason: string }>}
 */
const CARD_TRACE = 'app/products/[handle]/opengraph-image/route'
const CARD_PAGE = 'app/products/[handle]/page'
export const RUNTIME_READS = Object.freeze([
  {
    file: 'public/fonts/NotoSans-regular.ttf',
    trace: CARD_TRACE,
    alsoIn: [CARD_PAGE],
    reason: 'the share card bundles its fonts rather than fetching them at request time',
  },
  {
    file: 'public/fonts/NotoSans-bold.ttf',
    trace: CARD_TRACE,
    alsoIn: [CARD_PAGE],
    reason: 'the share card bundles its fonts rather than fetching them at request time',
  },
])

/** A repository file, as opposed to a dependency or a build output. */
export function isRepositoryFile(relativePath) {
  return (
    !relativePath.startsWith('../') &&
    relativePath !== '..' &&
    !relativePath.startsWith('node_modules/') &&
    !relativePath.startsWith('.next/')
  )
}

/**
 * The verdict over traces already read: `{ traceName: repoRelativePaths[] }`.
 *
 * @param {Record<string, string[]>} traces
 * @param {ReadonlyArray<{ file: string, trace: string, alsoIn?: string[], reason: string }>} [runtimeReads]
 */
export function judgeTraces(traces, runtimeReads = RUNTIME_READS) {
  const names = Object.keys(traces).sort()
  if (names.length === 0) {
    return {
      status: /** @type {const} */ ('unevaluable'),
      traceCount: 0,
      strays: [],
      missing: [],
      reason:
        'no .nft.json traces were found under .next/server. Run `pnpm build` first; a scan of nothing finds nothing, which is not the same as finding nothing wrong (ADR 020).',
    }
  }

  const strays = []
  for (const name of names) {
    const allowed = new Set(
      runtimeReads.filter((r) => r.trace === name || (r.alsoIn ?? []).includes(name)).map((r) => r.file)
    )
    const files = traces[name].filter((f) => isRepositoryFile(f) && !allowed.has(f)).sort()
    if (files.length > 0) strays.push({ trace: name, files, byDirectory: countByDirectory(files) })
  }

  const missing = runtimeReads
    .filter((r) => !(traces[r.trace] ?? []).includes(r.file))
    .map((r) => ({ ...r, traceExists: r.trace in traces }))

  return {
    status: /** @type {const} */ (strays.length === 0 && missing.length === 0 ? 'ok' : 'failed'),
    traceCount: names.length,
    strays,
    missing,
  }
}

/** `src/tests/unit/a.test.ts` → `src/tests`; `CLAUDE.md` → `CLAUDE.md`. Two levels under `src/` and `docs/`. */
function countByDirectory(files) {
  const counts = {}
  for (const file of files) {
    const parts = file.split('/')
    const depth = parts[0] === 'src' || parts[0] === 'docs' ? 2 : 1
    const key = parts.length > depth ? parts.slice(0, depth).join('/') : file
    counts[key] = (counts[key] ?? 0) + 1
  }
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([directory, count]) => ({ directory, count }))
}

/**
 * What a reader sees in the job log, as lines so the wording is assertable.
 *
 * @param {ReturnType<typeof judgeTraces>} verdict
 * @returns {string[]}
 */
export function renderTraces(verdict) {
  if (verdict.status === 'unevaluable') return [`? server function traces — could not run: ${verdict.reason}`]

  const out = [
    `${verdict.strays.length === 0 ? '✓' : '✗'} no server function traces repository files (${verdict.traceCount} traces read)`,
  ]
  for (const stray of verdict.strays) {
    out.push('', `  · ${stray.trace}: ${stray.files.length} repository files`)
    for (const { directory, count } of stray.byDirectory.slice(0, 8)) out.push(`      ${String(count).padStart(4)}  ${directory}`)
    if (stray.byDirectory.length > 8) out.push(`      …and ${stray.byDirectory.length - 8} more directories`)
  }
  if (verdict.strays.length > 0) {
    out.push(
      '',
      'A function ships every file its trace names. Repository files in a trace almost always',
      'mean a filesystem read Turbopack could not resolve — a path from a variable or an object —',
      "so it traced everything (the build log's \"tracing of the whole project\" warning). Write the",
      "path at the call: readFile(path.join(process.cwd(), 'public/fonts/x.ttf')). If a function",
      'really reads a repository file at runtime, name it in RUNTIME_READS',
      '(scripts/lib/function-traces.mjs) with the trace it belongs to.'
    )
  }

  out.push('', `${verdict.missing.length === 0 ? '✓' : '✗'} every file a function reads at runtime is in its trace`)
  for (const m of verdict.missing) {
    out.push(`  · ${m.file} is not in ${m.trace}${m.traceExists ? '' : ' (no such trace was built)'} — ${m.reason}`)
  }
  if (verdict.missing.length > 0) {
    out.push(
      '',
      'Vercel packages a function with its trace and nothing else, so this file will not exist',
      'there at runtime even though every local run finds it on disk. Write the path at the',
      "call (path.join(process.cwd(), 'public/…')) so the build can follow it, or list the file",
      "in next.config.ts's outputFileTracingIncludes for that route."
    )
  }
  return out
}
