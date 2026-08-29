import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { parse } from 'yaml'

/**
 * **Every workflow must be a file GitHub can actually read.**
 *
 * ## The defect this exists because of
 *
 * `.github/workflows/control-audit.yml` — the workflow built to audit whether this
 * repository's controls actually work — was **invalid YAML from the moment it was
 * written**, and never executed once. Two JavaScript string literals inside a
 * `github-script` block contained a real newline where `'\n'` was intended, which ended
 * the YAML block scalar mid-expression.
 *
 * Every property of that failure is the shape this repository has now recorded eight
 * times:
 *
 * - **It failed silently.** A parse error produces a run with `conclusion: failure` and
 *   **zero jobs** — no log, no step summary, no annotation. The Actions tab shows a red X
 *   on a workflow nobody was watching, because the tier was designed to report rather
 *   than block.
 * - **Three registry entries asserted it worked.** `docs/controls.json` named it as
 *   `probeRunsIn` for `merge-gate`, `assertion-liveness` and `smoke-liveness`, two of them
 *   `status: "configured"`.
 * - **Two guardrails passed over it.** `control-registry.test.ts` read the file with
 *   `readFileSync` and asserted `toContain(probe)`. `workflow-shell-contract.test.ts`
 *   regex-matched `defaults:\n  run:\n    shell: bash`. Both are text searches, and a text
 *   search cannot tell a valid document from a broken one — precisely
 *   [ADR 007](../../../docs/adr/007-regex-guardrails-have-unknown-coverage.md)'s subject.
 * - **[ADR 022](../../../docs/adr/022-absence-needs-its-own-alarm.md) predicted it, in
 *   writing, in the same commit.** *"The audit cannot detect its own death."* It died on
 *   day one.
 *
 * ## Why this parses instead of matching
 *
 * `yaml` is a devDependency added for this file. A hand-written parser would have been the
 * cheaper change and the wrong one: a parser that silently accepts a broken document is
 * the failure this test exists to catch, and writing one to catch it would be the joke
 * writing itself. The `scripts/lib/workflow-jobs.mjs` reader stays where it is — it
 * answers a different question (what check-run *names* GitHub publishes) and is asserted
 * against this parse below, so the two cannot drift.
 */

const ROOT = resolve(__dirname, '../../..')
const WORKFLOWS = join(ROOT, '.github/workflows')

interface Step {
  id?: string
  name?: string
  uses?: string
  run?: string
  with?: Record<string, unknown>
}
interface Job {
  name?: string
  steps?: Step[]
}
interface Workflow {
  name?: string
  on?: unknown
  jobs?: Record<string, Job>
}

const files = readdirSync(WORKFLOWS).filter((f) => /\.ya?ml$/.test(f))

describe('the workflow directory was found', () => {
  it('has workflows to check', () => {
    // Without this every `it.each` below iterates an empty list and the suite reports
    // green over nothing — the shape this whole family of tests refuses.
    expect(files.length).toBeGreaterThan(0)
  })
})

describe.each(files)('%s', (file) => {
  const source = readFileSync(join(WORKFLOWS, file), 'utf8')

  let parsed: Workflow | null = null
  let parseError: string | null = null
  try {
    parsed = parse(source) as Workflow
  } catch (error) {
    parseError = (error as Error).message
  }

  it('is valid YAML', () => {
    // The assertion that was missing. GitHub rejects an unparseable workflow before
    // scheduling any job, so the failure arrives as a red X with nothing inside it.
    expect(
      parseError,
      `${file} is not valid YAML, so GitHub will reject it before running anything. The ` +
        `run appears in the Actions tab with conclusion "failure" and zero jobs — no log, ` +
        `no summary, no annotation.\n\n${parseError}`
    ).toBeNull()
  })

  it('declares at least one job', () => {
    const jobs = Object.keys(parsed?.jobs ?? {})
    expect(jobs.length, `${file} defines no jobs, so it can never do anything`).toBeGreaterThan(0)
  })

  it('declares a trigger', () => {
    // `on:` is the one key whose absence makes a syntactically valid workflow inert.
    expect(parsed?.on, `${file} has no \`on:\` trigger and will never fire`).toBeDefined()
  })

  it('every job has a name', () => {
    // The name is the check-run context branch protection matches on. A job without one
    // publishes under its ID instead, which is the ADR 015 trap in the other direction.
    for (const [id, job] of Object.entries(parsed?.jobs ?? {})) {
      expect(job?.name, `${file}: job "${id}" has no name:`).toBeTruthy()
    }
  })

  it('every referenced step id exists in the same job', () => {
    // `steps.does-not-exist.outcome` is not an error in GitHub's expression language —
    // it evaluates to empty. A summary table built from a typo'd id renders blank cells
    // and reports nothing, which reads exactly like a check that had nothing to report.
    for (const [jobId, job] of Object.entries(parsed?.jobs ?? {})) {
      const declared = new Set((job.steps ?? []).map((s) => s.id).filter(Boolean) as string[])
      const referenced = new Set<string>()
      const jobText = JSON.stringify(job)
      for (const match of jobText.matchAll(/steps\.([A-Za-z0-9_-]+)\./g)) {
        referenced.add(match[1])
      }
      for (const id of referenced) {
        expect(
          declared.has(id),
          `${file}: job "${jobId}" references steps.${id}, which no step declares. ` +
            `GitHub evaluates that to empty rather than failing, so the value silently ` +
            `disappears from wherever it was used.`
        ).toBe(true)
      }
    }
  })

  it('every embedded github-script block is valid JavaScript', () => {
    // The second half of the same defect. The literal newline that broke the YAML would
    // also have broken the JS, and a `script:` block is not compiled until the step runs —
    // so a syntax error there surfaces only in production, one step into a scheduled job.
    for (const [jobId, job] of Object.entries(parsed?.jobs ?? {})) {
      for (const step of job.steps ?? []) {
        if (!step.uses?.includes('github-script')) continue
        const script = String(step.with?.script ?? '')
        if (!script.trim()) continue

        const dir = mkdtempSync(join(tmpdir(), 'wf-script-'))
        const path = join(dir, 'block.js')
        try {
          // Wrapped, because these blocks legitimately use top-level `await`.
          writeFileSync(path, `async function __block() {\n${script}\n}\n`)
          expect(() => execFileSync('node', ['--check', path], { stdio: 'pipe' })).not.toThrow(
            `${file}: the github-script in job "${jobId}" step "${step.name}" is not valid JavaScript`
          )
        } finally {
          rmSync(dir, { recursive: true, force: true })
        }
      }
    }
  })

  it('every log file a step reads is written by an earlier step', () => {
    // `cat missing.log` in a summary step is not an error under `set -e` when guarded by
    // `-s`, so a summary that publishes nothing looks the same as a run with nothing to
    // say. Both real workflows tee their probe output to a log and cat it later; this
    // holds the two halves together.
    for (const [jobId, job] of Object.entries(parsed?.jobs ?? {})) {
      const steps = job.steps ?? []
      const written = new Set<string>()
      for (const step of steps) {
        const run = step.run ?? ''
        for (const match of run.matchAll(/tee\s+([\w.-]+\.log)/g)) written.add(match[1])
        for (const match of run.matchAll(/>\s*([\w.-]+\.(?:log|json))/g)) written.add(match[1])
        for (const match of run.matchAll(/cat\s+>\s*([\w.-]+\.json)/g)) written.add(match[1])

        // Read-side: `for log in a b c` plus `cat "$log.log"` is the summary idiom here.
        for (const loop of run.matchAll(/for\s+log\s+in\s+([\w\s.-]+?);\s*do/g)) {
          for (const name of loop[1].trim().split(/\s+/)) {
            expect(
              written.has(`${name}.log`),
              `${file}: job "${jobId}" summarises "${name}.log", which no earlier step ` +
                `writes. The summary silently omits it.`
            ).toBe(true)
          }
        }
      }
    }
  })
})

describe('the structural reader agrees with the parser', () => {
  it('scripts/lib/workflow-jobs.mjs finds the same jobs', async () => {
    // Two readers of the same files, kept honest against each other. The .mjs reader is
    // what `required-checks-contract.test.ts` uses to decide which strings a human should
    // type into branch protection; if it and a real YAML parser ever disagree about what
    // jobs exist, that advice is guesswork.
    const { parseWorkflowJobs } = await import('../../../scripts/lib/workflow-jobs.mjs')
    for (const file of files) {
      const source = readFileSync(join(WORKFLOWS, file), 'utf8')
      const structural = parseWorkflowJobs(source).map((j: { id: string }) => j.id).sort()
      const authoritative = Object.keys((parse(source) as Workflow)?.jobs ?? {}).sort()
      expect(structural, `${file}: the two readers disagree about which jobs exist`).toEqual(
        authoritative
      )
    }
  })
})
