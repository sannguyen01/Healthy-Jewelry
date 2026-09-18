import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import {
  validateName,
  validateEmail,
  validateSubject,
  validateMessage,
  sanitizeSubject,
} from '@/lib/utils/contactValidation'
import { CONTACT_EMAIL, SENDER_EMAIL } from '@/config/site'
import { createRateLimiter, clientIp } from '@/lib/utils/rateLimit'
import { readBoundedBody } from '@/lib/http/readBoundedBody'

// Rate limiting now lives in `@/lib/utils/rateLimit`, shared with
// `/api/shopify`. It used to be two hand-rolled copies; the Shopify proxy had
// none at all, which made the un-audited route the softer target.
/** See the note at the parse site for how this number was chosen. */
const MAX_BODY_BYTES = 8_192

// `onError: 'deny'`, and the only route here that takes it. This one sends email
// through a paid API, so an unmetered contact form costs money and reputation rather
// than quota. A limiter that cannot be consulted refuses rather than guesses — and
// ContactForm already renders a "try emailing us directly" fallback on any non-2xx,
// so failing closed costs the customer a route, not the message.
const limiter = createRateLimiter({
  limit: 5,
  window: '1 h',
  prefix: 'hj:contact',
  onError: 'deny',
})

export async function POST(request: NextRequest): Promise<NextResponse> {
  // 1. Rate limit by IP
  const rateLimited = await limiter.isLimited(clientIp(request.headers))

  if (rateLimited) {
    return NextResponse.json(
      { error: 'Too many requests. Please try again later.' },
      { status: 429 }
    )
  }

  // 2. Parse and validate body
  //
  // This route had **no size guard at all** until 2026-09-15, while the two that
  // did were both measuring UTF-16 code units against a constant named for
  // bytes. It is the one of the three that reaches a paid third party, so it is
  // the one where an unbounded body was least affordable.
  //
  // 8 KB: validateMessage caps the message at 2,000 characters, which at 4 bytes
  // per character in the worst case is 8,000 — plus the other three fields and
  // the JSON envelope. Generous enough never to refuse a real inquiry, small
  // enough that nothing can be buffered here at any scale worth having.
  const raw = await readBoundedBody(request, MAX_BODY_BYTES)
  if (!raw.ok) {
    return raw.reason === 'too-large'
      ? NextResponse.json({ error: 'Request body too large' }, { status: 413 })
      : NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  let body: unknown
  try {
    body = JSON.parse(raw.text)
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

  // 3. Send via Resend — a missing key is a misconfiguration, not a reason to
  // tell the customer their message arrived. `{ success: true }` here used to
  // mean "the form worked" while the message was silently dropped: nothing
  // was sent, nothing was queued, and the customer had no way to know to
  // follow up by email. ContactForm already renders a "try emailing us
  // directly" fallback on any non-2xx response, so failing honestly costs
  // nothing in UX and stops a customer inquiry from vanishing unnoticed.
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    console.error('[contact] RESEND_API_KEY not set — inquiry could not be forwarded')
    // Do NOT log PII (email/name) here: GDPR data minimisation requires
    // personal data not to appear in logs accessible to all project members.
    return NextResponse.json(
      { error: 'Failed to send message. Please email us directly.' },
      { status: 503 }
    )
  }

  try {
    const cleanSubject = sanitizeSubject(subject)
    const resend = new Resend(apiKey)
    await resend.emails.send({
      from: `Healthy Jewelry Contact <${SENDER_EMAIL}>`,
      to: [CONTACT_EMAIL],
      replyTo: email,
      subject: `[Contact] ${cleanSubject} — ${name}`,
      text: `Name: ${name}\nEmail: ${email}\nSubject: ${cleanSubject}\n\nMessage:\n${message}`,
    })
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[contact] Resend error:', err)
    return NextResponse.json(
      { error: 'Failed to send message. Please email us directly.' },
      { status: 500 }
    )
  }
}
