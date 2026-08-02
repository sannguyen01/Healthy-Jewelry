import type { CheckoutError } from '@/store/cart'

/**
 * What a customer is told when checkout cannot start.
 *
 * The site previously showed "Connect your Shopify store to enable checkout." —
 * an instruction addressed to a developer, displayed to a shopper, after a
 * spinner that never resolved. Nobody reading it could tell whether their order
 * had been placed.
 *
 * Two rules here. Never expose the cause: which of these failed is our problem,
 * and a shopper cannot act on "the storefront token was rejected". And never
 * leave a dead end: every message says the cart is safe and offers a way
 * through, matching how `ContactForm` handles its own failures so the two read
 * as one system.
 */

/** The address already used as the contact-form fallback. */
export const SUPPORT_EMAIL = 'hello@healthyjewelry.com'

export interface CheckoutMessage {
  /** Short headline. */
  title: string
  /** One or two sentences: what happened, and that nothing was lost. */
  body: string
  /** Whether retrying could plausibly succeed. */
  retryable: boolean
}

const MESSAGES: Record<CheckoutError, CheckoutMessage> = {
  // Transient by nature — a retry is genuinely worth offering first.
  network: {
    title: "We couldn't reach checkout",
    body: "Your connection dropped before we could start your order. Nothing has been charged and your bag is exactly as you left it.",
    retryable: true,
  },
  // Shopify answered and refused. Often stock or a variant change, so a retry
  // can succeed once the bag is adjusted — but it may not.
  'shopify-error': {
    title: "We couldn't start your order",
    body: 'Something went wrong setting up your checkout. Nothing has been charged and your bag is saved. If it happens again, email us and we will complete the order for you.',
    retryable: true,
  },
  // Configuration faults. Retrying cannot fix these, so promising otherwise
  // would waste the customer's time — send them somewhere a human answers.
  'not-configured': {
    title: 'Online checkout is temporarily unavailable',
    body: 'We are unable to take orders through the site right now. Your bag is saved. Email us and we will take your order directly.',
    retryable: false,
  },
  'placeholder-catalog': {
    title: 'Online checkout is temporarily unavailable',
    body: 'We are unable to take orders through the site right now. Your bag is saved. Email us and we will take your order directly.',
    retryable: false,
  },
}

export function checkoutMessage(error: CheckoutError): CheckoutMessage {
  return MESSAGES[error]
}

/** A mailto with the bag summarised, so support can act without a back-and-forth. */
export function supportMailto(itemSummary?: string): string {
  const subject = encodeURIComponent('Order enquiry — checkout unavailable')
  const body = itemSummary
    ? encodeURIComponent(`I tried to order the following but checkout was unavailable:\n\n${itemSummary}\n\n`)
    : ''
  return `mailto:${SUPPORT_EMAIL}?subject=${subject}${body ? `&body=${body}` : ''}`
}
