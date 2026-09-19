#!/usr/bin/env node
/**
 * **A security patch may not carry a major-version migration in with it.**
 *
 * ## The judgement this automates
 *
 * PR #60 proposed `next` 15.5.24 → 16.3.3 to close two Critical RCEs. The advisory was
 * real and the urgency was real, and bundled with them was a framework major that this
 * repository had never compiled, linted or tested against — the same class of change as
 * the `eslint-config-next` 16.x and `@vitejs/plugin-react` 6.x bumps that were merged
 * unverified on 2026-08-29 and left `main` unbuildable for a day.
 *
 * PR #61 got it right: it patched the CVE *inside* `next@15` and declined the major. That
 * was good judgement, exercised once, by whoever happened to read the diff carefully while
 * a Critical advisory was applying pressure to merge quickly. Nothing made it repeatable,
 * and PR #60 is still open.
 *
 * `loop-constraints.md` already required exactly this — "dependency major-version bumps
 * (`next`, `react`, `react-dom`, any `@shopify/*` package) … must escalate with written
 * rationale". It was prose, addressed to a loop, enforced by nobody. This is that rule
 * with a reader.
 *
 * ## What it does not claim
 *
 * `main` has no branch protection, so a check that fails blocks nothing — it puts a red X
 * next to a merge button anybody can still press. This is a real limit and it is recorded
 * here rather than in a comment nobody reads: the value now is that a bundled major is
 * *visible and named* at review time instead of being noticed or not. It becomes a gate on
 * the day the merge gate does. See docs/adr/018 on the difference between a claim about a
 * control and a control.
 *
 * ## Usage
 *
 *   node scripts/audit-dependency-scope.mjs --base <ref> [--head <ref>] [--json]
 *
 * The pull request description is read from the file named by `PR_BODY_FILE`, falling
 * back to `PR_BODY` in the environment — never interpolated into a shell command, because
 * a PR body is attacker-controlled text and `${{ github.event.pull_request.body }}` inside
 * a `run:` is a shell injection with a friendly name. See `resolvePrBody` for why the file
 * exists and why the environment variable alone made this check unsatisfiable.
 *
 * Exits 0 when nothing needs escalating or every escalation is justified; 1 otherwise.
 */

import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')
const MANIFEST = 'package.json'
const CONSTRAINTS = 'loop-constraints.md'

/**
 * How each `resolvePrBody` source reads in the run log. Printed on every run, passing or
 * failing: "which description did you read" is the question this check got wrong, and the
 * answer costs one line. A regression to the frozen payload then shows up as a sentence in
 * the log rather than as a check that mysteriously will not clear.
 */
const PR_BODY_SOURCES = {
  api: 'the GitHub API (live — reflects edits made since the last push)',
  payload: 'the webhook event payload (frozen at the event — edits since are invisible)',
  absent: 'nowhere — neither PR_BODY_FILE nor PR_BODY was set',
}

const DEPENDENCY_FIELDS = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']

/**
 * The packages whose major bumps require a written rationale, read from the
 * ```escalation-majors``` fence in loop-constraints.md.
 *
 * Read as data rather than parsed out of the sentence, the same convention
 * `gate-denylist-contract.test.ts` and `required-checks-contract.test.ts` use. A guardrail
 * that guesses at grammar has unknown coverage (ADR 007), and the failure mode here is the
 * quiet one: a name this function does not find is a name nothing escalates.
 *
 * @param {string} source
 * @returns {string[]}
 */
export function escalationMajors(source) {
  const match = source.match(/^([ \t]*)```escalation-majors\n([\s\S]*?)^\1```$/m)
  if (!match) return []
  return match[2]
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}

/**
 * Does a package name fall under a listed pattern? Supports a trailing `*` for scopes.
 *
 * @param {string} name
 * @param {string[]} patterns
 */
export function isEscalated(name, patterns) {
  return patterns.some((pattern) =>
    pattern.endsWith('*') ? name.startsWith(pattern.slice(0, -1)) : name === pattern
  )
}

/**
 * The major component of a semver range, ignoring `^`, `~`, `>=`, `v` and whitespace.
 *
 * Returns `null` for anything this cannot read as a version — a git URL, `workspace:*`,
 * `latest`. An unreadable range must not be silently treated as major 0, which would make
 * every change to it look like a major bump and train people to ignore this check.
 *
 * @param {string} range
 * @returns {number | null}
 */
export function majorOf(range) {
  if (typeof range !== 'string') return null
  const match = range.trim().match(/^[\^~><=\s]*v?(\d+)\./)
  return match ? Number(match[1]) : null
}

/**
 * Every dependency whose declared range changed between two manifests.
 *
 * @param {object} basePkg
 * @param {object} headPkg
 * @returns {Array<{ name: string, field: string, from: string | null, to: string | null, bump: string }>}
 */
export function classifyManifestChange(basePkg, headPkg) {
  /** @type {Array<{ name: string, field: string, from: string | null, to: string | null, bump: string }>} */
  const changes = []

  for (const field of DEPENDENCY_FIELDS) {
    const before = basePkg?.[field] ?? {}
    const after = headPkg?.[field] ?? {}

    for (const name of new Set([...Object.keys(before), ...Object.keys(after)])) {
      const from = before[name] ?? null
      const to = after[name] ?? null
      if (from === to) continue

      if (from === null) {
        changes.push({ name, field, from, to, bump: 'added' })
        continue
      }
      if (to === null) {
        changes.push({ name, field, from, to, bump: 'removed' })
        continue
      }

      const fromMajor = majorOf(from)
      const toMajor = majorOf(to)
      let bump = 'unreadable'
      if (fromMajor !== null && toMajor !== null) {
        // Only the major matters to this check. Everything below it — including the
        // 15.5.24 patch that closed two Critical RCEs — is exactly the change this rule
        // exists to let through unimpeded.
        bump = toMajor > fromMajor ? 'major' : toMajor < fromMajor ? 'downgrade' : 'within-major'
      }
      changes.push({ name, field, from, to, bump })
    }
  }

  return changes.sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * Does the pull request description carry a written rationale?
 *
 * Deliberately shallow: it asks whether somebody wrote a paragraph under a heading that
 * names the decision, not whether the paragraph is any good. A check that tried to judge
 * the reasoning would be guessing, and a check that accepted an empty heading would be a
 * box to tick. Per ADR 007, the coverage here is bounded and stated rather than claimed.
 *
 * @param {string} body
 */
export function hasWrittenRationale(body) {
  if (typeof body !== 'string') return false
  const heading = body.match(/^#{1,6}\s*(?:written\s+)?rationale\s*$/im)
  if (!heading) return false
  const after = body.slice((heading.index ?? 0) + heading[0].length)
  // At least one non-heading line with real prose under it.
  return after
    .split('\n')
    .some((line) => line.trim().length >= 40 && !line.trim().startsWith('#'))
}

/**
 * Where the pull request description is read from, and from which of the two possible
 * pull request descriptions.
 *
 * ## The defect this exists because of
 *
 * There is only one description, but there are two readings of it, and from the day this
 * check shipped (2026-08-31) to the day it was first called on (2026-09-18) it took the
 * wrong one — which nothing noticed, because until PR #73 no pull request had actually
 * flagged a major. `PR_BODY` was set from `${{ github.event.pull_request.body }}`
 * — the description **as it stood when the event fired**, frozen into the webhook payload.
 * A `pull_request` workflow fires on `opened`, `synchronize` and `reopened`, none of which
 * is "somebody edited the description", and a *re-run replays the original payload*
 * verbatim rather than re-reading anything.
 *
 * Compose those two facts and the check is **unsatisfiable by the one action it asks
 * for**. It prints "write a `## Rationale` section"; you write one; nothing re-reads it.
 * Not on save, because no event fires. Not on re-run, because the re-run is the same
 * frozen payload. The only sequence that ever cleared it was *edit the description, then
 * push a commit* — which nobody would guess and nothing said. PR #73 met this exactly: the
 * rationale was written, `hasWrittenRationale` accepted it locally, and the check stayed
 * red through a re-run because it was still reading the body from before the edit.
 *
 * A control that cannot observe the thing it demands is the shape
 * [ADR 018](../docs/adr/018-a-claim-about-a-control-is-not-a-control.md) names — a claim
 * about a control rather than a control. It arrived here through a workflow input rather
 * than through the logic, which is why every unit test of `hasWrittenRationale` passed
 * while the check was, in production, incapable of going green.
 *
 * ## Why a file rather than a bigger environment variable
 *
 * The live body is fetched in the workflow and handed over as a **path**. A description is
 * attacker-controlled text: interpolating it into a `run:` line is a shell injection with
 * a friendly name, and writing it into `$GITHUB_ENV` is the same injection one layer down
 * — a body containing the heredoc delimiter rewrites the environment of every later step.
 * A path is runner-controlled and fixed-shape; the bytes never pass through a shell.
 *
 * ## Why a named-but-unreadable file throws
 *
 * Falling back to `''` would convert a *broken fetch* into a *missing rationale*: the
 * check would print "no written rationale" at somebody who had written one, which is the
 * failure it was just repaired for. Naming a file is a statement that the file is there.
 *
 * Typed as a plain string record rather than `NodeJS.ProcessEnv`: this repository
 * augments that interface with required keys (`NODE_ENV` among them), and demanding them
 * of a caller that only supplies the two variables under test would make the parameter a
 * type nobody can construct. The function reads two optional keys and nothing else, which
 * is exactly what the signature should say.
 *
 * @param {Record<string, string | undefined>} [env]
 * @param {(p: string) => string} [readFile]
 * @returns {{ body: string, source: 'api' | 'payload' | 'absent' }}
 */
export function resolvePrBody(env = process.env, readFile = (p) => fs.readFileSync(p, 'utf8')) {
  const file = env.PR_BODY_FILE
  if (typeof file === 'string' && file.trim() !== '') {
    try {
      return { body: readFile(file), source: 'api' }
    } catch (error) {
      throw new Error(
        `PR_BODY_FILE is set to ${file}, which cannot be read: ${error.message}. That is a ` +
          'broken workflow step, not a missing rationale — refusing to report one as the ' +
          'other.'
      )
    }
  }

  // The event-payload path, kept for a local invocation (`PR_BODY="..." node …`) and for
  // the unit suite. In CI the workflow sets PR_BODY_FILE and this branch is not reached;
  // `source` is reported on every run so a regression to the frozen body is visible in the
  // log rather than inferred from a check that mysteriously will not clear.
  if (typeof env.PR_BODY === 'string') return { body: env.PR_BODY, source: 'payload' }

  return { body: '', source: 'absent' }
}

/**
 * The verdict.
 *
 * @param {{ changes: ReturnType<typeof classifyManifestChange>, majors: string[], prBody: string }} input
 */
export function requiresRationale({ changes, majors, prBody }) {
  const flagged = changes.filter((c) => c.bump === 'major' && isEscalated(c.name, majors))
  const justified = hasWrittenRationale(prBody)

  return {
    flagged,
    justified,
    ok: flagged.length === 0 || justified,
    summary:
      flagged.length === 0
        ? 'No major-version bump on an escalation-listed package.'
        : justified
          ? `${flagged.length} escalation-listed major bump(s), each covered by the ` +
            'written rationale in the pull request description.'
          : `${flagged.length} escalation-listed major bump(s) with no written rationale:\n` +
            flagged.map((c) => `  · ${c.name} ${c.from} → ${c.to}`).join('\n'),
  }
}

/** @param {string[]} args @param {string} flag */
/**
 * Production dependencies that no source file imports.
 *
 * ## The one that paid for this
 *
 * `framer-motion` sat in `dependencies` with **zero** import sites anywhere in `src/`,
 * under either of its package names. It contributed 0 bytes to the bundle — nothing
 * imports it, so Next tree-shakes it out entirely — and it still cost:
 *
 *   · 5.9 MB in node_modules across 3 transitive packages;
 *   · two dependabot pull requests, #53 and #67;
 *   · one of those, #53, a **two-major** jump (11.18.2 -> 13.1.1) merged unverified
 *     during the 2026-08-29 CI blackout;
 *   · a standing CVE surface — an advisory in framer-motion, motion-dom or motion-utils
 *     raises an alert on this repository for code that never executes.
 *
 * None of that is visible from the bundle, which is why it survived. A dependency's cost
 * is not only what it ships.
 *
 * ## Why an allowlist is not optional
 *
 * Plenty of legitimate dependencies are never imported from `src/`: `react-dom` is Next's
 * peer requirement, `tailwindcss` and `postcss` run at build time through config files,
 * `typescript` is invoked as a binary. A check without the allowlist false-positives on
 * all of them on day one — and a detector that cries wolf immediately loses its reader,
 * which is exactly the reasoning `collectionSetPremise` records for exempting `frontpage`.
 *
 * Every entry carries the reason it is there, because an unexplained exemption is
 * indistinguishable from an oversight ([ADR 019](../docs/adr/019-an-unclassified-entry-is-an-unverified-one.md)).
 *
 * @param {Record<string, string>} dependencies  the manifest's `dependencies` block
 * @param {string[]} importedSpecifiers          every module specifier imported under src/
 * @param {Record<string, string>} [allowlist]   name -> why it is never imported
 * @returns {{ ok: boolean, unused: string[], summary: string }}
 */
export function unusedDependencies(dependencies, importedSpecifiers, allowlist = NOT_IMPORTED_BY_DESIGN) {
  const imported = new Set()
  for (const specifier of importedSpecifiers) {
    // `next/font/google` counts as a use of `next`; `@upstash/redis/foo` of `@upstash/redis`.
    // Scoped packages keep two segments, everything else keeps one.
    const parts = specifier.split('/')
    imported.add(specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0])
  }

  const unused = Object.keys(dependencies ?? {})
    .filter((name) => !imported.has(name))
    .filter((name) => !(name in allowlist))
    .sort()

  if (unused.length === 0) {
    return {
      ok: true,
      unused: [],
      summary: `All ${Object.keys(dependencies ?? {}).length} production dependencies are imported, or exempt with a stated reason.`,
    }
  }

  return {
    ok: false,
    unused,
    summary:
      `${unused.length} production dependenc${unused.length === 1 ? 'y is' : 'ies are'} ` +
      `imported by nothing under src/: ${unused.join(', ')}.\n\n` +
      'Remove it, or add it to NOT_IMPORTED_BY_DESIGN in this file with the reason it is ' +
      'here. A dependency nobody imports still accrues dependabot pull requests, CVE ' +
      'advisories and major-version decisions — framer-motion cost all three while ' +
      'contributing zero bytes to the bundle.',
  }
}

/**
 * Production dependencies that legitimately have no import site under `src/`.
 *
 * Each value is the reason. A bare list would be a list nobody could audit.
 */
export const NOT_IMPORTED_BY_DESIGN = {
  'react-dom':
    "Next.js's own peer requirement. The framework renders with it; application code " +
    'never imports it directly, and removing it breaks the build.',
}

/**
 * Every module specifier imported anywhere under `src/`.
 *
 * Text-scanned rather than parsed, deliberately and with a stated limit: this runs in a
 * dependency-free CI job (see the header) that does no `pnpm install`, so the TypeScript
 * AST scanner this repository prefers is not available to it. The consequence is bounded
 * in the safe direction — a specifier inside a comment counts as an import, so the check
 * can only ever *miss* an unused dependency, never invent one. A false negative here is a
 * dependency that survives a little longer; a false positive would be a green check
 * demanding you delete something load-bearing.
 *
 * @param {string} dir
 * @returns {string[]}
 */
export function importedSpecifiersUnder(dir) {
  const found = []
  const pattern = /(?:from\s*|import\s*\(\s*|require\(\s*)['"`]([^'"`]+)['"`]/g

  /** @param {string} current */
  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name)
      if (entry.isDirectory()) {
        walk(full)
      } else if (/\.(ts|tsx|js|jsx|mjs)$/.test(entry.name)) {
        for (const match of fs.readFileSync(full, 'utf8').matchAll(pattern)) {
          // Relative and alias imports are not packages.
          if (!match[1].startsWith('.') && !match[1].startsWith('@/')) found.push(match[1])
        }
      }
    }
  }

  walk(dir)
  return found
}

function arg(args, flag) {
  const i = args.indexOf(flag)
  return i === -1 ? undefined : args[i + 1]
}

/** @param {string} ref */
function manifestAt(ref) {
  try {
    const raw = execFileSync('git', ['show', `${ref}:${MANIFEST}`], {
      cwd: ROOT,
      encoding: 'utf8',
    })
    return JSON.parse(raw)
  } catch (error) {
    throw new Error(`Cannot read ${MANIFEST} at ${ref}: ${error.message}`)
  }
}

async function main() {
  const args = process.argv.slice(2)
  const base = arg(args, '--base')
  const head = arg(args, '--head')

  if (!base) {
    console.error('--base <ref> is required. Nothing to compare against.')
    process.exit(2)
  }

  const majors = escalationMajors(fs.readFileSync(path.join(ROOT, CONSTRAINTS), 'utf8'))
  if (majors.length === 0) {
    // A parse that finds nothing must fail loudly. An empty list here would let every
    // major through while the check reported green — the exact shape of a guardrail that
    // silently matches nothing.
    console.error(
      `No \`escalation-majors\` fence found in ${CONSTRAINTS}. This check cannot run ` +
        'against an empty list: it would pass everything and report success.'
    )
    process.exit(2)
  }

  const changes = classifyManifestChange(
    manifestAt(base),
    head ? manifestAt(head) : JSON.parse(fs.readFileSync(path.join(ROOT, MANIFEST), 'utf8'))
  )
  const { body: prBody, source: prBodySource } = resolvePrBody()
  const result = requiresRationale({ changes, majors, prBody })

  // A second, independent question on the same manifest: is anything here unused?
  //
  // Reported on every run and folded into the exit status, because unlike the escalation
  // check this one is always answerable from the head commit alone — it needs no base ref
  // and no PR body. Its failure names the package and the fix.
  //
  // Computed **before** the branch below, not after it. It was declared underneath and
  // referenced inside the `--json` arm, which is a temporal dead zone: every `--json`
  // invocation died with `ReferenceError: Cannot access 'unused' before initialization`.
  // The human-readable arm never touched it, so the mode CI runs was fine and the mode a
  // person reaches for when debugging CI was the broken one.
  const unused = unusedDependencies(
    JSON.parse(fs.readFileSync(path.join(ROOT, MANIFEST), 'utf8')).dependencies ?? {},
    importedSpecifiersUnder(path.join(ROOT, 'src'))
  )

  if (args.includes('--json')) {
    console.log(JSON.stringify({ majors, changes, prBodySource, ...result, unused }, null, 2))
  } else {
    console.log(`${result.ok ? '✓' : '✗'} dependency scope`)
    console.log('')
    console.log(result.summary)
    console.log('')
    console.log(`Pull request description read from: ${PR_BODY_SOURCES[prBodySource]}`)
    if (!result.ok) {
      console.log('')
      console.log(
        'A major-version bump on one of these packages needs a `## Rationale` section in ' +
          'the pull request description saying why this major, why now, and what was ' +
          'checked against it.\n\n' +
          'Then **re-run this job** — it reads the description live from the API, so a ' +
          'rationale written after the last push is picked up without needing a commit ' +
          'on top of it.\n\n' +
          'If this arrived bundled with a security advisory: patch the CVE inside the ' +
          'current major and open the migration separately. That is what PR #61 did, and ' +
          'it is the reason this check exists.'
      )
    }
  }

  if (!args.includes('--json')) {
    console.log('')
    console.log(`${unused.ok ? '✓' : '✗'} unused dependencies`)
    console.log('')
    console.log(unused.summary)
  }

  process.exit(result.ok && unused.ok ? 0 : 1)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main()
}
