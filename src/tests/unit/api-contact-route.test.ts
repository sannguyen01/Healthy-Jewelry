import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * Resend, mocked at the module boundary — in the shape resend@6 actually returns.
 *
 * This mock resolved `{ id: 'mock-email-id' }` until 2026-09-25. resend@6 never returns
 * that: `emails.send()` resolves `{ data, error, headers }`, with `data: null` and an
 * `error` object for **every** non-2xx — it does not throw. A fixture shaped like the
 * author's memory of the API rather than like the API
 * ([ADR 028](../../../docs/adr/028-a-fixture-is-the-input-you-thought-of.md)) is why the
 * route could ignore the return value, answer `{ success: true }` to a rejected send, and
 * pass this file for as long as both existed.
 *
 * One `send` spy shared by every instance, so a test can both script the answer and read
 * back what the route asked Resend to deliver.
 */
const send = vi.hoisted(() => vi.fn())
const SENT = { data: { id: 'mock-email-id' }, error: null, headers: null }

vi.mock('resend', () => ({
  Resend: vi.fn().mockImplementation(() => ({ emails: { send } })),
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
const { CONTACT_EMAIL, SENDER_EMAIL } = await import('@/config/site')

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
    send.mockReset()
    send.mockResolvedValue(SENT)
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

    it.each([
      ['null', 'null'],
      ['a number', '42'],
      ['a string', '"hello"'],
      ['an array', '[]'],
    ])('returns 400, not 500, for a JSON body that is %s', async (_label, raw) => {
      // JSON.parse accepts every one of these, and destructuring `null` threw: a malformed
      // request was answered with a 500 (found 2026-10-04 by probing the running build).
      const req = new NextRequest('http://localhost/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '192.0.2.2' },
        body: raw,
      })
      const res = await POST(req)
      expect(res.status).toBe(400)
      expect(((await res.json()) as { error: string }).error).toBe('Invalid request body')
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

    it('asks Resend to deliver exactly the message, to the Company inbox, replying to the sender', async () => {
      // What "success" is a claim about. Without this the 200 above would pass for a
      // route that sent an empty email to the wrong address.
      vi.stubEnv('RESEND_API_KEY', 'test_resend_key')
      const res = await POST(makeReq(VALID_BODY))
      expect(res.status).toBe(200)

      expect(send).toHaveBeenCalledOnce()
      const payload = send.mock.calls[0][0] as {
        from: string
        to: string[]
        replyTo: string
        subject: string
        text: string
      }
      expect(payload.to).toEqual([CONTACT_EMAIL])
      expect(payload.from).toContain(SENDER_EMAIL)
      expect(payload.replyTo).toBe(VALID_BODY.email)
      expect(payload.subject).toContain(VALID_BODY.subject)
      expect(payload.subject).toContain(VALID_BODY.name)
      expect(payload.text).toContain(VALID_BODY.message)
      expect(payload.text).toContain(VALID_BODY.email)
    })

    it('sends the name as one line: no line break reaches the subject header or forges a body line', async () => {
      // The subject was sanitised and the name, which sits in the same header, was not: a
      // name carrying CR/LF went into the notification as typed.
      vi.stubEnv('RESEND_API_KEY', 'test_resend_key')
      const name = 'Ada\r\nBcc: someone@example.com\nEmail: forged@example.com\u2028'
      const res = await POST(makeReq({ ...VALID_BODY, name }))
      expect(res.status).toBe(200)
      const payload = send.mock.calls[0][0] as { subject: string; text: string }
      expect(payload.subject).not.toMatch(/[\r\n\u2028\u2029]/)
      expect(payload.subject).toContain('Ada')
      const lines = payload.text.split('\n')
      expect(lines.filter((line) => line.startsWith('Email:'))).toEqual([`Email: ${VALID_BODY.email}`])
      expect(lines[0]).toBe('Name: Ada  Bcc: someone@example.com Email: forged@example.com')
    })

    it('returns 500 when Resend throws', async () => {
      vi.stubEnv('RESEND_API_KEY', 'test_resend_key')
      send.mockRejectedValueOnce(new Error('Resend API down'))
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

  /**
   * **A rejected send is a failure, and the customer is told so.**
   *
   * resend@6 answers every refusal — unverified domain, bad key, 429, validation — with a
   * resolved `{ data: null, error }`. The route used to discard that value and return
   * `{ success: true }`, so a message that went nowhere was reported as delivered. These
   * cases script the SDK's real failure shapes and require the honest answer.
   */
  describe('Resend refuses the message — the return value is the answer', () => {
    // Shaped like resend@6's ErrorResponse. The message deliberately echoes an address,
    // because Resend's messages can: it is the reason only name and statusCode are logged.
    const REFUSED = {
      data: null,
      error: {
        name: 'validation_error',
        statusCode: 403,
        message: `The ${VALID_BODY.email} address could not be used: domain is not verified.`,
      },
      headers: {},
    }

    async function refusedWith(result: unknown) {
      vi.stubEnv('RESEND_API_KEY', 'test_resend_key')
      send.mockResolvedValueOnce(result)
      return POST(makeReq(VALID_BODY))
    }

    it('answers 502 with the honest error, never success, when Resend returns { error }', async () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const res = await refusedWith(REFUSED)
      const json = (await res.json()) as { error?: string; success?: boolean }

      expect(res.status).toBe(502)
      expect(json.success).toBeUndefined()
      expect(json.error).toMatch(/failed to send/i)
      spy.mockRestore()
    })

    it('logs the refusal by name and status code — the branch that saw the error, not a fallback', async () => {
      // Asserting the specific fields is what separates this branch from the no-id guard
      // below, which would also answer 502 if this one were skipped.
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
      await refusedWith(REFUSED)

      expect(spy).toHaveBeenCalledWith(expect.stringContaining('[contact]'), {
        name: 'validation_error',
        statusCode: 403,
      })
      spy.mockRestore()
    })

    it.each([
      ['{ data: null, error: null }', { data: null, error: null, headers: null }],
      ['data without an id', { data: {}, error: null, headers: null }],
    ])('treats %s as a failure — no id is not a delivery', async (_label, result) => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const res = await refusedWith(result)
      expect(res.status).toBe(502)
      expect(((await res.json()) as { success?: boolean }).success).toBeUndefined()
      spy.mockRestore()
    })

    it('never writes the customer, their words, or the provider message into the logs', async () => {
      // Vercel function logs are readable by every project member. Every failure path is
      // driven here, and every console.error argument is serialised — objects included,
      // which is where a raw error would have carried `replyTo` back out.
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

      await refusedWith(REFUSED)
      await refusedWith({ data: null, error: null, headers: null })
      vi.stubEnv('RESEND_API_KEY', 'test_resend_key')
      send.mockRejectedValueOnce(new Error(`connect failed for ${VALID_BODY.email}`))
      await POST(makeReq(VALID_BODY))
      vi.stubEnv('RESEND_API_KEY', '')
      await POST(makeReq(VALID_BODY))

      expect(spy.mock.calls.length, 'no failure path logged anything').toBeGreaterThanOrEqual(4)
      const logged = spy.mock.calls
        .flat()
        .map((a) => (typeof a === 'string' ? a : JSON.stringify(a)))
        .join(' ')
      for (const pii of [
        VALID_BODY.email,
        VALID_BODY.name,
        VALID_BODY.message,
        VALID_BODY.subject,
        'domain is not verified',
      ]) {
        expect(logged, `a log line carried "${pii}"`).not.toContain(pii)
      }
      spy.mockRestore()
    })
  })
})

// ── Another site's form, and a form with no JavaScript (2026-10-04) ────────

function rawReq(body: string, headers: Record<string, string>): NextRequest {
  return new NextRequest('http://localhost/api/contact', {
    method: 'POST',
    headers: { host: 'localhost', 'x-forwarded-for': `198.51.100.${ipCounter++ % 250}`, ...headers },
    body,
  })
}

const FORM = 'application/x-www-form-urlencoded'
const formBody = (fields: Record<string, string>) => new URLSearchParams(fields).toString()

describe('POST /api/contact — requests from another site are refused', () => {
  beforeEach(() => {
    vi.unstubAllEnvs()
    vi.stubEnv('RESEND_API_KEY', 'test_resend_key')
    send.mockReset()
    send.mockResolvedValue(SENT)
  })
  afterEach(() => vi.unstubAllEnvs())

  it.each([
    ['an Origin on another host', { origin: 'https://elsewhere.example' }],
    ['Sec-Fetch-Site: cross-site', { 'sec-fetch-site': 'cross-site' }],
    ['an opaque Origin (null)', { origin: 'null' }],
    ['an Origin that is not a URL', { origin: 'not a url' }],
  ])('403 for %s, before the limiter or the inbox', async (_label, headers) => {
    const res = await POST(rawReq(JSON.stringify(VALID_BODY), { 'content-type': 'application/json', ...headers }))
    expect(res.status).toBe(403)
    expect(send).not.toHaveBeenCalled()
  })

  it('refuses the text/plain trick: JSON smuggled in by a cross-site form', async () => {
    // A cross-site <form enctype="text/plain"> can send a body that parses as JSON. Until
    // 2026-10-04 this route parsed it, whatever the content type.
    const res = await POST(
      rawReq(JSON.stringify(VALID_BODY), { 'content-type': 'text/plain', origin: 'https://elsewhere.example' })
    )
    expect(res.status).toBe(403)
    expect(send).not.toHaveBeenCalled()
  })

  it('accepts its own origin, and a client that sends no Origin at all', async () => {
    const own = await POST(rawReq(JSON.stringify(VALID_BODY), { 'content-type': 'application/json', origin: 'http://localhost', 'sec-fetch-site': 'same-origin' }))
    expect(own.status).toBe(200)
    const bare = await POST(rawReq(JSON.stringify(VALID_BODY), { 'content-type': 'application/json' }))
    expect(bare.status).toBe(200)
    expect(send).toHaveBeenCalledTimes(2)
  })
})

describe('POST /api/contact — a form posted without JavaScript gets a page', () => {
  beforeEach(() => {
    vi.unstubAllEnvs()
    send.mockReset()
    send.mockResolvedValue(SENT)
  })
  afterEach(() => vi.unstubAllEnvs())

  it('sends the message and answers with a page, not JSON', async () => {
    vi.stubEnv('RESEND_API_KEY', 'test_resend_key')
    const res = await POST(rawReq(formBody(VALID_BODY), { 'content-type': `${FORM}; charset=UTF-8`, origin: 'http://localhost' }))
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/html')
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(await res.text()).toContain('Message sent.')
    const payload = send.mock.calls[0][0] as { replyTo: string; text: string }
    expect(payload.replyTo).toBe(VALID_BODY.email)
    expect(payload.text).toContain(VALID_BODY.message)
  })

  it('answers a refusal with a page that never echoes what was typed', async () => {
    const hostile = '<script>alert(1)</script>'
    const res = await POST(rawReq(formBody({ ...VALID_BODY, name: hostile, email: 'not-an-email' }), { 'content-type': FORM }))
    expect(res.status).toBe(400)
    const html = await res.text()
    expect(html).toContain('Your message was not sent.')
    expect(html).toContain('Valid email required')
    expect(html).not.toContain(hostile)
    expect(html).not.toContain('not-an-email')
    expect(send).not.toHaveBeenCalled()
  })

  it('answers a missing key honestly, as a page', async () => {
    const res = await POST(rawReq(formBody(VALID_BODY), { 'content-type': FORM }))
    expect(res.status).toBe(503)
    expect(await res.text()).toContain('Your message was not sent.')
  })

  it('takes a full-length message in a non-Latin script: percent-encoding triples its bytes', async () => {
    // 2,000 characters of a 3-byte script are 6 KB as UTF-8 and 18 KB percent-encoded — over
    // the JSON limit, inside the form limit. A real inquiry must never be refused for size.
    vi.stubEnv('RESEND_API_KEY', 'test_resend_key')
    const message = '鈦'.repeat(2000)
    const body = formBody({ ...VALID_BODY, message })
    expect(body.length).toBeGreaterThan(8_192)
    const res = await POST(rawReq(body, { 'content-type': FORM }))
    expect(res.status).toBe(200)
  })

  it('still refuses an oversized form body', async () => {
    const res = await POST(rawReq(formBody({ ...VALID_BODY, message: 'x'.repeat(40_000) }), { 'content-type': FORM }))
    expect(res.status).toBe(413)
    expect(res.headers.get('content-type')).toContain('text/html')
  })
})
