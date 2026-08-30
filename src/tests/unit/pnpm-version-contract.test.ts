import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { parse } from 'yaml'

/**
 * **One pnpm version, and four CVE pins that cannot be removed in silence.**
 *
 * ## The outage this exists because of
 *
 * `main` was unbuildable from 2026-08-29 04:27:56Z. Eleven consecutive CI runs died at
 * `Install dependencies`, 0 seconds in:
 *
 *     ERR_PNPM_LOCKFILE_CONFIG_MISMATCH  Cannot proceed with the frozen installation.
 *     The current "overrides" configuration doesn't match the value found in the lockfile
 *
 * Every step after it reported `skipped` — Lint, Type-check, Unit tests, Production build,
 * and the whole E2E job. That is the shape
 * [ADR 022](../../../docs/adr/022-absence-needs-its-own-alarm.md) named for
 * `production-smoke.yml`, recurring in the merge gate itself: from outside, a skipped check
 * is indistinguishable from a passing one, so eleven pull requests were merged by hand
 * against a gate that had not run.
 *
 * Bisecting `pnpm-lock.yaml` puts the break at `eca0527` (#47, the first dependabot merge),
 * which regenerated the lockfile **without** its top-level `overrides:` block while
 * `package.json` kept `pnpm.overrides`. Nothing in this repository declared which pnpm
 * builds that lockfile: `package.json` had no `packageManager`, and `ci.yml` pinned
 * `version: 9` in the workflow instead. Dependabot resolves with its own. Two resolvers,
 * one lockfile, no declared authority.
 *
 * ## What each half of this file covers
 *
 * The **version** assertions stop the cause. `packageManager` is the one place the version
 * is declared, and `pnpm/action-setup` reads it — so a workflow that also sets `version:`
 * reintroduces exactly the split that produced the outage. That is asserted structurally,
 * by parsing every workflow, rather than by grepping for a string: a regex guardrail has
 * unknown coverage ([ADR 007](../../../docs/adr/007-regex-guardrails-have-unknown-coverage.md)),
 * and `workflow-validity.test.ts` already imports `yaml` for precisely this reason.
 *
 * The **overrides** assertion covers what the failure could not. A lockfile that disagrees
 * with `package.json` is loud — `--frozen-lockfile` refuses, which is how this was found at
 * all. Deleting `pnpm.overrides` from `package.json` *and* regenerating is silent: install
 * succeeds, CI goes green, and the four pins simply stop existing. Those pins are #29's CVE
 * remediation — *"pnpm audit: 52 -> 0"* — for chains no `pnpm update` could reach, because
 * the upstream dependents had not moved their own ranges. Their quiet removal is the one
 * version of this bug that would never announce itself, so it gets the assertion.
 */

const ROOT = resolve(__dirname, '../../..')
const WORKFLOWS = join(ROOT, '.github/workflows')

type PackageJson = {
  packageManager?: string
  pnpm?: { overrides?: Record<string, string> }
}

function packageJson(): PackageJson {
  return JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
}

function workflowFiles(): string[] {
  return readdirSync(WORKFLOWS).filter((f) => /\.ya?ml$/.test(f))
}

describe('the pnpm version is declared exactly once', () => {
  it('package.json pins an exact pnpm version in packageManager', () => {
    const declared = packageJson().packageManager

    expect(
      declared,
      'package.json declares no `packageManager`. Without it, pnpm/action-setup, corepack, ' +
        'Vercel and dependabot each choose their own pnpm, and the one that regenerates ' +
        'pnpm-lock.yaml decides what the file contains. That is how the `overrides:` block ' +
        'went missing and main spent a day unbuildable.'
    ).toBeTruthy()

    // An exact version, not a range. `pnpm@9` would reintroduce the same ambiguity in a
    // narrower form: two machines, both obeying the manifest, resolving differently.
    expect(
      declared,
      `packageManager is "${declared}". It must pin an exact version — "pnpm@9" or ` +
        '"pnpm@^9.15.9" still lets two machines resolve the same lockfile differently, ' +
        'which is the whole defect.'
    ).toMatch(/^pnpm@\d+\.\d+\.\d+$/)
  })

  it.each(workflowFiles())('%s does not declare its own pnpm version', (file) => {
    const doc = parse(readFileSync(join(WORKFLOWS, file), 'utf8')) as {
      jobs?: Record<string, { steps?: Array<{ uses?: string; with?: Record<string, unknown> }> }>
    }

    const offenders: string[] = []
    for (const [jobId, job] of Object.entries(doc?.jobs ?? {})) {
      for (const step of job?.steps ?? []) {
        if (typeof step?.uses !== 'string') continue
        if (!step.uses.startsWith('pnpm/action-setup')) continue
        if (step.with && 'version' in step.with) {
          offenders.push(`${jobId}: ${step.uses} sets version: ${String(step.with.version)}`)
        }
      }
    }

    expect(
      offenders,
      `${file} pins a pnpm version on pnpm/action-setup:\n\n  ${offenders.join('\n  ')}\n\n` +
        'Remove it. With no `version:`, the action reads `packageManager` from package.json, ' +
        'so there is one authority instead of two that can disagree. Setting both is worse ' +
        'than setting neither: pnpm/action-setup fails outright when they conflict, and ' +
        'agrees silently — until someone bumps one — when they do not.'
    ).toEqual([])
  })
})

/**
 * The four packages #29 pinned, and why each one is here.
 *
 * Named individually rather than asserted as "some overrides exist", because a partial
 * deletion is the plausible mistake — someone removes the one override that is in the way
 * and leaves the rest, and a count-based check passes.
 */
const CVE_PINNED = ['postcss', 'vite', 'esbuild', 'sharp'] as const

describe('the CVE overrides survive', () => {
  it.each(CVE_PINNED)('pnpm.overrides still pins %s', (name) => {
    const overrides = packageJson().pnpm?.overrides ?? {}

    expect(
      overrides[name],
      `pnpm.overrides no longer pins ${name}.\n\n` +
        'These four are #29\'s CVE remediation — 52 vulnerabilities closed by pinning ' +
        'transitive dependencies directly, because the packages that depend on them had ' +
        'not moved their own ranges. Removing one silently reopens whatever it closed.\n\n' +
        'Unlike a lockfile that disagrees with package.json, this failure is quiet: delete ' +
        'the override, regenerate the lockfile, and every check passes while the pin is ' +
        'gone. That is why it is asserted here rather than left to `--frozen-lockfile`.\n\n' +
        'If a pin is genuinely obsolete because the dependent finally bumped its range, ' +
        'remove it from this list in the same commit, with `pnpm audit` output showing the ' +
        'count did not move.'
    ).toBeTruthy()
  })

  it('every override is an exact-or-minimum version, not a wildcard', () => {
    const overrides = packageJson().pnpm?.overrides ?? {}
    const wildcards = Object.entries(overrides).filter(([, range]) => /^[*x]$/.test(range.trim()))

    expect(
      wildcards,
      `These overrides accept any version: ${wildcards.map(([n]) => n).join(', ')}. ` +
        'An override that pins nothing is indistinguishable from no override at all, ' +
        'while still looking like a control in the manifest.'
    ).toEqual([])
  })
})

/**
 * **A deliberate downgrade needs an ignore, or dependabot undoes it on a weekly schedule.**
 *
 * Repairing the 2026-08-29 outage meant pinning two packages *below* their latest release:
 *
 * - `eslint-config-next` back to 15.x, because its major tracks Next's own and 16.x against
 *   `next@15` kills `next lint` on a circular flat-config reference.
 * - `@vitejs/plugin-react` back to 4.x, because 6.x requires `vite: ^8.0.0` while
 *   `pnpm.overrides` pins vite to `^6.4.3` for #29's CVE remediation.
 *
 * Neither downgrade defends itself. Dependabot runs weekly and re-proposes both, and the
 * eleven pull requests merged during the blackout are the evidence for how an unverified
 * dependabot PR fares here. `.github/dependabot.yml` now carries an `ignore` entry for each.
 *
 * This test exists because those two files can drift silently in **both** directions. Raise a
 * pin without dropping its ignore and the package is frozen for no stated reason; drop an
 * ignore without raising the pin and the downgrade quietly reverts on the next weekly run.
 * Neither shows up in a diff anyone reads, so the pair is asserted together.
 *
 * Parsed with `yaml`, never grepped — ADR 007, and the same reason
 * `workflow-condition-contract.test.ts` parses rather than matches.
 */

/**
 * Packages held below their latest major on purpose, with the constraint that holds them.
 *
 * A named list rather than a computed one: "is this pin deliberate or just old?" cannot be
 * answered from the manifest, and a test that guessed would either nag about every ordinary
 * out-of-date dependency or silently excuse a real regression.
 */
const DELIBERATE_DOWNGRADES: Record<string, string> = {
  'eslint-config-next':
    "its major tracks Next's own; 16.x against next@15 breaks `next lint` on a circular " +
    'flat-config reference. Lift when `next` moves to 16.',
  '@vitejs/plugin-react':
    '6.x requires vite ^8.0.0, which contradicts the `vite: ^6.4.3` CVE override. Lift when ' +
    'that override moves past 7.',
}

type Dependabot = {
  updates?: Array<{
    'package-ecosystem'?: string
    ignore?: Array<{ 'dependency-name'?: string; 'update-types'?: string[] }>
  }>
}

function npmUpdateBlock() {
  const doc = parse(readFileSync(join(ROOT, '.github/dependabot.yml'), 'utf8')) as Dependabot
  const npm = (doc.updates ?? []).find((u) => u['package-ecosystem'] === 'npm')
  return npm
}

describe('deliberate downgrades are protected from dependabot', () => {
  it('dependabot.yml declares an npm ecosystem block', () => {
    // Without this, every assertion below passes vacuously on a renamed or moved file —
    // the shape of green that proves nothing (ADR 020).
    expect(npmUpdateBlock()).toBeTruthy()
  })

  it.each(Object.keys(DELIBERATE_DOWNGRADES))('%s has a major-version ignore', (name) => {
    const entries = npmUpdateBlock()?.ignore ?? []
    const entry = entries.find((e) => e['dependency-name'] === name)

    expect(
      entry,
      `${name} is pinned below its latest major on purpose — ${DELIBERATE_DOWNGRADES[name]}\n\n` +
        'Without an `ignore` entry in .github/dependabot.yml, that pin is re-proposed every ' +
        'week, and merging the PR reproduces the 2026-08-29 outage: main unbuildable, eleven ' +
        'consecutive CI runs reporting every check as `skipped`.'
    ).toBeTruthy()

    expect(
      entry?.['update-types'],
      `${name}'s ignore entry must name version-update:semver-major. Ignoring every update ` +
        'would also freeze the patch and minor releases that carry security fixes, which is a ' +
        'larger decision than this pin represents.'
    ).toContain('version-update:semver-major')
  })

  it('every ignored package is one this repository actually depends on', () => {
    // An ignore for a package that has been removed is dead weight that silently starts
    // covering a future dependency of the same name. Same rot as a stale allowlist entry in
    // workflow-condition-contract.test.ts, and rejected for the same reason.
    const pkg = packageJson() as { dependencies?: Record<string, string> } & {
      devDependencies?: Record<string, string>
    }
    const declared = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) }
    const orphans = (npmUpdateBlock()?.ignore ?? [])
      .map((e) => e['dependency-name'])
      .filter((name): name is string => typeof name === 'string' && !(name in declared))

    expect(
      orphans,
      `These packages are ignored in dependabot.yml but are not dependencies: ` +
        `${orphans.join(', ')}. Remove the entries.`
    ).toEqual([])
  })

  it('every documented downgrade is still actually downgraded', () => {
    // The other direction. If someone raises `eslint-config-next` to 16 because Next moved
    // to 16, this list and the ignore must go with it — otherwise the package stays frozen
    // at a version nobody chose, for a reason that no longer applies.
    const pkg = packageJson() as { devDependencies?: Record<string, string> } & {
      dependencies?: Record<string, string>
    }
    const declared = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) }

    const stale = Object.keys(DELIBERATE_DOWNGRADES).filter((name) => !(name in declared))
    expect(
      stale,
      `DELIBERATE_DOWNGRADES names packages that are no longer dependencies: ` +
        `${stale.join(', ')}. Drop them here and from dependabot.yml's ignore list.`
    ).toEqual([])
  })
})
