#!/usr/bin/env node
/**
 * **The step before `pnpm install`, because the failure it looks for kills `pnpm install`.**
 *
 * Runs the four questions in `scripts/lib/manifest-integrity.mjs` against this repository's
 * real `package.json` and `pnpm-lock.yaml`:
 *
 *   1. Does either file carry a git conflict marker?
 *   2. Does `package.json` declare the same key twice among its siblings?
 *   3. Does `pnpm-lock.yaml` declare the same key twice among its siblings?
 *   4. Do the manifest's effective ranges and the lockfile's recorded ranges agree?
 *
 * Questions 2 and 4 were both wrong on `main` at `4c7c5f6`, produced by a text merge that
 * emitted no conflict marker ([ADR 031](../docs/adr/031-a-clean-merge-is-not-a-correct-merge.md)).
 * Question 3 was wrong on PR #101 at `ed7594a`, produced by a conflict resolution that kept
 * both sides, while this step printed two ticks above the install that died on it
 * ([ADR 046](../docs/adr/046-a-resolved-conflict-is-a-write-nobody-reviewed.md)).
 *
 * Dependency-free, importing nothing but `node:fs` and `node:path`, so it survives the state
 * it exists to report — a check on the dependency manifest that needed the dependencies
 * installed would never have run on the commit that motivated it.
 *
 * Usage:  node scripts/audit-manifest-integrity.mjs [--json]
 * Exits 0 when both questions pass, 1 on a finding, 2 when it could not run.
 */

import fs from 'node:fs'
import path from 'node:path'
import {
  findDuplicateJsonKeys,
  findDuplicateLockfileKeys,
  findConflictMarkers,
  compareSpecifiers,
} from './lib/manifest-integrity.mjs'

const ROOT = path.resolve(import.meta.dirname, '..')

/**
 * The verdict, over sources rather than over paths.
 *
 * Separated from the file reads so a test can point it at the bytes that actually shipped
 * ([ADR 024](../docs/adr/024-a-tool-never-pointed-at-a-known-answer.md)) instead of at a
 * fixture on disk that would have to be kept in step with the real thing.
 *
 * @param {string} manifestSource
 * @param {string} lockfileSource
 */
export function audit(manifestSource, lockfileSource) {
  const markers = {
    manifest: findConflictMarkers(manifestSource),
    lockfile: findConflictMarkers(lockfileSource),
  }
  const duplicates = findDuplicateJsonKeys(manifestSource)
  const lockfile =
    markers.lockfile.length > 0
      ? { status: /** @type {const} */ ('unevaluable'), duplicates: [], reason: 'pnpm-lock.yaml carries conflict markers, so its keys were not read.' }
      : findDuplicateLockfileKeys(lockfileSource)
  const specifiers = compareParsed(manifestSource, lockfileSource, markers)
  const findings =
    markers.manifest.length +
    markers.lockfile.length +
    duplicates.length +
    lockfile.duplicates.length +
    (specifiers.status === 'divergent' ? 1 : 0)
  return {
    ok: findings === 0 && specifiers.status === 'ok' && lockfile.status === 'ok',
    findings,
    markers,
    duplicates,
    lockfile,
    specifiers,
  }
}

/**
 * The range comparison, if there is a manifest to compare. A manifest carrying conflict
 * markers is not JSON, and before 2026-10-04 `JSON.parse` threw out of this probe with a
 * stack trace in place of a verdict.
 */
function compareParsed(manifestSource, lockfileSource, markers) {
  if (markers.manifest.length > 0 || markers.lockfile.length > 0) {
    return { status: /** @type {const} */ ('unevaluable'), divergences: [], reason: 'a conflict marker has to be resolved before the two files can be compared.' }
  }
  let manifest
  try {
    manifest = JSON.parse(manifestSource)
  } catch (error) {
    return {
      status: /** @type {const} */ ('unevaluable'),
      divergences: [],
      reason: `package.json is not valid JSON (${error instanceof Error ? error.message : String(error)}).`,
    }
  }
  return compareSpecifiers(manifest, lockfileSource)
}

/**
 * What a reader sees in the job log. Returned as lines rather than printed, so the wording
 * a person has to act on is itself assertable — a message that says the wrong remedy is a
 * defect, and one that only exists inside `console.log` cannot be tested for it.
 *
 * @param {ReturnType<typeof audit>} verdict
 * @returns {string[]}
 */
export function render({ markers, duplicates, lockfile, specifiers }) {
  const markerCount = markers.manifest.length + markers.lockfile.length
  const out = [`${markerCount === 0 ? '✓' : '✗'} neither file carries a conflict marker`]

  if (markerCount > 0) {
    out.push('')
    for (const [file, found] of [['package.json', markers.manifest], ['pnpm-lock.yaml', markers.lockfile]]) {
      for (const m of found) out.push(`  · ${file} line ${m.line}: ${m.marker}`)
    }
    out.push(
      '',
      'A merge was committed before its conflicts were resolved. Resolve package.json by',
      'hand; never resolve pnpm-lock.yaml by hand — take the base branch\'s copy and let',
      'pnpm rebuild it (docs/runbooks/lockfile-conflicts.md).'
    )
  }

  out.push('', `${duplicates.length === 0 ? '✓' : '✗'} package.json declares each key once`)

  if (duplicates.length > 0) {
    out.push('')
    for (const d of duplicates) {
      const where = d.path.length > 0 ? d.path.join('.') : '(root)'
      out.push(`  · ${where}.${d.key} — line ${d.line}, first declared on line ${d.firstLine}`)
    }
    out.push(
      '',
      'JSON permits this and `JSON.parse` takes the **last** occurrence silently, so every',
      'tool here reads one value from a file that states two. It is what a text merge',
      'produces when two dependency changes land on adjacent lines: git reports no conflict.',
      'Pick the intended version for each key above, delete the other, then regenerate the',
      'lockfile with `pnpm install --no-frozen-lockfile` — never by editing it.'
    )
  }

  const lockfileMark = lockfile.duplicates.length > 0 ? '✗' : lockfile.status === 'ok' ? '✓' : '?'
  out.push('', `${lockfileMark} pnpm-lock.yaml declares each key once`)

  if (lockfile.duplicates.length > 0) {
    out.push('')
    for (const d of lockfile.duplicates) {
      out.push(`  · ${[...d.path, d.key].join(' > ')} — line ${d.line}, first declared on line ${d.firstLine}`)
    }
    out.push(
      '',
      'pnpm refuses this file (ERR_PNPM_BROKEN_LOCKFILE), so the install after this step and',
      'every Vercel build fail on it. It is the shape a lockfile conflict leaves when both sides are kept —',
      "GitHub's conflict editor, or an editor's \"Accept Both\" — and the repository's",
      '.gitattributes now stops git from text-merging this file at all. Never resolve it by',
      "hand: take the base branch's copy and let pnpm rebuild it from package.json:",
      '',
      '    git checkout origin/main -- pnpm-lock.yaml && pnpm install --lockfile-only',
      '',
      'See docs/runbooks/lockfile-conflicts.md.'
    )
  } else if (lockfile.status === 'unevaluable') {
    out.push('', `  ${lockfile.reason}`)
  }

  out.push('', `${{ ok: '✓', divergent: '✗', unevaluable: '?' }[specifiers.status]} package.json and pnpm-lock.yaml name the same versions`)

  if (specifiers.status === 'divergent') {
    out.push('')
    for (const d of specifiers.divergences) {
      const via = d.overridden ? ' (effective range, via pnpm.overrides)' : ''
      out.push(`  · ${d.name}: package.json says ${d.manifest}${via}, lockfile says ${d.lockfile}`)
    }
    out.push(
      '',
      '`pnpm install --frozen-lockfile` will refuse this, which kills the install step and',
      'leaves every check after it reporting `skipped` — indistinguishable from passing',
      '(ADR 011). That is why the question is asked here, by name, before install.',
      'Regenerate with `pnpm install --no-frozen-lockfile` and commit both files together.'
    )
  } else if (specifiers.status === 'unevaluable') {
    out.push('', `  ${specifiers.reason}`)
  }

  return out
}

/**
 * `unevaluable` is not a pass and not a failure. It exits 2, distinct from both, because
 * "I could not check" wearing the colour of "I checked and it was fine" is the confusion
 * this repository keeps paying for (ADR 010).
 *
 * @param {ReturnType<typeof audit>} verdict
 */
export function exitCode({ ok, findings, lockfile, specifiers }) {
  // A finding outranks "could not run": a conflict marker makes the comparison impossible,
  // and the marker, not the impossibility, is what somebody has to act on.
  if (findings > 0) return 1
  if (specifiers.status === 'unevaluable' || lockfile.status === 'unevaluable') return 2
  return ok ? 0 : 1
}

function main() {
  const verdict = audit(
    fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'),
    fs.readFileSync(path.join(ROOT, 'pnpm-lock.yaml'), 'utf8')
  )

  if (process.argv.includes('--json')) console.log(JSON.stringify(verdict, null, 2))
  else console.log(render(verdict).join('\n'))

  process.exit(exitCode(verdict))
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main()
}
