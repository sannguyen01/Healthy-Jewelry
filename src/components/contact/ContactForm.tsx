'use client'

import { useState } from 'react'

type FormStatus = 'idle' | 'sending' | 'sent' | 'error'

interface FormFields {
  name: string
  email: string
  subject: string
  message: string
}

const SUBJECTS = [
  'General inquiry',
  'Product question',
  'Order support',
  'Custom order',
] as const

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

export function ContactForm() {
  const [fields, setFields] = useState<FormFields>({
    name: '',
    email: '',
    subject: SUBJECTS[0],
    message: '',
  })
  const [status, setStatus] = useState<FormStatus>('idle')
  const [focusedField, setFocusedField] = useState<string | null>(null)

  function handleChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) {
    setFields((prev) => ({ ...prev, [e.target.name]: e.target.value }))
  }

  function getFocusStyle(name: string): React.CSSProperties {
    return focusedField === name ? { borderColor: 'var(--ink)' } : {}
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setStatus('sending')
    try {
      // Simulate send — replace with POST /api/contact when Resend is wired
      await new Promise((resolve) => setTimeout(resolve, 800))
      console.log('Contact form submission:', fields)
      setStatus('sent')
    } catch {
      setStatus('error')
    }
  }

  if (status === 'sent') {
    return (
      <div
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
          <label
            htmlFor="cf-name"
            style={{
              display: 'block',
              fontFamily: 'var(--font-ui)',
              fontSize: 'var(--text-xs)',
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: 'var(--graphite)',
              marginBottom: '8px',
            }}
          >
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
            onBlur={() => setFocusedField(null)}
            style={{ ...inputStyle, ...getFocusStyle('name') }}
            placeholder="Your name"
          />
        </div>

        {/* Email */}
        <div>
          <label
            htmlFor="cf-email"
            style={{
              display: 'block',
              fontFamily: 'var(--font-ui)',
              fontSize: 'var(--text-xs)',
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: 'var(--graphite)',
              marginBottom: '8px',
            }}
          >
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
            onBlur={() => setFocusedField(null)}
            style={{ ...inputStyle, ...getFocusStyle('email') }}
            placeholder="your@email.com"
          />
        </div>

        {/* Subject */}
        <div>
          <label
            htmlFor="cf-subject"
            style={{
              display: 'block',
              fontFamily: 'var(--font-ui)',
              fontSize: 'var(--text-xs)',
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: 'var(--graphite)',
              marginBottom: '8px',
            }}
          >
            Subject
          </label>
          <select
            id="cf-subject"
            name="subject"
            value={fields.subject}
            onChange={handleChange}
            onFocus={() => setFocusedField('subject')}
            onBlur={() => setFocusedField(null)}
            style={{ ...inputStyle, ...getFocusStyle('subject'), cursor: 'pointer' }}
          >
            {SUBJECTS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        {/* Message */}
        <div>
          <label
            htmlFor="cf-message"
            style={{
              display: 'block',
              fontFamily: 'var(--font-ui)',
              fontSize: 'var(--text-xs)',
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: 'var(--graphite)',
              marginBottom: '8px',
            }}
          >
            Message
          </label>
          <textarea
            id="cf-message"
            name="message"
            required
            value={fields.message}
            onChange={handleChange}
            onFocus={() => setFocusedField('message')}
            onBlur={() => setFocusedField(null)}
            style={{
              ...inputStyle,
              ...getFocusStyle('message'),
              minHeight: '140px',
              resize: 'vertical',
            }}
            placeholder="Tell us how we can help…"
          />
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
            Something went wrong. Try emailing us directly at{' '}
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
