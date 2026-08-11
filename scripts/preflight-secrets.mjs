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
 * @param {string[]} required
 * @param {Record<string, string | undefined>} env
 * @returns {{ ok: boolean, missing: string[], isolated: boolean, lines: string[] }}
 */
export function preflight(required, env) {
  const missing = required.filter((name) => !env[name])
  const isolated = env[SOURCE_MARKER] === EXPECTED_MARKER
  const lines = []

  if (missing.length > 0) {
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

  return { ok: missing.length === 0 && isolated, missing, isolated, lines }
}

// ── CLI ─────────────────────────────────────────────────────────────────────

function main() {
  const required = process.argv.slice(2)
  if (required.length === 0) {
    console.error('Usage: node scripts/preflight-secrets.mjs VAR_ONE VAR_TWO ...')
    return 2
  }

  const { ok, missing, isolated, lines } = preflight(required, process.env)

  if (ok) {
    console.log(`✓ All ${required.length} secrets present, sourced from the environment.`)
    return 0
  }

  console.error(missing.length > 0 ? '✗ Missing secrets\n' : '✗ Secrets are not isolated\n')
  console.error(lines.join('\n'))
  return 1
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  process.exit(main())
}
