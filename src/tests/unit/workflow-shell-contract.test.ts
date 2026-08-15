import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

/**
 * **Every workflow must run its steps under `pipefail`.**
 *
 * ## The bug this exists because of
 *
 * GitHub's default shell on Linux is `bash -e {0}`. `-e` exits on error, but a
 * *pipeline's* error is its last command's — so `node script.mjs | tee out.log`
 * reports `tee`'s status, and `tee` always succeeds.
 *
 * `production-smoke.yml` piped both of its real checks that way, which meant the
 * entire third verification tier — the one built specifically to catch what the
 * hermetic merge gate structurally cannot — was **incapable of failing**. Run
 * 31600442658 published `| Webhook signing secret | success |` for a script that
 * printed a usage error and exited 2. The only reason that run went red at all
 * was the unpiped preflight step; once the secrets are configured, that step
 * passes and the workflow would have been permanently green regardless of what
 * production did — while its `if: success()` step closed the failure issue.
 *
 * ## Why this asserts a declaration rather than scanning for pipes
 *
 * A test that hunted for `|` inside `run:` blocks would be a regex guardrail with
 * unknown coverage — exactly what
 * [ADR 007](../../../docs/adr/007-regex-guardrails-have-unknown-coverage.md) is
 * about. `defaults.run.shell: bash` is a *structural* invariant: one declaration
 * per workflow, inherited by every step including ones nobody has written yet.
 * Asserting its presence is complete by construction, where "did I find all the
 * pipes" never could be.
 */

const WORKFLOWS = resolve(__dirname, '../../../.github/workflows')

function workflowFiles(): string[] {
  return readdirSync(WORKFLOWS).filter((f) => /\.ya?ml$/.test(f))
}

describe('every workflow runs its steps under pipefail', () => {
  it('finds workflows to check', () => {
    // Without this, a moved directory would make every assertion below vacuously
    // true — the shape of green that proves nothing.
    expect(workflowFiles().length).toBeGreaterThan(0)
  })

  it.each(workflowFiles())('%s declares defaults.run.shell: bash', (file) => {
    const source = readFileSync(join(WORKFLOWS, file), 'utf8')

    expect(
      source,
      `${file} does not declare\n\n  defaults:\n    run:\n      shell: bash\n\n` +
        "GitHub's default is `bash -e {0}` with no pipefail, so any piped step in " +
        'this workflow reports the exit status of the last command in the pipe ' +
        'rather than the one that failed.\n\n' +
        'Workflow scope specifically — a job-scoped `defaults` is valid YAML and ' +
        'does work, but it has to be repeated per job, and the job somebody adds ' +
        'next is the one that will not have it.'
    ).toMatch(/^defaults:\n {2}run:\n {4}shell: bash$/m)
  })
})

/**
 * The reproduction, kept executable.
 *
 * A comment saying "pipefail matters" is a claim. This is the measurement, and it
 * is here so the reason survives the next person who finds the `defaults:` block
 * redundant and deletes it — the same convention the two ADR-007 conversions
 * follow, where each keeps a test showing the old approach's failure.
 */
describe('why the declaration is load-bearing', () => {
  /** Run a snippet under a given bash invocation; return its exit code. */
  function exitCode(bashArgs: string[], script: string): number {
    try {
      execFileSync('bash', [...bashArgs, '-c', script], { stdio: 'pipe' })
      return 0
    } catch (err) {
      return (err as { status?: number }).status ?? -1
    }
  }

  const FAILING_PIPE = 'node -e "process.exit(2)" | cat > /dev/null'

  it("GitHub's default shell reports success for a failing piped command", () => {
    // `bash -e {0}` — what a `run:` step gets with no `shell:` key.
    expect(exitCode(['-e'], FAILING_PIPE)).toBe(0)
  })

  it('`shell: bash` reports the real failure', () => {
    // `bash --noprofile --norc -eo pipefail {0}` — what `shell: bash` expands to.
    expect(exitCode(['--noprofile', '--norc', '-eo', 'pipefail'], FAILING_PIPE)).toBe(2)
  })

  it('the difference is pipefail alone, not -e', () => {
    // Pinning the mechanism rather than the symptom: `-e` is present in both, so
    // it cannot be what changed the outcome.
    expect(exitCode(['-e'], FAILING_PIPE)).toBe(0)
    expect(exitCode(['-eo', 'pipefail'], FAILING_PIPE)).toBe(2)
  })

  it('an unpiped failing command fails either way — which is why this hid', () => {
    // The preflight step was unpiped, so it went red correctly. A workflow with
    // one honest step and two mute ones looks exactly like a working workflow.
    const bare = 'node -e "process.exit(2)"'
    expect(exitCode(['-e'], bare)).toBe(2)
    expect(exitCode(['-eo', 'pipefail'], bare)).toBe(2)
  })
})
