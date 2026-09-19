#!/usr/bin/env node
/**
 * **The step before `pnpm install`, because the failure it looks for kills `pnpm install`.**
 *
 * Runs the two questions in `scripts/lib/manifest-integrity.mjs` against this repository's
 * real `package.json` and `pnpm-lock.yaml`:
 *
 *   1. Does `package.json` declare the same key twice among its siblings?
 *   2. Do the manifest's effective ranges and the lockfile's recorded ranges agree?
 *
 * Both answers were wrong on `main` at `4c7c5f6`, produced by a text merge that emitted no
 * conflict marker. See `scripts/lib/manifest-integrity.mjs` and
 * [ADR 031](../docs/adr/031-a-clean-merge-is-not-a-correct-merge.md) for the incident.
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
import { findDuplicateJsonKeys, compareSpecifiers } from './lib/manifest-integrity.mjs'

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
  const duplicates = findDuplicateJsonKeys(manifestSource)
  const specifiers = compareSpecifiers(JSON.parse(manifestSource), lockfileSource)
  return { ok: duplicates.length === 0 && specifiers.status === 'ok', duplicates, specifiers }
}

/**
 * What a reader sees in the job log. Returned as lines rather than printed, so the wording
 * a person has to act on is itself assertable — a message that says the wrong remedy is a
 * defect, and one that only exists inside `console.log` cannot be tested for it.
 *
 * @param {ReturnType<typeof audit>} verdict
 * @returns {string[]}
 */
export function render({ duplicates, specifiers }) {
  const out = [`${duplicates.length === 0 ? '✓' : '✗'} package.json declares each key once`]

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
export function exitCode({ ok, specifiers }) {
  if (specifiers.status === 'unevaluable') return 2
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
