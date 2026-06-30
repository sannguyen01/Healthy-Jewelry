import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ContactForm } from '@/components/contact/ContactForm'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

describe('ContactForm', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  // ── Rendering ────────────────────────────────────────────────────────────

  it('renders all four form fields', () => {
    render(<ContactForm />)
    expect(screen.getByLabelText(/^name$/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/^email$/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/^subject$/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/^message$/i)).toBeInTheDocument()
  })

  it('renders the submit button', () => {
    render(<ContactForm />)
    expect(screen.getByRole('button', { name: /send message/i })).toBeInTheDocument()
  })

  it('subject dropdown has all four options', () => {
    render(<ContactForm />)
    const select = screen.getByLabelText(/^subject$/i) as HTMLSelectElement
    const optionTexts = Array.from(select.options).map((o) => o.text)
    expect(optionTexts).toContain('General inquiry')
    expect(optionTexts).toContain('Product question')
    expect(optionTexts).toContain('Order support')
    expect(optionTexts).toContain('Custom order')
  })

  it('subject defaults to "General inquiry"', () => {
    render(<ContactForm />)
    const select = screen.getByLabelText(/^subject$/i) as HTMLSelectElement
    expect(select.value).toBe('General inquiry')
  })

  // ── User input ───────────────────────────────────────────────────────────

  it('updates name field on typing', async () => {
    const user = userEvent.setup()
    render(<ContactForm />)
    const input = screen.getByLabelText(/^name$/i)
    await user.type(input, 'San Nguyen')
    expect(input).toHaveValue('San Nguyen')
  })

  it('updates email field on typing', async () => {
    const user = userEvent.setup()
    render(<ContactForm />)
    const input = screen.getByLabelText(/^email$/i)
    await user.type(input, 'san@example.com')
    expect(input).toHaveValue('san@example.com')
  })

  it('updates message field on typing', async () => {
    const user = userEvent.setup()
    render(<ContactForm />)
    const input = screen.getByLabelText(/^message$/i)
    await user.type(input, 'Hello there')
    expect(input).toHaveValue('Hello there')
  })

  it('changes subject via dropdown', async () => {
    const user = userEvent.setup()
    render(<ContactForm />)
    const select = screen.getByLabelText(/^subject$/i)
    await user.selectOptions(select, 'Custom order')
    expect(select).toHaveValue('Custom order')
  })

  // ── Submission states ────────────────────────────────────────────────────

  it('shows "Sending…" while request is in-flight', async () => {
    mockFetch.mockImplementation(() => new Promise(() => {}))
    const user = userEvent.setup()
    render(<ContactForm />)

    await user.type(screen.getByLabelText(/^name$/i), 'San')
    await user.type(screen.getByLabelText(/^email$/i), 'san@example.com')
    await user.type(screen.getByLabelText(/^message$/i), 'A test message.')

    await user.click(screen.getByRole('button', { name: /send message/i }))

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /sending/i })).toBeInTheDocument(),
    )
  })

  it('disables submit button while sending', async () => {
    mockFetch.mockImplementation(() => new Promise(() => {}))
    const user = userEvent.setup()
    render(<ContactForm />)

    await user.type(screen.getByLabelText(/^name$/i), 'San')
    await user.type(screen.getByLabelText(/^email$/i), 'san@example.com')
    await user.type(screen.getByLabelText(/^message$/i), 'A test message.')

    await user.click(screen.getByRole('button', { name: /send message/i }))

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /sending/i })).toBeDisabled(),
    )
  })

  it('shows success state after 200 response', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    } as Response)

    const user = userEvent.setup()
    render(<ContactForm />)

    await user.type(screen.getByLabelText(/^name$/i), 'San')
    await user.type(screen.getByLabelText(/^email$/i), 'san@example.com')
    await user.type(screen.getByLabelText(/^message$/i), 'Hello, a question about titanium.')

    await user.click(screen.getByRole('button', { name: /send message/i }))

    await waitFor(() =>
      expect(screen.getByText(/message sent/i)).toBeInTheDocument(),
    )
  })

  it('success state hides the submit form', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    } as Response)

    const user = userEvent.setup()
    render(<ContactForm />)

    await user.type(screen.getByLabelText(/^name$/i), 'San')
    await user.type(screen.getByLabelText(/^email$/i), 'san@example.com')
    await user.type(screen.getByLabelText(/^message$/i), 'Hello, a question about titanium.')

    await user.click(screen.getByRole('button', { name: /send message/i }))

    await waitFor(() => expect(screen.queryByRole('button', { name: /send message/i })).not.toBeInTheDocument())
  })

  it('success state mentions 24 hour reply time', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    } as Response)

    const user = userEvent.setup()
    render(<ContactForm />)

    await user.type(screen.getByLabelText(/^name$/i), 'San')
    await user.type(screen.getByLabelText(/^email$/i), 'san@example.com')
    await user.type(screen.getByLabelText(/^message$/i), 'Hello, a question about titanium.')

    await user.click(screen.getByRole('button', { name: /send message/i }))

    await waitFor(() =>
      expect(screen.getByText(/24 hours/i)).toBeInTheDocument(),
    )
  })

  it('shows error state on non-ok response', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Failed to send' }),
    } as Response)

    const user = userEvent.setup()
    render(<ContactForm />)

    await user.type(screen.getByLabelText(/^name$/i), 'San')
    await user.type(screen.getByLabelText(/^email$/i), 'san@example.com')
    await user.type(screen.getByLabelText(/^message$/i), 'Hello, a question.')

    await user.click(screen.getByRole('button', { name: /send message/i }))

    await waitFor(() =>
      expect(screen.getByText(/something went wrong/i)).toBeInTheDocument(),
    )
  })

  it('shows error state on network failure', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'))

    const user = userEvent.setup()
    render(<ContactForm />)

    await user.type(screen.getByLabelText(/^name$/i), 'San')
    await user.type(screen.getByLabelText(/^email$/i), 'san@example.com')
    await user.type(screen.getByLabelText(/^message$/i), 'Hello, a question.')

    await user.click(screen.getByRole('button', { name: /send message/i }))

    await waitFor(() =>
      expect(screen.getByText(/something went wrong/i)).toBeInTheDocument(),
    )
  })

  it('error state shows direct email link', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'))

    const user = userEvent.setup()
    render(<ContactForm />)

    await user.type(screen.getByLabelText(/^name$/i), 'San')
    await user.type(screen.getByLabelText(/^email$/i), 'san@example.com')
    await user.type(screen.getByLabelText(/^message$/i), 'Hello, a question.')

    await user.click(screen.getByRole('button', { name: /send message/i }))

    await waitFor(() => {
      const link = screen.getByRole('link', { name: /hello@healthyjewelry\.com/i })
      expect(link).toBeInTheDocument()
      expect(link).toHaveAttribute('href', 'mailto:hello@healthyjewelry.com')
    })
  })

  it('submit button returns to idle label after error', async () => {
    mockFetch.mockRejectedValue(new Error('fail'))

    const user = userEvent.setup()
    render(<ContactForm />)

    await user.type(screen.getByLabelText(/^name$/i), 'San')
    await user.type(screen.getByLabelText(/^email$/i), 'san@example.com')
    await user.type(screen.getByLabelText(/^message$/i), 'Hello, a question.')

    await user.click(screen.getByRole('button', { name: /send message/i }))

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /send message/i })).not.toBeDisabled(),
    )
  })
})
