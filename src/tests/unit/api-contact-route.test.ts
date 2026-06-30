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
      const { name: _n, ...body } = VALID_BODY
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
      const { subject: _s, ...body } = VALID_BODY
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

  describe('graceful degradation — no RESEND_API_KEY', () => {
    it('returns 200 and logs when RESEND_API_KEY is not set', async () => {
      vi.stubEnv('RESEND_API_KEY', '')
      const req = new NextRequest('http://localhost/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '192.0.2.50' },
        body: JSON.stringify(VALID_BODY),
      })
      const res = await POST(req)
      expect(res.status).toBe(200)
      const json = (await res.json()) as { success: boolean }
      expect(json.success).toBe(true)
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
          }) as unknown as InstanceType<typeof Resend>,
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
