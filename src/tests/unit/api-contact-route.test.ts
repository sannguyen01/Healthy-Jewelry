import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

// Mock Resend before importing the route
vi.mock('resend', () => ({
  Resend: vi.fn().mockImplementation(() => ({
    emails: {
      send: vi.fn().mockResolvedValue({ id: 'mock-email-id' }),
    },
  })),
}))

// Mock @upstash/ratelimit and @upstash/redis so tests run without real Redis.
// In test env UPSTASH_REDIS_REST_URL is unset → upstashRl stays null → in-memory
// fallback is used. These mocks just prevent import errors when packages are installed.
vi.mock('@upstash/ratelimit', () => ({
  Ratelimit: vi.fn().mockImplementation(() => ({
    limit: vi.fn().mockResolvedValue({ success: true }),
  })),
}))
vi.mock('@upstash/redis', () => ({
  Redis: { fromEnv: vi.fn().mockReturnValue({}) },
}))

const { POST } = await import('@/app/api/contact/route')

// ── Helpers ────────────────────────────────────────────────────────────────

const VALID_BODY = {
  name: 'San Nguyen',
  email: 'san@example.com',
  subject: 'General inquiry',
  message: 'Hello, I have a question about titanium rings.',
}

// Each test gets its own unique IP so the in-memory rate limiter (5 req/IP/hour)
// never fires across validation tests that share the same process.
let ipCounter = 100
function makeReq(body: unknown): NextRequest {
  const ip = `192.0.2.${ipCounter++}`
  return new NextRequest('http://localhost/api/contact', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': ip },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('POST /api/contact', () => {
  beforeEach(() => {
    vi.unstubAllEnvs()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  describe('request body validation', () => {
    it('returns 400 for invalid JSON', async () => {
      const req = new NextRequest('http://localhost/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '192.0.2.1' },
        body: 'not-json',
      })
      const res = await POST(req)
      expect(res.status).toBe(400)
    })

    it('returns 400 when name is missing', async () => {
      const { name, ...body } = VALID_BODY
      void name
      const res = await POST(makeReq(body))
      expect(res.status).toBe(400)
      const json = (await res.json()) as { error: string }
      expect(json.error).toMatch(/name/i)
    })

    it('returns 400 when name is too short (< 2 chars)', async () => {
      const res = await POST(makeReq({ ...VALID_BODY, name: 'A' }))
      expect(res.status).toBe(400)
    })

    it('returns 400 when name exceeds 100 chars', async () => {
      const res = await POST(makeReq({ ...VALID_BODY, name: 'A'.repeat(101) }))
      expect(res.status).toBe(400)
    })

    it('returns 400 for invalid email', async () => {
      const res = await POST(makeReq({ ...VALID_BODY, email: 'not-an-email' }))
      expect(res.status).toBe(400)
      const json = (await res.json()) as { error: string }
      expect(json.error).toMatch(/email/i)
    })

    it('returns 400 when subject is missing', async () => {
      const { subject, ...body } = VALID_BODY
      void subject
      const res = await POST(makeReq(body))
      expect(res.status).toBe(400)
      const json = (await res.json()) as { error: string }
      expect(json.error).toMatch(/subject/i)
    })

    it('returns 400 when message is too short (< 10 chars)', async () => {
      const res = await POST(makeReq({ ...VALID_BODY, message: 'Short' }))
      expect(res.status).toBe(400)
      const json = (await res.json()) as { error: string }
      expect(json.error).toMatch(/message/i)
    })

    it('returns 400 when message exceeds 2000 chars', async () => {
      const res = await POST(makeReq({ ...VALID_BODY, message: 'A'.repeat(2001) }))
      expect(res.status).toBe(400)
    })
  })

  describe('in-memory rate limit (no Upstash configured)', () => {
    it('rate-limits the 6th request from the same IP within the window', async () => {
      const ip = '198.51.100.10'
      const reqFor = () =>
        new NextRequest('http://localhost/api/contact', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-forwarded-for': ip },
          body: JSON.stringify(VALID_BODY),
        })

      for (let i = 0; i < 5; i++) {
        const res = await POST(reqFor())
        expect(res.status).not.toBe(429)
      }
      const sixth = await POST(reqFor())
      expect(sixth.status).toBe(429)
    })

    it('prunes an expired entry so the same IP is allowed again after the window passes', async () => {
      vi.useFakeTimers()
      try {
        const ip = '198.51.100.20'
        const reqFor = () =>
          new NextRequest('http://localhost/api/contact', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-forwarded-for': ip },
            body: JSON.stringify(VALID_BODY),
          })

        for (let i = 0; i < 5; i++) {
          await POST(reqFor())
        }
        expect((await POST(reqFor())).status).toBe(429)

        // Advance past the 1-hour rate-limit window.
        vi.advanceTimersByTime(3_600_000 + 1000)

        const afterWindow = await POST(reqFor())
        expect(afterWindow.status).not.toBe(429)
      } finally {
        vi.useRealTimers()
      }
    })
  })

  describe('RESEND_API_KEY not set — honest failure, not a fabricated success', () => {
    it('returns 503 with an actionable error instead of a fabricated success', async () => {
      vi.stubEnv('RESEND_API_KEY', '')
      const req = new NextRequest('http://localhost/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '192.0.2.50' },
        body: JSON.stringify(VALID_BODY),
      })
      const res = await POST(req)
      expect(res.status).toBe(503)
      const json = (await res.json()) as { error: string }
      expect(json.error).toMatch(/failed to send/i)
    })

    it('does NOT include customer email in console output (GDPR data minimisation)', async () => {
      vi.stubEnv('RESEND_API_KEY', '')
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      await POST(makeReq(VALID_BODY))
      const logged = errorSpy.mock.calls.flat().join(' ')
      expect(logged).not.toContain(VALID_BODY.email)
      errorSpy.mockRestore()
    })
  })

  describe('success path — RESEND_API_KEY present', () => {
    it('returns 200 on valid submission', async () => {
      vi.stubEnv('RESEND_API_KEY', 'test_resend_key')
      const req = new NextRequest('http://localhost/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '192.0.2.51' },
        body: JSON.stringify(VALID_BODY),
      })
      const res = await POST(req)
      expect(res.status).toBe(200)
      const json = (await res.json()) as { success: boolean }
      expect(json.success).toBe(true)
    })

    it('returns 500 when Resend throws', async () => {
      vi.stubEnv('RESEND_API_KEY', 'test_resend_key')
      const { Resend } = await import('resend')
      vi.mocked(Resend).mockImplementationOnce(
        () =>
          ({
            emails: {
              send: vi.fn().mockRejectedValueOnce(new Error('Resend API down')),
            },
          }) as unknown as InstanceType<typeof Resend>
      )
      const req = new NextRequest('http://localhost/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '192.0.2.52' },
        body: JSON.stringify(VALID_BODY),
      })
      const res = await POST(req)
      expect(res.status).toBe(500)
      const json = (await res.json()) as { error: string }
      expect(json.error).toMatch(/failed to send/i)
    })
  })
})
