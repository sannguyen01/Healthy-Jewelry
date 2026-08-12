import type { Metadata } from 'next'
import { Nav } from '@/components/layout/Nav'
import { Footer } from '@/components/layout/Footer'
import { CartDrawer } from '@/components/layout/CartDrawer'
import { PageHeader } from '@/components/ui/PageHeader'
import { isCustomerAccountsConfigured } from '@/lib/shopify/customer/config'
import {
  customerFetch,
  getCustomerSession,
  CUSTOMER_OVERVIEW,
  type CustomerOverview,
} from '@/lib/shopify/customer/client'
import { formatPrice, type CurrencyCode } from '@/lib/utils/formatPrice'
import { AccountActions } from './AccountActions'

export const metadata: Metadata = {
  title: 'Your Account',
  description: 'Your orders and details.',
  // One customer's own data. Nothing here should ever be indexed, and the
  // signed-out state is not worth indexing either.
  robots: { index: false, follow: false },
}

// Never prerendered and never cached: this is one person's orders, and a cached
// response is one that can be served to somebody else.
export const dynamic = 'force-dynamic'

const STATUS_MESSAGES: Record<string, string> = {
  failed: 'We could not complete that sign-in. Please try again.',
  cancelled: 'Sign-in was cancelled. Nothing has changed.',
  unavailable: 'Accounts are not available on this site yet.',
}

interface AccountPageProps {
  searchParams: Promise<{ status?: string }>
}

export default async function AccountPage({ searchParams }: AccountPageProps) {
  const { status } = await searchParams
  const configured = isCustomerAccountsConfigured()
  const session = configured ? await getCustomerSession() : null

  let overview: CustomerOverview['customer'] = null
  let loadFailed = false

  if (session) {
    try {
      const data = await customerFetch<CustomerOverview>(CUSTOMER_OVERVIEW, { first: 20 }, session)
      overview = data.customer
    } catch (err) {
      // A signed-in customer whose data will not load must not see a stack
      // trace. Same rule as `checkoutMessages.ts`: never expose the cause, never
      // leave a dead end.
      console.error('[account] customer query failed', err)
      loadFailed = true
    }
  }

  const orders = overview?.orders.edges.map((e) => e.node) ?? []
  const notice = status ? STATUS_MESSAGES[status] : undefined

  return (
    <>
      <Nav />
      <main style={{ paddingTop: '64px', minHeight: '70vh' }}>
        <PageHeader
          variant="compact"
          eyebrow="Account"
          title={overview?.firstName ? `Hello, ${overview.firstName}` : 'Your Account'}
        />

        <section
          style={{
            padding: '0 var(--space-gutter) var(--space-section)',
            maxWidth: '860px',
          }}
        >
          {notice && (
            <p
              role="status"
              style={{
                fontFamily: 'var(--font-body)',
                fontWeight: 300,
                fontSize: 'var(--text-sm)',
                color: 'var(--graphite)',
                border: '1px solid var(--ash)',
                padding: '14px 16px',
                marginBottom: '28px',
              }}
            >
              {notice}
            </p>
          )}

          {!configured ? (
            <Prose>
              Accounts are not enabled on this store yet. You do not need one to order —
              checkout works without signing in, and Shopify emails your receipt and
              tracking.
            </Prose>
          ) : !session ? (
            <>
              <Prose>
                Sign in to see your orders and delivery details. You do not need an account
                to buy anything; checkout works without one.
              </Prose>
              <AccountActions signedIn={false} />
            </>
          ) : loadFailed ? (
            <>
              <Prose>
                We could not load your orders just now. Nothing is wrong with your account —
                please try again in a moment.
              </Prose>
              <AccountActions signedIn />
            </>
          ) : (
            <>
              <dl style={{ margin: '0 0 36px' }}>
                <Detail label="Email" value={overview?.emailAddress?.emailAddress} />
                <Detail
                  label="Default address"
                  value={overview?.defaultAddress?.formatted.join(', ')}
                />
              </dl>

              <h2
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: 'var(--text-lg)',
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  color: 'var(--ink)',
                  margin: '0 0 16px',
                }}
              >
                Orders
              </h2>

              {orders.length === 0 ? (
                /*
                  The state this ships in. The store has had zero orders ever, so
                  this is the only branch a real customer can currently reach —
                  which makes it worth writing properly rather than treating as an
                  edge case.
                */
                <Prose>
                  No orders yet. When you place one, it will appear here with its status
                  and delivery details.
                </Prose>
              ) : (
                <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                  {orders.map((order) => (
                    <li
                      key={order.id}
                      style={{
                        borderTop: '1px solid var(--ash)',
                        padding: '18px 0',
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: '12px',
                        justifyContent: 'space-between',
                      }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <p
                          style={{
                            fontFamily: 'var(--font-display)',
                            fontSize: '0.95rem',
                            letterSpacing: '0.08em',
                            textTransform: 'uppercase',
                            color: 'var(--ink)',
                            margin: '0 0 4px',
                          }}
                        >
                          {order.name}
                        </p>
                        <p
                          style={{
                            fontFamily: 'var(--font-ui)',
                            fontSize: 'var(--text-xs)',
                            letterSpacing: '0.1em',
                            textTransform: 'uppercase',
                            color: 'var(--titanium-text)',
                            margin: 0,
                          }}
                        >
                          {new Date(order.processedAt).toLocaleDateString('en-GB', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })}
                          {' · '}
                          {order.fulfillments.edges[0]?.node.status ??
                            order.financialStatus ??
                            'Processing'}
                        </p>
                      </div>
                      <p
                        style={{
                          fontFamily: 'var(--font-body)',
                          fontWeight: 300,
                          fontSize: '0.95rem',
                          color: 'var(--ink)',
                          margin: 0,
                        }}
                      >
                        {/*
                          Shopify's own figure, formatted by the same function the
                          rest of the site uses. Ten surfaces once hardcoded USD;
                          an order history quoting the wrong currency would be the
                          eleventh.
                        */}
                        {formatPrice(
                          order.totalPrice.amount,
                          order.totalPrice.currencyCode as CurrencyCode
                        )}
                      </p>
                    </li>
                  ))}
                </ul>
              )}

              <AccountActions signedIn />
            </>
          )}
        </section>
      </main>
      <Footer />
      <CartDrawer />
    </>
  )
}

function Prose({ children }: { children: React.ReactNode }) {
  return (
    <p
      style={{
        fontFamily: 'var(--font-body)',
        fontWeight: 300,
        fontSize: 'var(--text-base)',
        lineHeight: 1.7,
        color: 'var(--graphite)',
        maxWidth: '52ch',
        margin: '0 0 24px',
      }}
    >
      {children}
    </p>
  )
}

function Detail({ label, value }: { label: string; value?: string }) {
  if (!value) return null
  return (
    <div style={{ display: 'flex', gap: '12px', padding: '8px 0' }}>
      <dt
        style={{
          fontFamily: 'var(--font-ui)',
          fontSize: 'var(--text-xs)',
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color: 'var(--titanium-text)',
          minWidth: '140px',
        }}
      >
        {label}
      </dt>
      <dd
        style={{
          fontFamily: 'var(--font-body)',
          fontWeight: 300,
          fontSize: 'var(--text-sm)',
          color: 'var(--ink)',
          margin: 0,
        }}
      >
        {value}
      </dd>
    </div>
  )
}
