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

export function validateSubject(value: string): string | null {
  if (!value.trim()) return 'Subject required'
  return null
}

export function validateMessage(value: string): string | null {
  const t = value.trim()
  if (t.length < 10 || t.length > 2000) return 'Message must be 10-2000 characters'
  return null
}
