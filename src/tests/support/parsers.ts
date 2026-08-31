import { parse } from 'yaml'

/**
 * **The readers three reconciliation tests depend on, extracted so they can be exercised
 * against inputs nobody wrote by hand.**
 *
 * ## Why these, and why now
 *
 * `sitemap-completeness`, `preflight-enumeration` and `workflow-condition-contract` are
 * often described as this repository's three hand-maintained enumerations. They are not —
 * each already reconciles its list against a real source of truth: the filesystem, the
 * workflow YAML, the parsed document. That is the strong half.
 *
 * The weak half is one layer down. Each of those checks is only as wide as the reader that
 * feeds it, and **a reader that returns less than it should does not fail — it narrows the
 * question and passes.** Every one of them carries a hand-written "the parse found
 * something" anchor, which catches the reader returning *nothing* and says nothing at all
 * about the reader returning *half*.
 *
 * Fuzzing the credential classifier found three crash paths before any of them reached
 * production, against a track record of finding the previous three by incident. These are
 * the same shape of function — total, pure, and fed by inputs the author does not control —
 * so they get the same treatment. See `parser-fuzz.test.ts` for the properties.
 */

/* ------------------------------------------------------------------ preflight arguments */

type Step = { name?: string; if?: unknown; run?: unknown; uses?: string; with?: Record<string, unknown> }
type Job = { if?: unknown; steps?: Step[] }
type Workflow = { jobs?: Record<string, Job> }

/**
 * The secret names passed to `preflight-secrets.mjs` in a workflow.
 *
 * This was a regex over the raw file:
 *
 *     /node scripts\/preflight-secrets\.mjs((?:\s*\\\s*\n\s*[A-Z_][A-Z0-9_]*)+)/
 *
 * which encoded one exact rendering — one argument per line, each continued with a
 * backslash, each name uppercase. It is right about today's file and silent about every
 * other way YAML can express the same command. The dangerous failures were never the
 * reformat that returns nothing (the liveness anchor catches that); they were the ones that
 * return **some** of the names: an argument list folded onto one line, or the redirect
 * moved ahead of the arguments, and the check quietly stops covering the rest.
 *
 * So: parse the document, find the step that invokes the script, and tokenise its command.
 * A regex guardrail has unknown coverage (ADR 007) — and `yaml` is already a devDependency
 * precisely so structural questions can be asked structurally.
 */
export function preflightArguments(source: string, script = 'scripts/preflight-secrets.mjs'): string[] {
  let doc: Workflow
  try {
    doc = parse(source) as Workflow
  } catch {
    return []
  }

  for (const job of Object.values(doc?.jobs ?? {})) {
    for (const step of job?.steps ?? []) {
      if (typeof step?.run !== 'string' || !step.run.includes(script)) continue
      return commandArguments(step.run, script)
    }
  }
  return []
}

/**
 * The bare words following `node <script>` in a shell command, stopping at the first token
 * that is not one — a redirect, a pipe, a separator, a flag, or the next command.
 *
 * Line continuations are joined first, so the same list is produced whether the arguments
 * are spread across lines or written on one.
 *
 * ## Two boundaries the first draft did not have, both found by generated input
 *
 * **An un-continued newline starts a new command.** `node …mjs A B\necho done` was read as
 * five arguments, because `split(/\s+/)` treats a newline like a space. That is the
 * dangerous direction: not a short list, which the consumer's liveness anchor would catch,
 * but a *longer* one — `echo` and `done` presented as secrets the preflight covers. The
 * reconciliation downstream would then report a mismatch against names nobody wrote.
 *
 * **A separator glued to a word ends the list at that word.** `A; echo done` yielded
 * `['A;', 'echo', 'done']`.
 *
 * Neither shape appears in `production-smoke.yml` today. Both were one reformat away, and
 * neither would have announced itself as a parser bug — it would have arrived as a
 * confusing failure in a test about secrets.
 */
export function commandArguments(run: string, script: string): string[] {
  const joined = run.replace(/\\\s*\n\s*/g, ' ')
  const index = joined.indexOf(script)
  if (index === -1) return []

  // Only this command. Anything past an un-continued newline belongs to the next one.
  const rest = joined.slice(index + script.length).split('\n')[0]

  const args: string[] = []
  for (const token of rest.split(/\s+/)) {
    if (!token) continue
    // A flag or a numbered redirect (`2>&1`) is not an argument, and neither is anything
    // after it — everything this script takes is a bare secret name.
    if (token.startsWith('-') || /^\d*[<>]/.test(token)) break

    const separator = token.search(/[|;&<>]/)
    if (separator === 0) break
    if (separator > 0) {
      args.push(token.slice(0, separator))
      break
    }
    args.push(token)
  }
  return args
}

/* ------------------------------------------------------------------ workflow conditions */

export type Condition = { where: string; condition: string }

/** Every `if:` in a workflow, job-level and step-level, with a human-readable location. */
export function conditions(source: string): Condition[] {
  let doc: Workflow
  try {
    doc = parse(source) as Workflow
  } catch {
    return []
  }

  const found: Condition[] = []
  for (const [jobId, job] of Object.entries(doc?.jobs ?? {})) {
    if (typeof job?.if === 'string') {
      found.push({ where: `job "${jobId}"`, condition: job.if.trim() })
    }
    for (const [index, step] of (job?.steps ?? []).entries()) {
      if (typeof step?.if !== 'string') continue
      const label = step.name ? `"${step.name}"` : `step #${index + 1}`
      found.push({ where: `job "${jobId}" → ${label}`, condition: step.if.trim() })
    }
  }
  return found
}

/* ----------------------------------------------------------------------- app router walk */

export type DirEntry = { name: string; isDirectory: boolean }
/** Lists one directory of the app tree, addressed relative to `src/app`. */
export type ReadDir = (relativePath: string) => DirEntry[]

/**
 * Every URL path the App Router serves a page for.
 *
 * Two Next.js conventions are handled that the original walk did not know about, and both
 * are silent when wrong rather than loud:
 *
 * - **Route groups** — `(marketing)/deals/page.tsx` serves `/deals`. The walk used to emit
 *   `/(marketing)/deals`, a string no browser ever requests. The sitemap reconciler would
 *   then demand that non-route be classified, *and* would never notice that the real
 *   `/deals` was missing from the sitemap. A false finding standing in for a true one.
 * - **Parallel routes** — `@modal/page.tsx` is a slot rendered inside another route's
 *   layout, not a page anybody can navigate to. Emitting it would be the same error in the
 *   other direction: a route classified that does not exist.
 *
 * Neither convention is used in this repository today, which is exactly why they are worth
 * handling now: the day someone adds a route group, nothing would have said the sitemap
 * check had stopped seeing real routes.
 */
export function pageRoutes(readDir: ReadDir, dir = '', prefix = ''): string[] {
  const routes: string[] = []

  for (const entry of readDir(dir)) {
    if (entry.isDirectory) {
      // `api/` holds route handlers, not pages; private folders start with `_`; `@slot`
      // directories are parallel-route slots and serve no URL of their own.
      if (entry.name === 'api' || entry.name.startsWith('_') || entry.name.startsWith('@')) continue

      // A `(group)` organises files without contributing a URL segment.
      const isGroup = entry.name.startsWith('(') && entry.name.endsWith(')')
      const nextPrefix = isGroup ? prefix : `${prefix}/${entry.name}`
      routes.push(...pageRoutes(readDir, dir === '' ? entry.name : `${dir}/${entry.name}`, nextPrefix))
    } else if (entry.name === 'page.tsx') {
      routes.push(prefix === '' ? '/' : prefix)
    }
  }

  return routes
}
