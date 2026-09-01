import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { parse } from 'yaml'

/**
 * **Every consumer that installs from this lockfile refuses to resolve around it.**
 *
 * ## The divergence
 *
 * `--frozen-lockfile` is what caught the 2026-08-29 blackout. `pnpm-lock.yaml` had been
 * regenerated without its `overrides:` block, and the flag refused outright:
 *
 *     ERR_PNPM_LOCKFILE_CONFIG_MISMATCH  Cannot proceed with the frozen installation.
 *
 * That refusal is the only reason anybody found out. Without it pnpm resolves a fresh tree,
 * rewrites the lockfile, and installs happily — the mismatch simply stops existing.
 *
 * `vercel.json` ran bare `pnpm install`. So through those eleven runs the merge gate was
 * refusing a dependency tree that **production would have deployed without comment**, and
 * nothing in this repository compared the two commands. The gate and the deploy answered the
 * same question — *may I install this?* — differently, silently, on either side of the same
 * lockfile.
 *
 * That is [ADR 027](../../../docs/adr/027-governance-and-execution-are-different-questions.md)'s
 * pattern on an external boundary: an answer that quietly depends on a question nobody asked.
 * It is also exactly the gap `node-version-contract.test.ts` closed for the Node version — the
 * same boundary, one field over.
 *
 * ## Why parse rather than grep
 *
 * Three of the strings matching `pnpm install` in these workflows are **comments** saying the
 * job deliberately does *not* install ("No `pnpm install`. Every probe here is
 * dependency-free…"). A grep counts those as invocations and a regex guardrail has unknown
 * coverage (ADR 007), so the workflows are parsed and only `run:` bodies are read — with
 * shell comments stripped, because a `#` line inside a `run:` block survives YAML parsing.
 *
 * ## The limit, stated rather than implied
 *
 * This asserts what the repository **declares**. Vercel's project dashboard can override
 * `vercel.json`'s install command, and nothing here can see that — the same class of blind
 * spot `smoke-secret-isolation` records for GitHub environments. `docs/controls.json` says so
 * in the entry's `knownLimit`; a check that quietly claimed to cover the dashboard would be
 * the very thing ADR 018 forbids.
 */

const ROOT = resolve(__dirname, '../../..')
const WORKFLOWS = join(ROOT, '.github/workflows')

function workflowFiles(): string[] {
  return readdirSync(WORKFLOWS).filter((f) => /\.ya?ml$/.test(f))
}

type Step = { run?: unknown }
type Workflow = { jobs?: Record<string, { steps?: Step[] }> }

/** Shell comments survive YAML parsing; a `#` line is not a command. */
function commandLines(run: string): string[] {
  return run
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
}

type Invocation = { where: string; command: string }

/** Every `pnpm install` a workflow actually runs, ignoring comments about not running one. */
function installInvocations(file: string): Invocation[] {
  const doc = parse(readFileSync(join(WORKFLOWS, file), 'utf8')) as Workflow
  const found: Invocation[] = []

  for (const [jobId, job] of Object.entries(doc?.jobs ?? {})) {
    for (const [index, step] of (job?.steps ?? []).entries()) {
      if (typeof step?.run !== 'string') continue
      for (const line of commandLines(step.run)) {
        if (/\bpnpm\s+install\b/.test(line)) {
          found.push({ where: `${file} → job "${jobId}" step #${index + 1}`, command: line })
        }
      }
    }
  }
  return found
}

/** The install command Vercel is told to run. */
function vercelInstallCommand(): { where: string; command: string } | null {
  const config = JSON.parse(readFileSync(join(ROOT, 'vercel.json'), 'utf8')) as {
    installCommand?: string
  }
  return typeof config.installCommand === 'string'
    ? { where: 'vercel.json → installCommand', command: config.installCommand }
    : null
}

const workflowInstalls = workflowFiles().flatMap(installInvocations)
const vercelInstall = vercelInstallCommand()

describe('the sweep found the installs it is here to compare', () => {
  it('finds pnpm install invocations in the workflows', () => {
    // Without this, every assertion below passes over an empty set — and this file exists
    // precisely because a check that quietly stops covering something looks identical to one
    // that passes (ADR 020).
    expect(
      workflowInstalls.length,
      'no `pnpm install` found in any workflow — has the parse broken?'
    ).toBeGreaterThan(0)
  })

  it('does not count the comments that say a job installs nothing', () => {
    // Three workflows carry "No `pnpm install`. Every probe here is dependency-free…". A
    // grep reads those as invocations; a parse plus comment-stripping does not.
    const commentary = workflowInstalls.filter(({ command }) => command.startsWith('#'))
    expect(commentary, 'comment lines leaked into the invocation list').toEqual([])
    expect(workflowInstalls.length).toBeLessThan(6)
  })

  it('reads the install command vercel.json declares', () => {
    expect(
      vercelInstall,
      'vercel.json declares no installCommand. Vercel then picks its own, which is the ' +
        'undeclared-authority shape this file exists to close.'
    ).not.toBeNull()
  })
})

describe('every install from this lockfile is frozen', () => {
  it.each([...workflowInstalls, ...(vercelInstall ? [vercelInstall] : [])].map(
    (i) => [i.where, i] as const
  ))('%s', (_where, invocation) => {
    expect(
      invocation.command,
      `${invocation.where} runs:\n\n  ${invocation.command}\n\n` +
        'It must pass `--frozen-lockfile`. Without the flag pnpm resolves a fresh tree and ' +
        'rewrites pnpm-lock.yaml instead of refusing — so a lockfile that disagrees with ' +
        'package.json installs cleanly here while the merge gate rejects it.\n\n' +
        'That is not hypothetical. Through the eleven dark runs of 2026-08-29, CI failed on ' +
        '`ERR_PNPM_LOCKFILE_CONFIG_MISMATCH` while `vercel.json` — running bare `pnpm ' +
        'install` — would have resolved around the same mismatch and deployed it to ' +
        'production. The gate and the deploy answered one question two ways, and nothing ' +
        'compared them.'
    ).toMatch(/--frozen-lockfile\b/)
  })
})
