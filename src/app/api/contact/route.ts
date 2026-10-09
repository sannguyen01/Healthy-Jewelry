import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import {
  validateName,
  validateEmail,
  validateSubject,
  validateMessage,
  sanitizeLine,
  sanitizeSubject,
} from '@/lib/utils/contactValidation'
import { CONTACT_EMAIL, SENDER_EMAIL, SITE_NAME } from '@/config/site'
import { createRateLimiter, clientIp } from '@/lib/utils/rateLimit'
import { readBoundedBody } from '@/lib/http/readBoundedBody'
import { renderGonePage } from '@/lib/http/goneResponse'

// Rate limiting lives in `@/lib/utils/rateLimit`, shared with every public
// route. It used to be two hand-rolled copies; the cart proxy had none at all,
// which made the un-audited route the softer target.
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

/**
 * A form post that arrives without JavaScript — the visitor submitted before the page
 * hydrated, or browses with scripts off. Its fields are percent-encoded, so the same 2,000
 * characters can take three bytes per UTF-8 byte: 32 KB covers the worst case of every field.
 */
const MAX_FORM_BODY_BYTES = 32_768

const FORM_CONTENT_TYPE = 'application/x-www-form-urlencoded'

/**
 * **A request from another site is refused before it costs anything.**
 *
 * The form is the only legitimate sender. Until 2026-10-04 this route parsed any body as JSON
 * whatever its content type, so a form on any other site could post `enctype="text/plain"`
 * whose body happened to be valid JSON, and every visitor's browser became a way to send this
 * inbox mail on a third party's behalf — under the visitor's own rate-limit budget. Browsers
 * say where a request comes from: `Sec-Fetch-Site` directly, and `Origin` on every POST. A
 * request carrying neither is not a browser on another site (curl, a monitor), and is left to
 * the rate limit as before. `Origin: null` is an opaque origin — a sandboxed frame, a
 * `data:` page — and is refused with the rest.
 */
function isCrossSite(request: NextRequest): boolean {
  if (request.headers.get('sec-fetch-site') === 'cross-site') return true
  const origin = request.headers.get('origin')
  if (origin === null) return false
  try {
    return new URL(origin).host !== request.headers.get('host')
  } catch {
    return true
  }
}

const HTML_ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
const escapeHtml = (text: string) => text.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c])

/**
 * The answer, in the form the request was made in. The scripted form reads JSON; a form
 * posted without JavaScript is a page navigation, so it gets a page. Its error text is one of
 * this route's own constants — nothing the visitor typed is ever echoed back into HTML.
 */
function replyFor(asPage: boolean) {
  return (status: number, error?: string): NextResponse => {
    if (!asPage) {
      return error === undefined
        ? NextResponse.json({ success: true })
        : NextResponse.json({ error }, { status })
    }
    const sent = error === undefined
    const html = renderGonePage({
      title: sent ? `Message sent — ${SITE_NAME}` : `Message not sent — ${SITE_NAME}`,
      heading: sent ? 'Message sent.' : 'Your message was not sent.',
      paragraphs: sent
        ? ['Thank you. We will reply to the address you gave.', '<a href="/">Return to the site</a>']
        : [
            escapeHtml(error),
            'Go back to the form — your browser keeps what you typed — or email us directly.',
            '<a href="/contact">Return to the contact page</a>',
          ],
    })
    return new NextResponse(html, {
      status,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'X-Robots-Tag': 'noindex, nofollow',
        'Cache-Control': 'no-store',
      },
    })
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const asForm = (request.headers.get('content-type') ?? '').toLowerCase().startsWith(FORM_CONTENT_TYPE)
  const reply = replyFor(asForm)

  // 0. Refuse another site's form before it reaches the limiter or the inbox.
  if (isCrossSite(request)) {
    return reply(403, `This form can only be sent from ${SITE_NAME}.`)
  }

  // 1. Rate limit by IP
  const rateLimited = await limiter.isLimited(clientIp(request.headers))

  if (rateLimited) {
    return reply(429, 'Too many requests. Please try again later.')
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
  const raw = await readBoundedBody(request, asForm ? MAX_FORM_BODY_BYTES : MAX_BODY_BYTES)
  if (!raw.ok) {
    return raw.reason === 'too-large'
      ? reply(413, 'Request body too large')
      : reply(400, 'Invalid request body')
  }

  let body: unknown
  if (asForm) {
    body = Object.fromEntries(new URLSearchParams(raw.text))
  } else {
    try {
      body = JSON.parse(raw.text)
    } catch {
      return reply(400, 'Invalid request body')
    }
  }

  // JSON.parse accepts `null`, numbers and arrays as well as objects. Destructuring `null`
  // throws, which answered a malformed request with a 500 instead of the 400 it is.
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return reply(400, 'Invalid request body')
  }
  const { name, email, subject, message } = body as Record<string, unknown>

  if (typeof name !== 'string') {
    return reply(400, 'Name must be 2-100 characters')
  }
  const nameError = validateName(name)
  if (nameError) return reply(400, nameError)

  if (typeof email !== 'string') {
    return reply(400, 'Valid email required')
  }
  const emailError = validateEmail(email)
  if (emailError) return reply(400, emailError)

  if (typeof subject !== 'string') {
    return reply(400, 'Subject required')
  }
  const subjectError = validateSubject(subject)
  if (subjectError) return reply(400, subjectError)

  if (typeof message !== 'string') {
    return reply(400, 'Message must be 10-2000 characters')
  }
  const messageError = validateMessage(message)
  if (messageError) return reply(400, messageError)

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
    return reply(503, 'Failed to send message. Please email us directly.')
  }

  // 4. Believe the provider's answer, not the absence of an exception.
  //
  // **`emails.send()` does not throw when Resend refuses a message.** resend@6
  // catches every non-2xx and *returns* `{ data: null, error }` — an unverified
  // sending domain, a revoked key, a 429, a validation failure. This route
  // awaited the call, ignored what it returned, and answered `{ success: true }`
  // to every one of them: the customer was told their message had arrived while
  // it went nowhere, which is the exact lie PR #32 removed for a *missing* key,
  // surviving one layer down for a *rejected* one. The `try` below only ever
  // caught the rare case the SDK does throw on, so the test that mocked a
  // rejection was testing a path production almost never takes, and the mock
  // that stood in for success (`{ id }` at the top level) is not the shape
  // resend@6 returns — so the defect could not have shown up in this suite.
  //
  // 502, not 500: the failure is upstream, and a gateway status says so. The
  // body is the same honest error ContactForm already renders beside a mailto
  // fallback, so nothing on the client changes.
  //
  // Logged as `{ name, statusCode }` and nothing else. Resend's `message` can
  // echo the addresses it was given — `to`, `replyTo`, which is the customer's
  // email — and Vercel function logs are readable by every project member. The
  // name is an enumerated code (`validation_error`, `rate_limit_exceeded`, …),
  // which is what an operator needs and all an operator needs.
  try {
    const cleanSubject = sanitizeSubject(subject)
    const cleanName = sanitizeLine(name)
    const resend = new Resend(apiKey)
    const { data, error } = await resend.emails.send({
      from: `${SITE_NAME} Contact <${SENDER_EMAIL}>`,
      to: [CONTACT_EMAIL],
      replyTo: email,
      subject: `[Contact] ${cleanSubject} — ${cleanName}`,
      text: `Name: ${cleanName}\nEmail: ${email}\nSubject: ${cleanSubject}\n\nMessage:\n${message}`,
    })

    if (error) {
      console.error('[contact] Resend refused the message', {
        name: error.name,
        statusCode: error.statusCode,
      })
      return reply(502, 'Failed to send message. Please email us directly.')
    }

    // Neither an error nor a message id is not a success. The SDK's types allow
    // `{ data: null, error: null }`, and "we could not tell" has to mean the
    // customer is told to email us — the same failure direction the consent gate
    // takes. An accepted send always carries the id Resend will report it under.
    if (!data?.id) {
      console.error('[contact] Resend returned no message id and no error', {
        name: 'missing_message_id',
        statusCode: null,
      })
      return reply(502, 'Failed to send message. Please email us directly.')
    }

    return reply(200)
  } catch (err) {
    // The error's class name only. A thrown error's message and stack are free
    // text from code we do not own, and this is the one route whose inputs are a
    // person's name, address and words.
    console.error('[contact] Resend threw', {
      name: err instanceof Error ? err.name : typeof err,
    })
    return reply(500, 'Failed to send message. Please email us directly.')
  }
}
