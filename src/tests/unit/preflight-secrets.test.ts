import { describe, it, expect } from 'vitest'

const { preflight, writeStepOutputs, SOURCE_MARKER, EXPECTED_MARKER } = await import(
  '../../../scripts/preflight-secrets.mjs'
)

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
  const SHAPED = [
    'PRODUCTION_SITE_URL',
    'SHOPIFY_STORE_DOMAIN',
    'SHOPIFY_STOREFRONT_ACCESS_TOKEN',
    'SHOPIFY_ADMIN_ACCESS_TOKEN',
  ]
  const goodShapes = {
    PRODUCTION_SITE_URL: 'https://healthyjewellery.com',
    SHOPIFY_STORE_DOMAIN: 'y0k9ve-q1.myshopify.com',
    SHOPIFY_STOREFRONT_ACCESS_TOKEN: '0123456789abcdef0123456789abcdef',
    SHOPIFY_ADMIN_ACCESS_TOKEN: 'shpat_EXAMPLE-NOT-A-REAL-TOKEN',
    [SOURCE_MARKER]: EXPECTED_MARKER,
  }

  it('passes a correctly shaped set', () => {
    const { ok, malformed } = preflight(SHAPED, goodShapes)
    expect(malformed).toEqual([])
    expect(ok).toBe(true)
  })

  it('catches an Admin token in the storefront slot — the actual outage', () => {
    const { ok, state, malformed, lines } = preflight(SHAPED, {
      ...goodShapes,
      SHOPIFY_STOREFRONT_ACCESS_TOKEN: 'shpat_EXAMPLE-NOT-A-REAL-TOKEN',
    })

    expect(malformed).toEqual(['SHOPIFY_STOREFRONT_ACCESS_TOKEN'])
    expect(state).toBe('misconfigured')
    expect(ok).toBe(false)
    // The message has to name the fix, not just the fault.
    expect(lines.join('\n')).toContain('Headless')
  })

  it('catches the same swap in the other direction', () => {
    const { malformed } = preflight(SHAPED, {
      ...goodShapes,
      SHOPIFY_ADMIN_ACCESS_TOKEN: '0123456789abcdef0123456789abcdef',
    })
    expect(malformed).toEqual(['SHOPIFY_ADMIN_ACCESS_TOKEN'])
  })

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
      SHOPIFY_STOREFRONT_ACCESS_TOKEN: undefined,
    })
    expect(missing).toEqual(['SHOPIFY_STOREFRONT_ACCESS_TOKEN'])
    expect(malformed).toEqual([])
  })

  it('still reports isolation alongside a malformed value, rather than one at a time', () => {
    const { lines } = preflight(SHAPED, {
      ...goodShapes,
      SHOPIFY_STOREFRONT_ACCESS_TOKEN: 'shpat_EXAMPLE-NOT-A-REAL-TOKEN',
      [SOURCE_MARKER]: undefined,
    })
    const text = lines.join('\n')
    expect(text).toContain('wrong kind')
    expect(text).toContain(SOURCE_MARKER)
  })
})
