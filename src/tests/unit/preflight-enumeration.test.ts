import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const { WHERE, SHAPE_RULES, SOURCE_MARKER } = await import('../../../scripts/preflight-secrets.mjs')

/**
 * **The preflight checks every secret the smoke run actually uses.**
 *
 * Three hand-maintained lists describe the same five credentials, and nothing joined
 * them:
 *
 * 1. the `env:` block on the preflight step in `production-smoke.yml`;
 * 2. the argument list passed to `preflight-secrets.mjs` on the line below it;
 * 3. `WHERE` inside that script, which turns a name into an actionable message.
 *
 * A secret added to the workflow and not to the argument list is a secret the preflight
 * never looks at. It would be absent, or the wrong kind of value, and the run would
 * proceed to fail somewhere downstream with an error that reads as an outage — the exact
 * failure mode `SHAPE_RULES` exists to prevent, arriving through the list rather than
 * through the value.
 *
 * This is the sitemap's defect in a second place: **if it is not named, it is not
 * verified**, and nothing says which names are missing. See
 * [ADR 019](../../../docs/adr/019-an-unclassified-entry-is-an-unverified-one.md).
 */

const ROOT = resolve(__dirname, '../../..')
const WORKFLOW = join(ROOT, '.github/workflows/production-smoke.yml')
const source = readFileSync(WORKFLOW, 'utf8')

/** The names passed to `preflight-secrets.mjs`, read from the `run:` line. */
function preflightArguments(): string[] {
  const invocation = source.match(
    /node scripts\/preflight-secrets\.mjs((?:\s*\\\s*\n\s*[A-Z_][A-Z0-9_]*)+)/
  )
  if (!invocation) return []
  return invocation[1]
    .split('\n')
    .map((line) => line.replace(/[\\\s]/g, ''))
    .filter(Boolean)
}

/** Every `secrets.NAME` the workflow references anywhere. */
function referencedSecrets(): string[] {
  const names = new Set<string>()
  for (const line of source.split('\n')) {
    if (/^\s*#/.test(line)) continue // a comment can name a secret it does not use
    for (const match of line.matchAll(/secrets\.([A-Z_][A-Z0-9_]*)/g)) names.add(match[1])
  }
  return [...names]
}

const args = preflightArguments()
const referenced = referencedSecrets()

describe('the parse found the invocation', () => {
  it('reads the preflight argument list', () => {
    // If the invocation is reformatted and this returns nothing, every comparison below
    // passes over an empty set — green that proves nothing.
    expect(args.length).toBeGreaterThan(0)
  })

  it('reads the secrets the workflow references', () => {
    expect(referenced.length).toBeGreaterThan(0)
  })
})

describe('the three lists describe the same secrets', () => {
  it('every argument has a WHERE entry telling a human where to set it', () => {
    for (const name of args) {
      expect(
        Object.keys(WHERE),
        `${name} is passed to the preflight but has no WHERE entry, so a failure names ` +
          `the secret and not the console it is fixed in. Configuring from scratch then ` +
          `costs a search per credential.`
      ).toContain(name)
    }
  })

  it('every WHERE entry is a secret the preflight is actually given', () => {
    // The reverse direction. A WHERE entry for a name nobody passes is a message that
    // can never print — harmless, and indistinguishable from a name that was dropped
    // from the argument list by accident.
    for (const name of Object.keys(WHERE)) {
      expect(args, `WHERE describes ${name}, which the workflow never passes`).toContain(name)
    }
  })

  it('every secret the smoke job uses is one the preflight checks', () => {
    // The assertion that matters. The preflight's whole purpose is to name everything
    // wrong in one message before any request goes out; a secret it is never handed is
    // one that fails later, in a downstream step, with an error that reads as an outage.
    for (const name of referenced) {
      // GITHUB_TOKEN is minted by the runner, not configured by anyone.
      if (name === 'GITHUB_TOKEN') continue
      expect(
        args,
        `production-smoke.yml uses secrets.${name}, but the preflight is never given it. ` +
          `If it is absent or the wrong kind of value, this run fails downstream instead ` +
          `of in the one step built to say so.`
      ).toContain(name)
    }
  })

  it('every argument appears in the preflight step env block', () => {
    // A name in the argument list with no `env:` line reaches the script as undefined
    // and reports as missing on every run — a permanent false positive, which trains
    // the reader to ignore the channel (ADR 011).
    const preflightStep = source.slice(
      source.indexOf('id: preflight'),
      source.indexOf('node scripts/preflight-secrets.mjs')
    )
    for (const name of args) {
      expect(preflightStep, `${name} is passed to the preflight but has no env: line`).toContain(
        `${name}: `
      )
    }
  })
})

describe('shape rules can only fire on secrets the preflight sees', () => {
  it.each(Object.keys(SHAPE_RULES))('%s is in the argument list', (name) => {
    // A shape rule for a secret nobody passes is dead code that reads as coverage. This
    // is the discriminator lesson from production-smoke-handles.test.ts: a check that
    // stops discriminating keeps passing while testing nothing.
    expect(
      args,
      `SHAPE_RULES has a rule for ${name}, which the preflight is never given, so the ` +
        `rule cannot fire. Either pass the secret or drop the rule.`
    ).toContain(name)
  })
})

describe('the isolation marker is read from a variable, never a secret', () => {
  it('the workflow passes SMOKE_SECRETS_SOURCE from vars', () => {
    // The marker's whole job is to be settable only on the environment. Sourcing it from
    // `secrets.` would make it indistinguishable from the credentials it is supposed to
    // vouch for. See ADR 006.
    expect(source).toContain(`${SOURCE_MARKER}: \${{ vars.${SOURCE_MARKER} }}`)
  })

  it('is not in the argument list, because it is a marker and not a credential', () => {
    expect(args).not.toContain(SOURCE_MARKER)
  })
})
