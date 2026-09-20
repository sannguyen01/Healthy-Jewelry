import { describe, it, expect } from 'vitest'

const {
  preflight,
  writeStepOutputs,
  capabilities,
  CAPABILITIES,
  SOURCE_MARKER,
  EXPECTED_MARKER,
} = await import('../../../scripts/preflight-secrets.mjs')

/**
 * Two jobs, and the second is the one that matters.
 *
 * 1. Report **every** missing secret at once. `verify-production.mjs` throws on the first
 *    one it needs, so configuring from scratch means five sequential red runs to learn
 *    five facts all knowable up front.
 *
 * 2. Refuse to go green when the secrets are not actually isolated. `production-smoke.yml`
 *    declares `environment: production-readonly`, which reads as hardening but is not:
 *    GitHub auto-creates a named environment with **no protection rules and no secrets**,
 *    and a job with an `environment:` key still receives **repository** secrets. So five
 *    repo-scoped secrets produce a green run with zero isolation and no signal anywhere.
 *
 *    A control that announces protection it is not providing is worse than no control,
 *    because the green run is read as evidence.
 */

const REQUIRED = ['PRODUCTION_SITE_URL', 'SHOPIFY_STORE_DOMAIN', 'SHOPIFY_WEBHOOK_SECRET']

const allPresent = {
  PRODUCTION_SITE_URL: 'https://healthyjewellery.com',
  SHOPIFY_STORE_DOMAIN: 'y0k9ve-q1.myshopify.com',
  SHOPIFY_WEBHOOK_SECRET: 'shhh',
}

describe('preflight-secrets', () => {
  describe('missing secrets', () => {
    it('names every missing variable in one pass, not just the first', () => {
      const { ok, missing, lines } = preflight(REQUIRED, {})

      expect(ok).toBe(false)
      expect(missing).toEqual(REQUIRED)
      // The whole point: one run, all five facts.
      for (const name of REQUIRED) {
        expect(lines.join('\n')).toContain(name)
      }
    })

    it('reports only the ones actually absent', () => {
      const { missing } = preflight(REQUIRED, {
        ...allPresent,
        SHOPIFY_WEBHOOK_SECRET: '',
      })

      expect(missing).toEqual(['SHOPIFY_WEBHOOK_SECRET'])
    })

    it('says where to set them, and that repository scope is wrong', () => {
      const message = preflight(REQUIRED, {}).lines.join('\n')

      expect(message).toContain('production-readonly')
      expect(message).toMatch(/not at repository scope/i)
    })

    it('treats an empty string as missing', () => {
      // GitHub renders an unset secret as an empty string rather than omitting the
      // variable, so a truthiness check is required — `'x' in env` would pass.
      const { ok, missing } = preflight(['PRODUCTION_SITE_URL'], { PRODUCTION_SITE_URL: '' })

      expect(ok).toBe(false)
      expect(missing).toEqual(['PRODUCTION_SITE_URL'])
    })
  })

  describe('isolation marker', () => {
    it('fails when every secret is present but the marker is absent', () => {
      // The self-concealing case. Without this the run is green and silent.
      const { ok, missing, isolated, lines } = preflight(REQUIRED, allPresent)

      expect(missing).toEqual([])
      expect(isolated).toBe(false)
      expect(ok).toBe(false)
      expect(lines.join('\n')).toMatch(/REPOSITORY scope/i)
    })

    it('explains that the environment self-creates, so creating it proves nothing', () => {
      // The exact misconception this replaces: an earlier revision of the runbook claimed
      // a job naming a missing environment "fails at dispatch". It does not — GitHub
      // creates it empty, so its existence is not evidence of anything.
      const message = preflight(REQUIRED, allPresent).lines.join('\n')

      expect(message).toMatch(/automatically/i)
      expect(message).toMatch(/protection rules/i)
    })

    it('passes only when secrets are present and marked as environment-sourced', () => {
      const { ok, isolated } = preflight(REQUIRED, {
        ...allPresent,
        [SOURCE_MARKER]: EXPECTED_MARKER,
      })

      expect(isolated).toBe(true)
      expect(ok).toBe(true)
    })

    it('does not accept an arbitrary marker value', () => {
      const { ok } = preflight(REQUIRED, { ...allPresent, [SOURCE_MARKER]: 'yes' })
      expect(ok).toBe(false)
    })

    it('reports missing secrets rather than the marker when both are wrong', () => {
      // Ordering matters for the operator: absent secrets are the blocking problem, and
      // burying that under an isolation warning would send them to the wrong screen.
      const { lines } = preflight(REQUIRED, { [SOURCE_MARKER]: EXPECTED_MARKER })

      expect(lines[0]).toMatch(/required secrets are not set/i)
    })
  })
})

/**
 * **Three states, not two.**
 *
 * Issue #18 is the reason. The `production-readonly` environment has never been
 * created, so every scheduled run failed and appended a "Still failing" comment —
 * every six hours, forever, about a setup step its owner already knew about. That
 * is how the one channel that will later carry a real outage gets muted.
 *
 * But collapsing "nothing is set" and "some things are set" into one quiet state
 * would be worse than the noise. A half-finished configuration is exactly what a
 * botched setup looks like, and it is the state most easily mistaken for a working
 * one — so the boundary between the two is what these tests are really pinning.
 */
describe('preflight states', () => {
  const ALL = ['A', 'B', 'C']
  const isolated = { [SOURCE_MARKER]: EXPECTED_MARKER }

  it('is not-configured when every secret is absent', () => {
    const result = preflight(ALL, {})
    expect(result.state).toBe('not-configured')
    expect(result.ok).toBe(false)
  })

  it('stays not-configured when neither secrets nor marker are set', () => {
    // Nobody sets the marker before setting the secrets, so the quiet state has to
    // be reachable without it.
    expect(preflight(ALL, {}).state).toBe('not-configured')
  })

  /**
   * The marker is evidence of intent. Somebody who set `SMOKE_SECRETS_SOURCE` has
   * opened the environment and begun; secrets still absent means they stopped
   * halfway, which is a real problem rather than an unstarted one.
   */
  it('is misconfigured when the marker is set but no secrets are', () => {
    expect(preflight(ALL, { [SOURCE_MARKER]: EXPECTED_MARKER }).state).toBe('misconfigured')
  })

  /** The boundary. One secret set is a half-finished setup, not an unstarted one. */
  it('becomes misconfigured the moment ONE secret is set', () => {
    expect(preflight(ALL, { A: 'x' }).state).toBe('misconfigured')
    expect(preflight(ALL, { A: 'x', B: 'y' }).state).toBe('misconfigured')
  })

  it('is misconfigured when all are set but not environment-scoped', () => {
    // ADR 006: repo-scoped secrets give the job none of the isolation the
    // environment key advertises, and this is the only thing that says so.
    const result = preflight(ALL, { A: 'x', B: 'y', C: 'z' })
    expect(result.state).toBe('misconfigured')
    expect(result.ok).toBe(false)
  })

  it('is ready when everything is present and isolated', () => {
    const result = preflight(ALL, { A: 'x', B: 'y', C: 'z', ...isolated })
    expect(result.state).toBe('ready')
    expect(result.ok).toBe(true)
  })

  it('explains how to switch it on, rather than just reporting absence', () => {
    const { lines } = preflight(['PRODUCTION_SITE_URL'], {})
    const text = lines.join('\n')
    expect(text).toContain('production-readonly')
    expect(text).toContain(SOURCE_MARKER)
    // The half-configured trap, stated where someone about to configure will read it.
    expect(text).toContain('fail loudly')
  })

  it('an empty required list is not "not-configured"', () => {
    // Guarding the degenerate case: `missing.length === required.length` is also
    // true when both are zero, which would report a workflow that asks for
    // nothing as unconfigured rather than ready.
    expect(preflight([], isolated).state).toBe('ready')
  })
})

describe('writeStepOutputs', () => {
  it('writes key=value lines the runner can parse', () => {
    const written: string[] = []
    writeStepOutputs({ appendFileSync: (_path: string, data: string) => void written.push(data) }, '/out', {
      configured: 'false',
      state: 'not-configured',
    })
    expect(written.join('')).toBe('configured=false\nstate=not-configured\n')
  })

  it('is a no-op outside Actions, so the script still runs by hand', () => {
    const appendFileSync = () => {
      throw new Error('should not be called')
    }
    expect(() => writeStepOutputs({ appendFileSync }, undefined, { a: 'b' })).not.toThrow()
  })
})

/**
 * The failure class presence checks are blind to: a secret that is set, non-empty, and
 * holds a real credential — for a different API.
 *
 * `SHOPIFY_STOREFRONT_ACCESS_TOKEN` held an Admin token (`shpat_…`). Every presence check
 * in this repo passed. The Storefront API answered with an empty-message UNAUTHORIZED,
 * every fetcher fell back to `hj-data.ts`, and the live site served a static catalogue
 * whose placeholder variant IDs made checkout refuse. Six of fourteen live checks went
 * red and not one of them named the cause.
 *
 * These rules are inverse tests on purpose — they fire only on a value that is definitely
 * wrong. Rejecting an unfamiliar-but-working credential would be the worse failure.
 */
describe('malformed secrets', () => {
  const SHAPED = ['PRODUCTION_SITE_URL', 'SHOPIFY_STORE_DOMAIN']
  const goodShapes = {
    PRODUCTION_SITE_URL: 'https://healthyjewellery.com',
    SHOPIFY_STORE_DOMAIN: 'y0k9ve-q1.myshopify.com',
    SHOPIFY_WEBHOOK_SECRET: 'a-webhook-secret',
    [SOURCE_MARKER]: EXPECTED_MARKER,
  }

  it('passes a correctly shaped set', () => {
    const { ok, malformed } = preflight(SHAPED, goodShapes)
    expect(malformed).toEqual([])
    expect(ok).toBe(true)
  })

  /*
   * `catches an Admin token in the storefront slot — the actual outage` and its mirror
   * stood here, and they were the two sharpest tests in this file: they pinned the exact
   * swap that made every fetcher fall back silently while the live site served a static
   * catalogue whose placeholder variant IDs made checkout refuse.
   *
   * Both went with their subject. WS-6 removed `verify-production.mjs`, the only consumer
   * of either token, so neither is passed to the preflight any more and
   * `preflight-enumeration.test.ts` requires a shape rule to name a secret the preflight is
   * actually given. A rule for a name nobody passes is a message that can never print.
   *
   * The two rules that remain below cover the two credentials that survive, and they are
   * the same kind of inverse test: they fire only on a value that is definitely wrong.
   * ADR 026 keeps the reasoning; ADR 035 is why this is a removal with a note rather than a
   * quietly shorter file.
   */

  it('rejects a store domain carrying a scheme, which builds an unresolvable URL', () => {
    const { malformed } = preflight(SHAPED, {
      ...goodShapes,
      SHOPIFY_STORE_DOMAIN: 'https://y0k9ve-q1.myshopify.com',
    })
    expect(malformed).toEqual(['SHOPIFY_STORE_DOMAIN'])
  })

  it('rejects a site URL with no scheme, which surfaces only as "fetch failed"', () => {
    const { malformed } = preflight(SHAPED, {
      ...goodShapes,
      PRODUCTION_SITE_URL: 'healthyjewellery.com',
    })
    expect(malformed).toEqual(['PRODUCTION_SITE_URL'])
  })

  it('stays quiet about shape when the variable is absent — that is the missing case', () => {
    const { missing, malformed } = preflight(SHAPED, {
      ...goodShapes,
      SHOPIFY_STORE_DOMAIN: undefined,
    })
    expect(missing).toEqual(['SHOPIFY_STORE_DOMAIN'])
    expect(malformed).toEqual([])
  })

  it('still reports isolation alongside a malformed value, rather than one at a time', () => {
    const { lines } = preflight(SHAPED, {
      ...goodShapes,
      SHOPIFY_STORE_DOMAIN: 'https://y0k9ve-q1.myshopify.com',
      [SOURCE_MARKER]: undefined,
    })
    const text = lines.join('\n')
    expect(text).toContain('wrong kind')
    expect(text).toContain(SOURCE_MARKER)
  })
})

/**
 * **A capability is not a verdict.**
 *
 * The preflight answers a governance question — *is this environment configured?* — and the
 * workflow was using that one answer to decide whether the live checks may run. Those are
 * different questions, and conflating them cost this repository fourteen days of production
 * verification.
 *
 * `SHOPIFY_ADMIN_ACCESS_TOKEN` held the wrong kind of token, so the preflight failed. The
 * storefront step's `if:` named no status function, and GitHub implicitly ANDs `success()`,
 * so a failed preflight skipped it. That token is read by five of seventeen live checks; the
 * other twelve — including the fabricated-catalogue detector — never touch the Admin API and
 * were skipped for a credential they do not use. So was the webhook probe.
 *
 * These assertions are written against the shape production was actually in, not a shape
 * invented to make the feature look good. See
 * [ADR 026](../../../docs/adr/026-a-capability-is-not-a-verdict.md).
 */
describe('capabilities are computed per check, not per setup', () => {
  /**
   * The environment in the exact state issue #24 reports — an Admin token of the wrong
   * kind — carried forward deliberately even though that token is no longer passed to the
   * preflight.
   *
   * It is the fixture that proves the rule *generalises*: a stray credential in the
   * environment must not disable a capability that does not name it. Deleting it when the
   * token left would have taken the evidence with the credential and left the principle
   * asserted by nothing.
   */
  const PRODUCTION_TODAY = {
    PRODUCTION_SITE_URL: 'https://healthyjewellery.com',
    SHOPIFY_STORE_DOMAIN: 'y0k9ve-q1.myshopify.com',
    SHOPIFY_ADMIN_ACCESS_TOKEN: 'shpca_not_an_admin_token',
    SHOPIFY_WEBHOOK_SECRET: 'a-webhook-secret',
  }

  it('the wrong Admin token does not disable the webhook probe either', () => {
    // It signs a payload with SHOPIFY_WEBHOOK_SECRET and lets the deployed route judge it.
    // No Admin API is involved at any point.
    expect(capabilities('misconfigured', PRODUCTION_TODAY).webhook).toBe(true)
  })

  it('no capability names the Admin token', () => {
    // Structural, so a future edit that adds it to a group has to justify itself here.
    for (const [name, needed] of Object.entries(CAPABILITIES)) {
      expect(needed, `${name} should not require the Admin token`).not.toContain(
        'SHOPIFY_ADMIN_ACCESS_TOKEN'
      )
    }
  })

  it('a malformed credential the capability names does disable it', () => {
    // The half that must not weaken. This used to be the Storefront slot holding an Admin
    // token — the exact swap that made every fetcher fall back silently. The store domain
    // is what remains: it is interpolated straight into a URL, so a scheme in it produces
    // a request that fails to resolve rather than a readable configuration error.
    const swapped = { ...PRODUCTION_TODAY, SHOPIFY_STORE_DOMAIN: 'https://y0k9ve-q1.myshopify.com' }
    expect(capabilities('misconfigured', swapped).webhook).toBe(false)
  })

  it('a missing credential disables only the capabilities that need it', () => {
    const withoutWebhookSecret = { ...PRODUCTION_TODAY }
    delete (withoutWebhookSecret as Partial<typeof PRODUCTION_TODAY>).SHOPIFY_WEBHOOK_SECRET
    const ready = capabilities('misconfigured', withoutWebhookSecret)
    expect(ready.webhook).toBe(false)
  })

  it('nothing is capable when nothing is configured', () => {
    // A store nobody has set up must stay quiet rather than report an outage it never
    // looked for — the distinction ADR 006 built the three states for.
    const ready = capabilities('not-configured', {})
    expect(Object.values(ready).every((v) => v === false)).toBe(true)
  })

  it('a fully valid setup is capable of everything', () => {
    const ready = capabilities('ready', PRODUCTION_TODAY)
    expect(Object.values(ready).every((v) => v === true)).toBe(true)
  })

  it('isolation is not a capability', () => {
    // SMOKE_SECRETS_SOURCE exists to make repo-scoped secrets visible, not to stop a
    // read-only probe running — the secrets reach the job either way. Its absence still
    // fails the preflight, so nothing about it goes quiet; it just no longer vetoes checks.
    const ready = capabilities('misconfigured', PRODUCTION_TODAY)
    expect(PRODUCTION_TODAY).not.toHaveProperty(SOURCE_MARKER)
    expect(ready.webhook).toBe(true)
  })
})
