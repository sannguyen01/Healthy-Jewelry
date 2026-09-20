import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseSource, importsFrom } from '@/lib/analysis/tsAstScan'

const shared = await import('../../../scripts/lib/webhook-signature.mjs')
const webhookCli = await import('../../../scripts/verify-webhook-secret.mjs')

/**
 * `verify-production.mjs` used to import `buildProbeRequest` straight out of
 * `verify-webhook-secret.mjs` — one CLI reaching into another CLI's internals, with
 * **nothing testing the coupling**. A signature change would have broken the production
 * script silently, discovered only the next time somebody ran it.
 *
 * The fix was not to delete the import. Duplicating an HMAC across two scripts is how a
 * silent divergence starts, and a divergence there means every webhook fails
 * authentication with no diagnostic. The logic is shared from a module both CLIs depend on
 * — and this file is the test that was missing.
 *
 * ## One CLI now, and the contract is still worth holding
 *
 * WS-6 deleted `verify-production.mjs`: its seventeen checks all needed a Shopify
 * credential and its central discriminator inverted when the bundled catalogue became the
 * source (ADR 034). So the *pair* this file was written about is a single script, and half
 * its assertions — "neither CLI imports the other" — have one member.
 *
 * Kept rather than deleted, for two reasons. `buildProbeRequest`, `signWebhookBody` and
 * `resolveStoreDomain` are still the thing that decides whether a real Shopify delivery
 * authenticates against `/api/webhooks/shopify`, and that route survives until WS-7 removes
 * the subscriptions. And the boundary rule is the kind that only matters when a second
 * caller appears: asserting it against one is cheap, and asserting it for the first time
 * against two is the version nobody writes. See ADR 035.
 */

const ROOT = process.cwd()
const CLI_PATHS = {
  webhook: 'scripts/verify-webhook-secret.mjs',
}

function importsIn(relPath: string): string[] {
  const full = join(ROOT, relPath)
  const sourceFile = parseSource(full, readFileSync(full, 'utf-8'))
  // Both plausible spellings of the sibling CLI, resolved through the AST rather than
  // matched, per ADR 007 — this is an import-graph question.
  return ['./verify-webhook-secret.mjs', './verify-production.mjs'].filter(
    (specifier) => importsFrom(sourceFile, specifier).length > 0,
  )
}

describe('webhook probe contract', () => {
  describe('module boundaries', () => {
    it('the CLI imports no sibling CLI', () => {
      // The property finding #6 is really about. A CLI may depend on the shared module;
      // it may not depend on another CLI's internals.
      expect(importsIn(CLI_PATHS.webhook)).toEqual([])
    })

    it('the CLI depends on the shared module', () => {
      // The inverse failure: satisfying the rule above by duplicating the signing.
      for (const relPath of Object.values(CLI_PATHS)) {
        const full = join(ROOT, relPath)
        const sourceFile = parseSource(full, readFileSync(full, 'utf-8'))
        expect(
          importsFrom(sourceFile, './lib/webhook-signature.mjs').length,
          `${relPath} should import the shared module`,
        ).toBeGreaterThan(0)
      }
    })

    it('the webhook CLI still exposes the signing surface it always did', () => {
      // Re-exported rather than moved out of reach, so `webhook-signature-script.test.ts`
      // keeps exercising this script's own output against the real route handler instead
      // of being quietly rerouted one level down.
      for (const name of ['signWebhookBody', 'buildProbeRequest', 'interpretStatus']) {
        expect(webhookCli, `verify-webhook-secret should re-export ${name}`).toHaveProperty(name)
      }
    })

    it('importing the CLI has no side effects', () => {
      // It is guarded against running main() on import, and that guard has to hold for the
      // very import at the top of this file. `productionCli` was asserted here too, on
      // `SHOPIFY_ONLY_HANDLES` — a list whose job was telling the bundled catalogue from
      // Shopify's, and which went with the script.
      expect(webhookCli).toHaveProperty('buildProbeRequest')
      expect(shared).toHaveProperty('buildProbeRequest')
    })
  })

  describe('resolveStoreDomain', () => {
    // The violation that had already happened: one CLI accepted either variable, the other
    // hard-required one, so the same probe succeeded from one script and failed from the
    // other.
    it('accepts the workflow variable', () => {
      expect(shared.resolveStoreDomain({ SHOPIFY_STORE_DOMAIN: 'a.myshopify.com' })).toBe(
        'a.myshopify.com',
      )
    })

    it('accepts the app variable', () => {
      expect(
        shared.resolveStoreDomain({ NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN: 'b.myshopify.com' }),
      ).toBe('b.myshopify.com')
    })

    it('prefers the workflow variable when both are set', () => {
      expect(
        shared.resolveStoreDomain({
          SHOPIFY_STORE_DOMAIN: 'a.myshopify.com',
          NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN: 'b.myshopify.com',
        }),
      ).toBe('a.myshopify.com')
    })

    it('names both variables when neither is set', () => {
      // An error naming only the one checked first sends the reader to set a variable they
      // may already have set under the other name.
      expect(() => shared.resolveStoreDomain({})).toThrow(/SHOPIFY_STORE_DOMAIN/)
      expect(() => shared.resolveStoreDomain({})).toThrow(/NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN/)
    })

    it('the CLI does not hard-require one spelling', () => {
      // `required('SHOPIFY_STORE_DOMAIN')` in verify-production.mjs was the actual
      // divergence: one CLI accepted either variable and the other demanded one, so the
      // same probe succeeded from one script and failed from the other. That script is
      // gone; pinning the absence keeps the surviving one answerable to the contract, and
      // keeps it that way for whatever calls the shared module next.
      for (const relPath of Object.values(CLI_PATHS)) {
        const src = readFileSync(join(ROOT, relPath), 'utf-8')
        expect(src, `${relPath} should resolve the domain, not require one name`).not.toMatch(
          /required\(\s*['"]SHOPIFY_STORE_DOMAIN['"]\s*\)/,
        )
      }
    })
  })

  describe('probe request shape', () => {
    it('returns a url and init the production script can send unchanged', () => {
      const { url, init } = shared.buildProbeRequest({
        siteUrl: 'https://healthyjewellery.com',
        secret: 's',
        shopDomain: 'a.myshopify.com',
      })

      expect(url).toBe('https://healthyjewellery.com/api/webhooks/shopify')
      expect(init.method).toBe('POST')
      expect(init.headers['x-shopify-topic']).toBe(shared.WEBHOOK_PROBE_TOPIC)
      expect(init.headers['x-shopify-hmac-sha256']).toEqual(expect.any(String))
      expect(init.headers['x-shopify-shop-domain']).toBe('a.myshopify.com')
      expect(init.body).toBeInstanceOf(Buffer)
    })

    it('omits the shop-domain header when no domain is known', () => {
      // The route rejects a *mismatched* domain but ignores an absent one, so a preview
      // deployment with none configured must still be probeable.
      const { init } = shared.buildProbeRequest({ siteUrl: 'https://x.test', secret: 's' })
      expect(init.headers).not.toHaveProperty('x-shopify-shop-domain')
    })

    it('accepts a caller-supplied body, which the production check relies on', () => {
      // verify-production.mjs sends a real handle so the revalidation it triggers is
      // observable. If this stopped honouring `body`, that check would silently probe the
      // sentinel handle instead and prove nothing.
      const body = Buffer.from(JSON.stringify({ handle: 'meridian-cuff' }), 'utf-8')
      const { init } = shared.buildProbeRequest({ siteUrl: 'https://x.test', secret: 's', body })

      expect(init.body.toString('utf-8')).toContain('meridian-cuff')
      expect(init.headers['x-shopify-hmac-sha256']).toBe(shared.signWebhookBody(body, 's'))
    })
  })
})
