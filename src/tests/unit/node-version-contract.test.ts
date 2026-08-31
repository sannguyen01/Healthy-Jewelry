import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { parse } from 'yaml'

/**
 * **One declared Node version, and every consumer reads it.**
 *
 * ## Why this exists before its own outage
 *
 * `pnpm-version-contract.test.ts` was written *after* a day of unbuildable `main`. The root
 * cause it records is not really about pnpm: it is that a tool version was established
 * informally, in four places, and nothing made those places agree. The lockfile was the
 * casualty; the defect was the missing authority.
 *
 * Node was in exactly that state and had not yet cost anything. `node-version: '22'` was a
 * bare string in five workflow steps across four files, `package.json` declared no
 * `engines`, and Vercel — which builds what users actually get — chose its own major with
 * nothing in this repository having an opinion. Five writers, no reader.
 *
 * So this is the same contract as the pnpm one, applied to the remaining unpinned field
 * rather than waiting to learn it the same way. `engines.node` is the single authority
 * because it is the one field *both* kinds of consumer already read without being taught:
 * `actions/setup-node` via `node-version-file: package.json`, and Vercel's build image
 * natively.
 *
 * ## Why not `.nvmrc`
 *
 * Because a second file is a second authority, and "two places that must agree" is the
 * whole defect. `.nvmrc` would be read by `setup-node` and ignored by Vercel, which is how
 * you get a repository that is pinned and still disagrees with production.
 *
 * ## What is deliberately NOT asserted here: Playwright
 *
 * `ci.yml` derives the browser version from the installed package —
 * `node -p "require('@playwright/test/package.json').version"` — and keys the browser cache
 * on it. That is already one authority, and the lockfile is that authority. Adding a second
 * declaration of the browser version would introduce precisely the split this file exists to
 * prevent. If a future reader is tempted to "finish the job" by pinning it somewhere: that
 * would be the regression, not the fix.
 *
 * Asserted structurally, by parsing each workflow, rather than by grepping — a regex
 * guardrail has unknown coverage
 * ([ADR 007](../../../docs/adr/007-regex-guardrails-have-unknown-coverage.md)), and `yaml`
 * is already a devDependency for this exact reason.
 */

const ROOT = resolve(__dirname, '../../..')
const WORKFLOWS = join(ROOT, '.github/workflows')

type PackageJson = { engines?: { node?: string } }

function packageJson(): PackageJson {
  return JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
}

function workflowFiles(): string[] {
  return readdirSync(WORKFLOWS).filter((f) => /\.ya?ml$/.test(f))
}

type Step = { uses?: string; with?: Record<string, unknown> }
type Workflow = { jobs?: Record<string, { steps?: Step[] }> }

/** Every `actions/setup-node` step in a workflow, with the job that carries it. */
function setupNodeSteps(file: string): Array<{ jobId: string; step: Step }> {
  const doc = parse(readFileSync(join(WORKFLOWS, file), 'utf8')) as Workflow
  const found: Array<{ jobId: string; step: Step }> = []
  for (const [jobId, job] of Object.entries(doc?.jobs ?? {})) {
    for (const step of job?.steps ?? []) {
      if (typeof step?.uses === 'string' && step.uses.startsWith('actions/setup-node')) {
        found.push({ jobId, step })
      }
    }
  }
  return found
}

describe('the sweep found setup-node steps to check', () => {
  it('finds workflows', () => {
    expect(workflowFiles().length).toBeGreaterThan(0)
  })

  it('finds at least one setup-node step across them', () => {
    // Every assertion below is vacuously true over an empty set, and this repository has
    // already shipped one check that passed because it looked at nothing (ADR 020).
    const total = workflowFiles().reduce((n, f) => n + setupNodeSteps(f).length, 0)
    expect(total, 'no actions/setup-node steps found — has the parse broken?').toBeGreaterThan(0)
  })
})

describe('the Node version is declared exactly once', () => {
  it('package.json declares engines.node', () => {
    const declared = packageJson().engines?.node

    expect(
      declared,
      'package.json declares no `engines.node`. Without it, every workflow and Vercel each ' +
        'choose their own Node, and the one that builds what users get is the one nobody ' +
        'declared. That is the `packageManager` gap of 2026-08-29 with a different field name.'
    ).toBeTruthy()

    // A major-pinned range, not a bare major and not an exact patch. `22` alone is not a
    // range setup-node and Vercel read the same way, and an exact patch would fail CI every
    // time the runner image moves without any behaviour changing.
    expect(
      declared,
      `engines.node is "${declared}". It must be a major-pinned range like "22.x", which ` +
        'both actions/setup-node and Vercel resolve identically.'
    ).toMatch(/^\d+\.x$/)
  })

  it.each(workflowFiles())('%s reads the version from package.json', (file) => {
    const offenders: string[] = []

    for (const { jobId, step } of setupNodeSteps(file)) {
      const withBlock = step.with ?? {}
      if ('node-version' in withBlock) {
        offenders.push(
          `${jobId}: sets node-version: ${String(withBlock['node-version'])} — a literal, ` +
            'not a reference'
        )
        continue
      }
      if (withBlock['node-version-file'] !== 'package.json') {
        offenders.push(
          `${jobId}: node-version-file is ${JSON.stringify(withBlock['node-version-file'])}, ` +
            'not "package.json"'
        )
      }
    }

    expect(
      offenders,
      `${file} does not take its Node version from package.json:\n\n  ${offenders.join('\n  ')}\n\n` +
        'Use `node-version-file: package.json` and let `engines.node` decide. A literal here ' +
        'is a second authority: it agrees silently until someone bumps one of them, and then ' +
        'the two builds differ with nothing reporting that they do.\n\n' +
        'Setting both is worse than setting neither — setup-node takes `node-version` and ' +
        'ignores the file, so the pin that looks authoritative is the one being ignored.'
    ).toEqual([])
  })
})
