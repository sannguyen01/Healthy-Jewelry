// Healthy Jewelry — reading one customer's own data
//
// Server-only.

import { cookies } from 'next/headers'
import { discoverEndpoints, isCustomerAccountsConfigured, customerAccountConfig } from './config'
import { refreshSession } from './oauth'
import {
  openSession,
  sealSession,
  needsRefresh,
  sessionCookieOptions,
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  type CustomerSession,
} from './session'

/**
 * The current customer's session, refreshed if it is about to expire.
 *
 * Returns `null` for every "not signed in" case — unconfigured deployment, no
 * cookie, tampered cookie, rotated secret, or a refresh that Shopify refused.
 * One return value for all of them, because the caller's response is the same:
 * show the signed-out state. Distinguishing them would only create branches that
 * render identically.
 */
export async function getCustomerSession(): Promise<CustomerSession | null> {
  if (!isCustomerAccountsConfigured()) return null

  const store = await cookies()
  const session = openSession(store.get(SESSION_COOKIE)?.value, customerAccountConfig.sessionSecret)
  if (!session) return null
  if (!needsRefresh(session)) return session

  try {
    const refreshed = await refreshSession(session.refreshToken)
    // Writing a cookie from a Server Component throws in Next; this is called
    // from both, so the write is attempted and its failure tolerated. The
    // refreshed token is still returned and used for this request either way —
    // the customer sees their page, and the cookie is rewritten by the next
    // route handler that runs.
    try {
      store.set(
        SESSION_COOKIE,
        sealSession(refreshed, customerAccountConfig.sessionSecret),
        sessionCookieOptions(SESSION_MAX_AGE_SECONDS)
      )
    } catch {
      /* Server Component render — read-only cookies. Expected. */
    }
    return refreshed
  } catch {
    // A refresh token Shopify no longer accepts means the session is over. Not
    // an error to surface: it is what an expired login looks like.
    return null
  }
}

export class CustomerApiError extends Error {
  constructor(
    message: string,
    public readonly status?: number
  ) {
    super(message)
    this.name = 'CustomerApiError'
  }
}

/**
 * Query the Customer Account API as the signed-in customer.
 *
 * `no-store`, always. This is one person's orders and addresses; a cached
 * response is a response that can be served to somebody else, and no
 * revalidation window is worth that risk.
 */
export async function customerFetch<T>(
  query: string,
  variables: Record<string, unknown> = {},
  session?: CustomerSession | null
): Promise<T> {
  const active = session ?? (await getCustomerSession())
  if (!active) throw new CustomerApiError('Not signed in', 401)

  const { graphql } = await discoverEndpoints()

  const response = await fetch(graphql, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: active.accessToken,
    },
    body: JSON.stringify({ query, variables }),
    cache: 'no-store',
  })

  if (!response.ok) {
    throw new CustomerApiError(`Customer Account API returned ${response.status}`, response.status)
  }

  const json = (await response.json()) as { data?: T; errors?: { message: string }[] }
  if (json.errors?.length) {
    throw new CustomerApiError(json.errors.map((e) => e.message).join('; '))
  }
  if (!json.data) throw new CustomerApiError('Customer Account API returned no data')

  return json.data
}

// ── Queries ────────────────────────────────────────────────────────────────

export const CUSTOMER_OVERVIEW = /* GraphQL */ `
  query CustomerOverview($first: Int!) {
    customer {
      firstName
      lastName
      emailAddress {
        emailAddress
      }
      defaultAddress {
        formatted
      }
      orders(first: $first, sortKey: PROCESSED_AT, reverse: true) {
        edges {
          node {
            id
            name
            processedAt
            financialStatus
            fulfillments(first: 1) {
              edges {
                node {
                  status
                }
              }
            }
            totalPrice {
              amount
              currencyCode
            }
            lineItems(first: 5) {
              edges {
                node {
                  title
                  quantity
                }
              }
            }
          }
        }
      }
    }
  }
`

export interface CustomerOverview {
  customer: {
    firstName: string | null
    lastName: string | null
    emailAddress: { emailAddress: string } | null
    defaultAddress: { formatted: string[] } | null
    orders: {
      edges: {
        node: {
          id: string
          name: string
          processedAt: string
          financialStatus: string | null
          fulfillments: { edges: { node: { status: string } }[] }
          totalPrice: { amount: string; currencyCode: string }
          lineItems: { edges: { node: { title: string; quantity: number } }[] }
        }
      }[]
    }
  } | null
}
