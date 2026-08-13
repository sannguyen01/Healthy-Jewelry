#!/usr/bin/env node
/**
 * Fails the run with **one** message naming everything that is missing.
 *
 * ## Why this is a separate step
 *
 * `verify-production.mjs` calls `required()` inside each check, so a fresh setup with no
 * secrets fails on the first variable, gets fixed, fails on the second, and so on — five
 * red runs to learn five facts that were all knowable before the first request was sent.
 *
 * ## The part that actually matters: the environment is not a control yet
 *
 * `production-smoke.yml` declares `environment: production-readonly`. That reads like
 * hardening. It is not, on its own:
 *
 *   - A job naming an environment that does not exist does **not** fail. GitHub creates
 *     the environment automatically, with **no protection rules and no secrets**.
 *   - A job with an `environment:` key still receives **repository** secrets.
 *
 * Put together: if the five smoke secrets are set at repository scope, the workflow goes
 * green with no isolation whatsoever, and nothing anywhere says so. The control announces
 * protection it is not providing, which is worse than having no control — a green run is
 * read as evidence.
 *
 * `SMOKE_SECRETS_SOURCE` is the marker that closes it. Set it **only on the environment**,
 * never at repository scope. If it is absent while the real secrets are present, the
 * secrets came from repo scope and this says so out loud.
 *
 * It is a **convention, not an enforcement**. GitHub gives a job no way to ask where a
 * secret came from, so a determined misconfiguration can still satisfy it by setting the
 * marker at repo scope too. Documented as such rather than overclaimed — see
 * `docs/adr/006-controls-must-fail-loudly.md`.
 *
 * ## Usage
 *
 *   node scripts/preflight-secrets.mjs VAR_ONE VAR_TWO ...
 */

import fs from 'node:fs'

/** Where each variable is configured, so the failure message is actionable. */
const WHERE = {
  PRODUCTION_SITE_URL: 'https://healthyjewellery.com',
  SHOPIFY_STORE_DOMAIN: 'y0k9ve-q1.myshopify.com',
  SHOPIFY_STOREFRONT_ACCESS_TOKEN: 'copy the value already working in Vercel',
  SHOPIFY_ADMIN_ACCESS_TOKEN: 'Shopify Admin → Apps → your custom app (read scopes only)',
  SHOPIFY_WEBHOOK_SECRET: 'Shopify Admin → Settings → Notifications (see ADR 001)',
}

export const SOURCE_MARKER = 'SMOKE_SECRETS_SOURCE'
export const EXPECTED_MARKER = 'environment'

/**
 * The three states this can be in, which are not two.
 *
 * `not-configured` — **every** secret absent. Nobody has done the setup yet. That
 * is a known state, not news, and reporting it as a failure every six hours
 * trains the reader to mute the one channel that will later carry a real outage.
 *
 * `misconfigured` — *some* secrets present and some absent, or all present but
 * not environment-scoped. Somebody started and stopped halfway, which is exactly
 * what a botched setup looks like and must be loud.
 *
 * `ready` — run the real checks.
 *
 * The distinction between the first two is the load-bearing part. Collapsing them
 * into "missing secrets" is what would make a half-finished configuration quiet.
 *
 * @typedef {'not-configured' | 'misconfigured' | 'ready'} PreflightState
 */

/**
 * @param {string[]} required
 * @param {Record<string, string | undefined>} env
 * @returns {{ ok: boolean, state: PreflightState, missing: string[], isolated: boolean, lines: string[] }}
 */
export function preflight(required, env) {
  const missing = required.filter((name) => !env[name])
  const isolated = env[SOURCE_MARKER] === EXPECTED_MARKER
  const lines = []

  /**
   * `not-configured` requires the marker to be absent too.
   *
   * Setting `SMOKE_SECRETS_SOURCE` is itself evidence that somebody opened the
   * environment and started. Secrets absent *and* the marker set is a setup that
   * was begun and abandoned — a half-finished configuration, which is loud.
   */
  const untouched = missing.length === required.length && required.length > 0 && !isolated

  /** @type {PreflightState} */
  const state = untouched ? 'not-configured' : missing.length > 0 || !isolated ? 'misconfigured' : 'ready'

  if (state === 'not-configured') {
    lines.push(
      'None of the smoke secrets are set, so this deployment has never been configured for',
      'live verification. Nothing is broken — this run has nothing to check.',
      '',
      'To switch it on, set these on the `production-readonly` environment:',
      '  Settings → Environments → production-readonly → Environment secrets',
      ...required.map((n) => `  · ${n}${WHERE[n] ? ` — ${WHERE[n]}` : ''}`),
      '',
      `plus the environment variable ${SOURCE_MARKER} = ${EXPECTED_MARKER}.`,
      '',
      'Not at repository scope. This repository is public and forkable; an environment',
      'is the boundary that can carry required reviewers. See docs/credential-inventory.md.',
      '',
      'Until then this workflow reports "not configured" and files no issue. Set some but',
      'not all of them and it will fail loudly — a half-finished setup is a real problem,',
      'and the one most likely to be mistaken for a working one.',
    )
  }

  if (missing.length > 0 && state !== 'not-configured') {
    lines.push(
      `${missing.length} of ${required.length} required secrets are not set for this job.`,
      '',
      'Missing:',
      ...missing.map((n) => `  · ${n}${WHERE[n] ? ` — ${WHERE[n]}` : ''}`),
      '',
      'Set them on the `production-readonly` environment:',
      '  Settings → Environments → production-readonly → Environment secrets',
      '',
      'Not at repository scope. This repository is public and forkable; an environment',
      'is the boundary that can carry required reviewers. See docs/credential-inventory.md.',
    )
  }

  if (!isolated && missing.length === 0) {
    lines.push(
      `Every secret is present, but ${SOURCE_MARKER} is not set to "${EXPECTED_MARKER}".`,
      '',
      'That means these secrets are almost certainly set at REPOSITORY scope rather than',
      'on the environment. The job still runs — a job with an `environment:` key receives',
      'repository secrets too — so this would otherwise have gone green while providing',
      'none of the isolation the environment is there for.',
      '',
      'Fix: move the secrets to Settings → Environments → production-readonly, and add',
      `  ${SOURCE_MARKER} = ${EXPECTED_MARKER}`,
      'as an environment variable there. Then delete them from repository secrets.',
      '',
      'Note the environment itself needs no creating — GitHub makes it automatically the',
      'first time a workflow names it. What it does NOT do is add protection rules or',
      'secrets, which is the entire point of having one.',
    )
  }

  return { ok: state === 'ready', state, missing, isolated, lines }
}

/**
 * Tell the workflow what to do, via `$GITHUB_OUTPUT`.
 *
 * `configured` gates the two real check steps *and* the issue-filing step, so a
 * store that has never been set up produces a quiet, honest run rather than a
 * six-hourly alarm about a fact its owner already knows.
 *
 * Written through a function rather than inline so the file-append is testable
 * and so a missing `GITHUB_OUTPUT` (running this by hand) is a no-op instead of
 * a crash.
 *
 * Typed by the one method it uses rather than by all of `node:fs`. Depending on
 * the whole module would be over-specified — and it would force a test to
 * construct a hundred-property stub to exercise two lines, which is the kind of
 * friction that ends with the branch going untested.
 *
 * @param {{ appendFileSync: (path: string, data: string) => void }} fs
 * @param {string | undefined} outputPath
 * @param {Record<string, string>} values
 */
export function writeStepOutputs(fs, outputPath, values) {
  if (!outputPath) return
  const body = Object.entries(values)
    .map(([key, value]) => `${key}=${value}`)
    .join('\n')
  fs.appendFileSync(outputPath, `${body}\n`)
}

// ── CLI ─────────────────────────────────────────────────────────────────────

function main() {
  const required = process.argv.slice(2)
  if (required.length === 0) {
    console.error('Usage: node scripts/preflight-secrets.mjs VAR_ONE VAR_TWO ...')
    return 2
  }

  const { ok, state, missing, lines } = preflight(required, process.env)

  writeStepOutputs(fs, process.env.GITHUB_OUTPUT, {
    configured: String(state !== 'not-configured'),
    state,
  })

  if (ok) {
    console.log(`✓ All ${required.length} secrets present, sourced from the environment.`)
    return 0
  }

  if (state === 'not-configured') {
    // Exit 0. Not a failure — a state. The workflow reads `configured=false` and
    // skips the checks rather than reporting an outage it has not looked for.
    console.log('· Not configured for live verification\n')
    console.log(lines.join('\n'))
    return 0
  }

  console.error(missing.length > 0 ? '✗ Missing secrets\n' : '✗ Secrets are not isolated\n')
  console.error(lines.join('\n'))
  return 1
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  process.exit(main())
}
