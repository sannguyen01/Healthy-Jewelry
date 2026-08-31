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
 * The pull request description is read from `PR_BODY` in the environment — never
 * interpolated into a shell command, because a PR body is attacker-controlled text and
 * `${{ github.event.pull_request.body }}` inside a `run:` is a shell injection with a
 * friendly name.
 *
 * Exits 0 when nothing needs escalating or every escalation is justified; 1 otherwise.
 */

import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')
const MANIFEST = 'package.json'
const CONSTRAINTS = 'loop-constraints.md'

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
  const result = requiresRationale({ changes, majors, prBody: process.env.PR_BODY ?? '' })

  if (args.includes('--json')) {
    console.log(JSON.stringify({ majors, changes, ...result }, null, 2))
  } else {
    console.log(`${result.ok ? '✓' : '✗'} dependency scope`)
    console.log('')
    console.log(result.summary)
    if (!result.ok) {
      console.log('')
      console.log(
        'A major-version bump on one of these packages needs a `## Rationale` section in ' +
          'the pull request description saying why this major, why now, and what was ' +
          'checked against it.\n\n' +
          'If this arrived bundled with a security advisory: patch the CVE inside the ' +
          'current major and open the migration separately. That is what PR #61 did, and ' +
          'it is the reason this check exists.'
      )
    }
  }

  process.exit(result.ok ? 0 : 1)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main()
}
