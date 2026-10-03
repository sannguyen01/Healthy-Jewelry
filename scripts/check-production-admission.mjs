#!/usr/bin/env node
/**
 * The `Production admission` check: exits 0 only when this commit's own CI run earned it the
 * production aliases. The policy, and why each event must produce what it does, is in
 * `scripts/lib/production-admission.mjs`.
 *
 * ## Inputs
 *
 * All from the environment, set by the `production-admission` job in `ci.yml` from GitHub's
 * own expressions, so nothing a pull request author writes reaches it:
 *
 * | Variable        | Source                                  |
 * |-----------------|-----------------------------------------|
 * | `EVENT_NAME`    | `github.event_name`                     |
 * | `REF_NAME`      | `github.ref` (the full ref)             |
 * | `VERIFY_RESULT` | `needs.verify.result`                   |
 * | `E2E_RESULT`    | `needs.e2e.result`                      |
 * | `SCOPE_RESULT`  | `needs['dependency-scope'].result`      |
 *
 * An unset variable is a `missing` result, which is never admitted.
 *
 * ## Why it is dependency-free
 *
 * No `pnpm install`, like the control-audit probes: the check that says a commit may reach
 * production must not be broken by the dependency change it is judging.
 *
 * ## What exit 0 does not mean
 *
 * That production is protected. The deployment platform has to be told to wait for this
 * check before it assigns production aliases, and a person can still promote a deployment by
 * hand. Until both are configured and proven, see `production-admission` in
 * `docs/controls.json`, this check reports and gates nothing.
 */
import fs from 'node:fs'
import { pathToFileURL } from 'node:url'
import { admissionVerdict } from './lib/production-admission.mjs'

/**
 * @param {Record<string, string | undefined>} [env]
 * @param {(line: string) => void} [log]
 * @returns {number} 0 when admitted, 1 when refused.
 */
export function main(env = process.env, log = console.log) {
  const verdict = admissionVerdict({
    event: env.EVENT_NAME,
    ref: env.REF_NAME,
    verify: env.VERIFY_RESULT,
    e2e: env.E2E_RESULT,
    dependencyScope: env.SCOPE_RESULT,
  })

  const line = `${verdict.admitted ? 'ADMITTED' : 'REFUSED'} (${verdict.policy}): ${verdict.reason}`
  log(line)
  if (env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(env.GITHUB_STEP_SUMMARY, `### Production admission\n\n${line}\n`)
  }
  return verdict.admitted ? 0 : 1
}

if (process.argv[1] && import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href) {
  process.exit(main())
}
