export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function validateName(value: string): string | null {
  const t = value.trim()
  if (t.length < 2 || t.length > 100) return 'Name must be 2-100 characters'
  return null
}

export function validateEmail(value: string): string | null {
  if (!EMAIL_REGEX.test(value)) return 'Valid email required'
  return null
}

// Strips control/line-break characters so the subject can't inject extra
// lines into the outbound notification email or pad it unboundedly.
export function sanitizeSubject(value: string): string {
  return value.replace(/[\r\n\t\x00-\x1f\x7f]/g, ' ').trim()
}

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
