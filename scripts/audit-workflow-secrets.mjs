#!/usr/bin/env node
/**
 * Finds credentials that are still configured but no longer used.
 *
 * ## Why this exists
 *
 * **Deleting a workflow does not delete its secrets.** GitHub keeps them in repository
 * settings forever, with no reference to the workflow that needed them and no expiry.
 * Nothing in the GitHub UI marks a secret as unused, so an orphan is invisible unless
 * someone remembers.
 *
 * This repo had one. `deploy-production.yml` used `secrets.VERCEL_TOKEN`, was reduced to
 * that single secret on 2026-06-08, and was deleted on 2026-06-29 as "redundant" because
 * Vercel's Git integration already deploys. The token was never mentioned in any document
 * before or after, so nothing recorded that it still existed.
 *
 * That one mattered more than most: the deleted workflow ran
 * `vercel pull --environment=production`, which downloads **every** production environment
 * variable. A Vercel token is a master key to the Shopify tokens, the webhook secret and
 * the revalidation secret — the credential that reaches all the others.
 *
 * ## What it can and cannot tell you
 *
 * It reads **git history**, not GitHub settings. It reports which secrets *workflows have
 * referenced*, so it can say "nothing uses this any more" — it cannot say whether the
 * secret is still set. The agent proxy blocks `/actions/secrets`, and even with access,
 * that list is the other half of the comparison rather than a substitute for it.
 *
 * Treat the output as a checklist to run against Settings → Secrets and variables.
 *
 * ## Usage
 *
 *   node scripts/audit-workflow-secrets.mjs [--json]
 */

import { execFileSync } from 'node:child_process'

/**
 * Strip YAML comments before looking for secret references.
 *
 * Not cosmetic. `production-smoke.yml` deliberately contains
 * `run: echo ${{ secrets.<NAME> }}` inside a comment, as the anti-pattern it warns
 * against — and a naive grep reports that as a real secret named `X`. This audit found
 * that false positive in its own repository on the first run, which is exactly how a tool
 * like this loses trust.
 *
 * Quotes are tracked so a `#` inside a string is not mistaken for a comment.
 *
 * @param {string} yaml
 * @returns {string}
 */
export function stripYamlComments(yaml) {
  return yaml
    .split('\n')
    .map((line) => {
      let quote = null
      for (let i = 0; i < line.length; i += 1) {
        const ch = line[i]
        if (quote) {
          if (ch === quote) quote = null
        } else if (ch === '"' || ch === "'") {
          quote = ch
        } else if (ch === '#') {
          // A `#` only starts a comment at the start of a line or after whitespace.
          if (i === 0 || /\s/.test(line[i - 1])) return line.slice(0, i)
        }
      }
      return line
    })
    .join('\n')
}

/**
 * Every `secrets.NAME` reference in one workflow file.
 *
 * @param {string} yaml
 * @returns {Set<string>}
 */
export function secretsReferencedIn(yaml) {
  const names = new Set()
  for (const match of stripYamlComments(yaml).matchAll(/secrets\.([A-Z_][A-Z0-9_]*)/g)) {
    names.add(match[1])
  }
  return names
}

function git(args) {
  return execFileSync('git', args, { encoding: 'utf-8', maxBuffer: 64 * 1024 * 1024 })
}

/**
 * Thrown instead of reporting a result that would be wrong.
 */
export class ShallowHistoryError extends Error {
  constructor() {
    super(
      'Cannot audit: this is a SHALLOW clone, so the history that would contain\n' +
        '  deleted workflows is not present.\n\n' +
        '  Reporting "no orphaned secrets" from a shallow clone would be a false all-clear —\n' +
        '  the orphan this tool exists to find lives in a workflow deleted months ago.\n\n' +
        '  Locally:  git fetch --unshallow\n' +
        '  In CI:    actions/checkout@v4 with `fetch-depth: 0` (it defaults to 1)',
    )
    this.name = 'ShallowHistoryError'
  }
}

/**
 * `actions/checkout` clones with `fetch-depth: 1` by default, which is the single most
 * likely way this tool silently stops working: every commit that deleted a workflow is
 * absent, so nothing looks orphaned and the run goes green.
 *
 * This was not hypothetical — it is exactly what happened on the first CI run of this
 * script, which reported "No orphaned secrets" and exited 0 while three real orphans sat
 * in the repository's settings.
 */
export function isShallowClone() {
  try {
    return git(['rev-parse', '--is-shallow-repository']).trim() === 'true'
  } catch {
    return false
  }
}

/** Workflow files present on a given ref. */
function workflowsAt(ref) {
  try {
    return git(['ls-tree', '-r', '--name-only', ref, '--', '.github/workflows/'])
      .split('\n')
      .filter((p) => /\.ya?ml$/.test(p))
  } catch {
    return []
  }
}

function fileAt(ref, path) {
  try {
    return git(['show', `${ref}:${path}`])
  } catch {
    return ''
  }
}

/**
 * Classify every secret any workflow has ever referenced.
 *
 * - `live`    — referenced by a workflow that exists on the default branch. Keep.
 * - `pending` — referenced only on other branches. Keep, but it does nothing until merge:
 *               scheduled and `workflow_dispatch` triggers only fire from the default
 *               branch, so a workflow that has not landed there cannot run at all.
 * - `orphan`  — referenced only by workflows that no longer exist anywhere. **Candidate
 *               for revocation.**
 *
 * @param {{ defaultBranch?: string, allowShallow?: boolean }} [opts]
 *   `allowShallow` exists only so a test can exercise the non-refusing path on a full
 *   clone. Never pass it in real use — the whole point of the guard is that a shallow
 *   clone cannot see deleted workflows and would report a false all-clear.
 */
export function auditSecrets({ defaultBranch = 'origin/main', allowShallow = false } = {}) {
  // Refuse rather than under-report. A shallow clone cannot see the deleted workflows
  // that produce orphans, so the only honest answers are the real one and "I cannot tell".
  if (!allowShallow && isShallowClone()) throw new ShallowHistoryError()

  /** @type {Map<string, { status: string, workflows: Set<string>, lastSeen: string }>} */
  const found = new Map()

  const record = (name, status, workflow, ref) => {
    const existing = found.get(name)
    // live > pending > orphan: a secret used anywhere current is not an orphan.
    const rank = { orphan: 0, pending: 1, live: 2 }
    if (!existing || rank[status] > rank[existing.status]) {
      found.set(name, {
        status,
        workflows: new Set([...(existing?.workflows ?? []), workflow]),
        lastSeen: ref,
      })
    } else {
      existing.workflows.add(workflow)
    }
  }

  // 1. Everything live on the default branch.
  for (const path of workflowsAt(defaultBranch)) {
    for (const name of secretsReferencedIn(fileAt(defaultBranch, path))) {
      record(name, 'live', path, defaultBranch)
    }
  }

  // 2. Everything on the current working tree / branch but not yet on the default branch.
  for (const path of workflowsAt('HEAD')) {
    for (const name of secretsReferencedIn(fileAt('HEAD', path))) {
      record(name, 'pending', path, 'HEAD')
    }
  }

  // 3. Everything any historical commit ever referenced.
  const commits = git(['log', '--all', '--format=%H', '--', '.github/workflows/'])
    .split('\n')
    .filter(Boolean)

  for (const sha of commits) {
    for (const path of workflowsAt(sha)) {
      for (const name of secretsReferencedIn(fileAt(sha, path))) {
        record(name, 'orphan', path, sha)
      }
    }
  }

  return [...found.entries()]
    .map(([name, v]) => ({ name, status: v.status, workflows: [...v.workflows].sort() }))
    .sort((a, b) => a.status.localeCompare(b.status) || a.name.localeCompare(b.name))
}

// ── CLI ─────────────────────────────────────────────────────────────────────

function main() {
  let results
  try {
    results = auditSecrets()
  } catch (err) {
    if (err instanceof ShallowHistoryError) {
      console.error(`✗ ${err.message}`)
      return 2
    }
    throw err
  }

  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(results, null, 2))
    return results.some((r) => r.status === 'orphan') ? 1 : 0
  }

  console.log('Workflow secret audit\n')
  console.log('Read from git history, not GitHub settings — this says what workflows still')
  console.log('reference, not what is still configured. Run the orphans against')
  console.log('Settings → Secrets and variables → Actions.\n')

  const byStatus = { live: [], pending: [], orphan: [] }
  for (const r of results) byStatus[r.status].push(r)

  const label = {
    live: '✓ LIVE — referenced by a workflow on the default branch',
    pending: '· PENDING — referenced only off the default branch, so it cannot run yet',
    orphan: '✗ ORPHAN — no existing workflow references this. Revoke and delete.',
  }

  for (const status of ['orphan', 'pending', 'live']) {
    if (byStatus[status].length === 0) continue
    console.log(label[status])
    for (const r of byStatus[status]) {
      console.log(`    ${r.name}  (last seen in ${r.workflows.join(', ')})`)
    }
    console.log('')
  }

  const orphans = byStatus.orphan
  if (orphans.length > 0) {
    console.log('─'.repeat(70))
    console.log(
      `${orphans.length} orphaned secret${orphans.length === 1 ? '' : 's'}. Deleting a\n` +
        'workflow does not delete its secrets — they stay in repository settings with no\n' +
        'expiry and nothing marking them unused. See docs/credential-inventory.md.',
    )
    return 1
  }

  console.log('No orphaned secrets.')
  return 0
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  process.exit(main())
}
