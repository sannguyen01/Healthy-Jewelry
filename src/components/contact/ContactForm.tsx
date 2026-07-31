'use client'

import { useState } from 'react'
import {
  validateName,
  validateEmail,
  validateSubject,
  validateMessage,
} from '@/lib/utils/contactValidation'

type FormStatus = 'idle' | 'sending' | 'sent' | 'error'

interface FormFields {
  name: string
  email: string
  subject: string
  message: string
}

type FieldErrors = Partial<Record<keyof FormFields, string>>

const SUBJECTS = ['General inquiry', 'Product question', 'Order support', 'Custom order'] as const

const FIELD_VALIDATORS: Record<keyof FormFields, (value: string) => string | null> = {
  name: validateName,
  email: validateEmail,
  subject: validateSubject,
  message: validateMessage,
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '14px 16px',
  border: '1px solid var(--ash)',
  backgroundColor: 'transparent',
  fontFamily: 'var(--font-body)',
  fontSize: 'var(--text-base)',
  color: 'var(--ink)',
  outline: 'none',
  borderRadius: 0,
  appearance: 'none',
  boxSizing: 'border-box',
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontFamily: 'var(--font-ui)',
  fontSize: 'var(--text-xs)',
  letterSpacing: '0.14em',
  textTransform: 'uppercase',
  color: 'var(--graphite)',
  marginBottom: '8px',
}

const fieldErrorStyle: React.CSSProperties = {
  fontFamily: 'var(--font-ui)',
  fontSize: 'var(--text-xs)',
  color: '#B3261E',
  marginTop: '6px',
}

const DEFAULT_ERROR_MESSAGE = 'Something went wrong. Please try again.'

export function ContactForm() {
  const [fields, setFields] = useState<FormFields>({
    name: '',
    email: '',
    subject: SUBJECTS[0],
    message: '',
  })
  const [status, setStatus] = useState<FormStatus>('idle')
  const [focusedField, setFocusedField] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [errorMessage, setErrorMessage] = useState<string>(DEFAULT_ERROR_MESSAGE)

  function handleChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) {
    setFields((prev) => ({ ...prev, [e.target.name]: e.target.value }))
  }

  function handleBlur(name: keyof FormFields) {
    setFocusedField(null)
    const error = FIELD_VALIDATORS[name](fields[name])
    setFieldErrors((prev) => ({ ...prev, [name]: error ?? undefined }))
  }

  function getFocusStyle(name: string): React.CSSProperties {
    return focusedField === name ? { borderColor: 'var(--ink)' } : {}
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    const nextErrors: FieldErrors = {}
    for (const key of Object.keys(FIELD_VALIDATORS) as (keyof FormFields)[]) {
      const error = FIELD_VALIDATORS[key](fields[key])
      if (error) nextErrors[key] = error
    }
    setFieldErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) {
      return
    }

    setStatus('sending')
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fields),
      })
      if (!res.ok) {
        // Surface the server's specific reason (validation, rate limit, etc.)
        const data = await res.json().catch(() => ({}))
        setErrorMessage((data as { error?: string }).error ?? DEFAULT_ERROR_MESSAGE)
        setStatus('error')
        return
      }
      setStatus('sent')
    } catch {
      // A true network/exception failure has no server-authored message to
      // show — a generic fallback is more useful than a raw fetch error.
      setErrorMessage(DEFAULT_ERROR_MESSAGE)
      setStatus('error')
    }
  }

  if (status === 'sent') {
    return (
      <div
        // The form is replaced wholesale on success. Without a live region a
        // screen-reader user gets no confirmation that anything happened.
        role="status"
        aria-live="polite"
        style={{
          padding: '40px 0',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
        }}
      >
        <span
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'var(--text-xl)',
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            color: 'var(--sage)',
          }}
        >
          ✓ Message sent.
        </span>
        <p
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: 'var(--text-base)',
            color: 'var(--graphite)',
            lineHeight: 1.7,
            fontWeight: 300,
            margin: 0,
          }}
        >
          {"We'll be in touch within 24 hours."}
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {/* Name */}
        <div>
          <label htmlFor="cf-name" style={labelStyle}>
            Name
          </label>
          <input
            id="cf-name"
            name="name"
            type="text"
            required
            value={fields.name}
            onChange={handleChange}
            onFocus={() => setFocusedField('name')}
            onBlur={() => handleBlur('name')}
            style={{ ...inputStyle, ...getFocusStyle('name') }}
            placeholder="Your name"
            aria-invalid={Boolean(fieldErrors.name)}
            aria-describedby={fieldErrors.name ? 'cf-name-error' : undefined}
          />
          {fieldErrors.name && (
            <p id="cf-name-error" style={fieldErrorStyle}>
              {fieldErrors.name}
            </p>
          )}
        </div>

        {/* Email */}
        <div>
          <label htmlFor="cf-email" style={labelStyle}>
            Email
          </label>
          <input
            id="cf-email"
            name="email"
            type="email"
            required
            value={fields.email}
            onChange={handleChange}
            onFocus={() => setFocusedField('email')}
            onBlur={() => handleBlur('email')}
            style={{ ...inputStyle, ...getFocusStyle('email') }}
            placeholder="your@email.com"
            aria-invalid={Boolean(fieldErrors.email)}
            aria-describedby={fieldErrors.email ? 'cf-email-error' : undefined}
          />
          {fieldErrors.email && (
            <p id="cf-email-error" style={fieldErrorStyle}>
              {fieldErrors.email}
            </p>
          )}
        </div>

        {/* Subject */}
        <div>
          <label htmlFor="cf-subject" style={labelStyle}>
            Subject
          </label>
          <select
            id="cf-subject"
            name="subject"
            value={fields.subject}
            onChange={handleChange}
            onFocus={() => setFocusedField('subject')}
            onBlur={() => handleBlur('subject')}
            style={{ ...inputStyle, ...getFocusStyle('subject'), cursor: 'pointer' }}
          >
            {SUBJECTS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          {fieldErrors.subject && <p style={fieldErrorStyle}>{fieldErrors.subject}</p>}
        </div>

        {/* Message */}
        <div>
          <label htmlFor="cf-message" style={labelStyle}>
            Message
          </label>
          <textarea
            id="cf-message"
            name="message"
            required
            value={fields.message}
            onChange={handleChange}
            onFocus={() => setFocusedField('message')}
            onBlur={() => handleBlur('message')}
            style={{
              ...inputStyle,
              ...getFocusStyle('message'),
              minHeight: '140px',
              resize: 'vertical',
            }}
            placeholder="Tell us how we can help…"
            aria-invalid={Boolean(fieldErrors.message)}
            aria-describedby={fieldErrors.message ? 'cf-message-error' : undefined}
          />
          {fieldErrors.message && (
            <p id="cf-message-error" style={fieldErrorStyle}>
              {fieldErrors.message}
            </p>
          )}
        </div>

        {/* Error state */}
        {status === 'error' && (
          <p
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: 'var(--text-sm)',
              color: 'var(--ink)',
              opacity: 0.7,
              margin: 0,
            }}
          >
            {errorMessage} Try emailing us directly at{' '}
            <a
              href="mailto:hello@healthyjewelry.com"
              style={{ color: 'var(--ink)', textDecoration: 'underline' }}
            >
              hello@healthyjewelry.com
            </a>
          </p>
        )}

        <button
          type="submit"
          disabled={status === 'sending'}
          className="btn-ghost"
          style={{ width: '100%', opacity: status === 'sending' ? 0.6 : 1 }}
        >
          {status === 'sending' ? 'Sending…' : 'Send Message'}
        </button>
      </div>
    </form>
  )
}

export default ContactForm
