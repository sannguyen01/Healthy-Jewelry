import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

// next/cache is server-only; mock before importing the route.
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}))

const { POST } = await import('@/app/api/webhooks/shopify/route')
const {
  signWebhookBody,
  buildProbeBody,
  buildProbeRequest,
  interpretStatus,
  WEBHOOK_PROBE_TOPIC,
} = await import('../../../scripts/verify-webhook-secret.mjs')

/**
 * `scripts/verify-webhook-secret.mjs` is only worth anything if it signs a body
 * the way the deployed route verifies it. A test that re-derived the expected
 * signature here would prove nothing — it would assert that this file agrees
 * with itself, the exact failure mode that let `material:steel` mismatch
 * `surgical-steel` on all 22 products while every test stayed green.
 *
 * So the oracle is the **real route handler**. The script builds the request;
 * the route decides. If the two ever disagree about which bytes get signed, or
 * about encoding, the route answers 401 and these tests go red.
 */

const TEST_SECRET = 'test-webhook-secret'
const SITE_URL = 'https://healthyjewellery.com'

/** Replay the script's own probe through the route, unmodified. */
function replayProbe(opts: Parameters<typeof buildProbeRequest>[0]): Promise<Response> {
  const { url, init } = buildProbeRequest(opts)
  return POST(
    new NextRequest(url, {
      method: 'POST',
      headers: init.headers,
      // Same bytes, viewed as a plain Uint8Array — Node's Buffer does not line
      // up with the DOM `BodyInit` union under this tsconfig. Wrapping rather
      // than stringifying is deliberate: the byte fidelity is the thing under
      // test.
      body: new Uint8Array(init.body),
    }),
  )
}

describe('scripts/verify-webhook-secret.mjs', () => {
  beforeEach(() => {
    vi.unstubAllEnvs()
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  describe('agreement with the deployed route', () => {
    beforeEach(() => {
      vi.stubEnv('SHOPIFY_WEBHOOK_SECRET', TEST_SECRET)
    })

    it('signs a probe the route accepts and handles (200)', async () => {
      const res = await replayProbe({ siteUrl: SITE_URL, secret: TEST_SECRET })

      // 200, not 202: the probe topic must be one the route actually handles,
      // otherwise a correct secret and an ignored topic look the same.
      expect(res.status).toBe(200)
      expect(interpretStatus(res.status).ok).toBe(true)
    })

    it('probes a topic that is on the route handled allowlist', async () => {
      expect(WEBHOOK_PROBE_TOPIC).toBe('products/update')
      const res = await replayProbe({ siteUrl: SITE_URL, secret: TEST_SECRET })
      expect(res.status).not.toBe(202)
    })

    it('is rejected when signed with the wrong secret (401)', async () => {
      // The two-secret trap, reproduced: right shape, right topic, wrong key.
      const res = await replayProbe({ siteUrl: SITE_URL, secret: 'the-other-secret' })

      expect(res.status).toBe(401)
      const verdict = interpretStatus(res.status)
      expect(verdict.ok).toBe(false)
      expect(verdict.verdict).toBe('WRONG SECRET')
      // The whole point of the script is that the operator learns *which* trap
      // they hit, so the guidance must name both secrets.
      expect(verdict.detail).toMatch(/Settings → Notifications/)
      expect(verdict.detail).toMatch(/app client secret/)
    })

    it('reports 503 as unset rather than as a wrong secret', async () => {
      vi.stubEnv('SHOPIFY_WEBHOOK_SECRET', '')
      const res = await replayProbe({ siteUrl: SITE_URL, secret: TEST_SECRET })

      expect(res.status).toBe(503)
      const verdict = interpretStatus(res.status)
      expect(verdict.ok).toBe(false)
      expect(verdict.verdict).toBe('SECRET NOT SET')
    })

    it('is rejected when the shop domain belongs to a different store (401)', async () => {
      vi.stubEnv('NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN', 'y0k9ve-q1.myshopify.com')
      const res = await replayProbe({
        siteUrl: SITE_URL,
        secret: TEST_SECRET,
        shopDomain: 'someone-elses-store.myshopify.com',
      })

      expect(res.status).toBe(401)
    })

    it('is accepted when the shop domain matches the configured store', async () => {
      vi.stubEnv('NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN', 'y0k9ve-q1.myshopify.com')
      const res = await replayProbe({
        siteUrl: SITE_URL,
        secret: TEST_SECRET,
        shopDomain: 'y0k9ve-q1.myshopify.com',
      })

      expect(res.status).toBe(200)
    })
  })

  describe('signing', () => {
    it('signs raw bytes, not a re-serialised object', () => {
      // Shopify signs the exact bytes it sent. Two JSON strings that parse to
      // the same object but differ in whitespace must produce *different*
      // signatures — if they did not, the signer is parsing before hashing.
      const compact = Buffer.from('{"a":1}', 'utf-8')
      const spaced = Buffer.from('{"a": 1}', 'utf-8')

      expect(signWebhookBody(compact, TEST_SECRET)).not.toBe(signWebhookBody(spaced, TEST_SECRET))
    })

    it('produces a stable base64 digest for the same bytes and secret', () => {
      const body = buildProbeBody()
      expect(signWebhookBody(body, TEST_SECRET)).toBe(signWebhookBody(body, TEST_SECRET))
      expect(signWebhookBody(body, TEST_SECRET)).toMatch(/^[A-Za-z0-9+/]+=*$/)
    })

    it('produces different digests for different secrets', () => {
      const body = buildProbeBody()
      expect(signWebhookBody(body, 'secret-a')).not.toBe(signWebhookBody(body, 'secret-b'))
    })
  })

  describe('probe payload', () => {
    it('does not target a real product handle', async () => {
      // Revalidating a tag nothing is registered under is a no-op. If this ever
      // became a real handle, running the probe would purge that product's
      // cache in production.
      const { getAllProducts } = await import('@/lib/data/hj-data')
      const payload = JSON.parse(buildProbeBody().toString('utf-8')) as { handle: string }
      const realHandles = getAllProducts().map((p) => p.handle)

      expect(realHandles).not.toContain(payload.handle)
    })

    it('does not probe with an orders topic', () => {
      // An `orders/*` probe would write a fake line into the order log the
      // operator uses to confirm real sales.
      expect(WEBHOOK_PROBE_TOPIC.startsWith('orders/')).toBe(false)
    })
  })

  describe('status interpretation', () => {
    it('treats an unexpected status as a failure rather than guessing', () => {
      for (const status of [404, 500, 502]) {
        const verdict = interpretStatus(status)
        expect(verdict.ok).toBe(false)
        expect(verdict.verdict).toContain(String(status))
      }
    })

    it('accepts 202 as a correct secret, since only the topic was unhandled', () => {
      const verdict = interpretStatus(202)
      expect(verdict.ok).toBe(true)
      expect(verdict.verdict).toMatch(/topic unhandled/)
    })
  })
})
