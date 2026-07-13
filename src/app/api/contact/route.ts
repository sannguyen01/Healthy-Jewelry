import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'
import {
  validateName,
  validateEmail,
  validateSubject,
  validateMessage,
} from '@/lib/utils/contactValidation'

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
  // Prune expired entries on each call to prevent unbounded map growth.
  for (const [key, val] of rateLimitMap) {
    if (now > val.resetAt) rateLimitMap.delete(key)
  }
  const entry = rateLimitMap.get(ip)
  if (!entry) {
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

  if (typeof name !== 'string') {
    return NextResponse.json({ error: 'Name must be 2-100 characters' }, { status: 400 })
  }
  const nameError = validateName(name)
  if (nameError) return NextResponse.json({ error: nameError }, { status: 400 })

  if (typeof email !== 'string') {
    return NextResponse.json({ error: 'Valid email required' }, { status: 400 })
  }
  const emailError = validateEmail(email)
  if (emailError) return NextResponse.json({ error: emailError }, { status: 400 })

  if (typeof subject !== 'string') {
    return NextResponse.json({ error: 'Subject required' }, { status: 400 })
  }
  const subjectError = validateSubject(subject)
  if (subjectError) return NextResponse.json({ error: subjectError }, { status: 400 })

  if (typeof message !== 'string') {
    return NextResponse.json({ error: 'Message must be 10-2000 characters' }, { status: 400 })
  }
  const messageError = validateMessage(message)
  if (messageError) return NextResponse.json({ error: messageError }, { status: 400 })

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
