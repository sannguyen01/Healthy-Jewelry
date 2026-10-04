export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// The name is validated as the line it will become. It is written into the notification's
// subject header and onto its own line of the body, so a line break in it could add a header
// or forge a "Email:" line beneath it; the length rule applies to what is actually sent.
export function validateName(value: string): string | null {
  const t = sanitizeLine(value)
  if (t.length < 2 || t.length > 100) return 'Name must be 2-100 characters'
  return null
}

export function validateEmail(value: string): string | null {
  if (!EMAIL_REGEX.test(value)) return 'Valid email required'
  return null
}

// Strips control/line-break characters so a field written into a header or onto one line
// of the outbound notification can't inject extra lines or pad it unboundedly. Applied to
// the subject and the sender's name alike: until 2026-10-04 only the subject was cleaned,
// and the name, which sits in the same subject header, went through as typed.
export function sanitizeLine(value: string): string {
  return value.replace(/[\r\n\t\x00-\x1f\x7f\u2028\u2029]/g, ' ').trim()
}

/** The subject's name for {@link sanitizeLine}, kept for its callers. */
export const sanitizeSubject = sanitizeLine

export function validateSubject(value: string): string | null {
  const t = sanitizeSubject(value)
  if (!t) return 'Subject required'
  if (t.length > 200) return 'Subject must be 200 characters or fewer'
  return null
}

export function validateMessage(value: string): string | null {
  const t = value.trim()
  if (t.length < 10 || t.length > 2000) return 'Message must be 10-2000 characters'
  return null
}
