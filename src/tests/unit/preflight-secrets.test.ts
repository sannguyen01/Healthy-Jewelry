import { describe, it, expect } from 'vitest'

const { preflight, SOURCE_MARKER, EXPECTED_MARKER } = await import(
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
