import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

// Serverless-safe rate limiting.
// Production: set UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN in Vercel env vars
// to enable distributed rate limiting that works across all Lambda instances.
// Development / staging without those vars: falls back to in-memory (single-instance only).
const upstashRl =
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? new Ratelimit({
        redis: Redis.fromEnv(),
        limiter: Ratelimit.slidingWindow(5, '1 h'),
        prefix: 'hj:contact',
      })
    : null

// In-memory fallback — NOT multi-instance safe; acceptable for local dev only.
const rateLimitMap = new Map<string, { count: number; resetAt: number }>()
function isRateLimitedLocal(ip: string): boolean {
  const now = Date.now()
  const entry = rateLimitMap.get(ip)
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + 3600_000 })
    return false
  }
  if (entry.count >= 5) return true
  entry.count++
  return false
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  // 1. Rate limit by IP
  const ip = request.headers.get('x-forwarded-for') ?? 'unknown'

  let rateLimited: boolean
  if (upstashRl) {
    const { success } = await upstashRl.limit(ip)
    rateLimited = !success
  } else {
    rateLimited = isRateLimitedLocal(ip)
  }

  if (rateLimited) {
    return NextResponse.json(
      { error: 'Too many requests. Please try again later.' },
      { status: 429 },
    )
  }

  // 2. Parse and validate body
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { name, email, subject, message } = body as Record<string, unknown>

  if (
    !name ||
    typeof name !== 'string' ||
    name.trim().length < 2 ||
    name.trim().length > 100
  ) {
    return NextResponse.json(
      { error: 'Name must be 2-100 characters' },
      { status: 400 },
    )
  }

  if (
    !email ||
    typeof email !== 'string' ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  ) {
    return NextResponse.json(
      { error: 'Valid email required' },
      { status: 400 },
    )
  }

  if (!subject || typeof subject !== 'string' || !subject.trim()) {
    return NextResponse.json({ error: 'Subject required' }, { status: 400 })
  }

  if (
    !message ||
    typeof message !== 'string' ||
    message.trim().length < 10 ||
    message.trim().length > 2000
  ) {
    return NextResponse.json(
      { error: 'Message must be 10-2000 characters' },
      { status: 400 },
    )
  }

  // 3. Send via Resend (graceful degradation if API key absent)
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    console.warn('[contact] RESEND_API_KEY not set — inquiry received but not forwarded')
    // Do NOT log PII (email/name) here: GDPR data minimisation requires
    // personal data not to appear in logs accessible to all project members.
    console.info('[contact] Inquiry received')
    return NextResponse.json({ success: true })
  }

  try {
    const resend = new Resend(apiKey)
    await resend.emails.send({
      from: 'Healthy Jewelry Contact <contact@healthyjewelry.com>',
      to: ['hello@healthyjewelry.com'],
      replyTo: email,
      subject: `[Contact] ${subject} — ${name}`,
      text: `Name: ${name}\nEmail: ${email}\nSubject: ${subject}\n\nMessage:\n${message}`,
    })
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[contact] Resend error:', err)
    return NextResponse.json(
      { error: 'Failed to send message. Please email us directly.' },
      { status: 500 },
    )
  }
}
