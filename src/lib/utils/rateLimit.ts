// Healthy Jewelry — shared per-IP rate limiting for public API routes
//
// Extracted from `api/contact/route.ts`, which grew this after a security
// audit found an in-memory limiter that could not work across serverless
// invocations. `/api/shopify` — the route that spends the store's Shopify API
// quota and can create real carts — had no limiter at all, which made the
// hardened route the *less* attractive target of the two.
//
// One implementation, two callers, so the two cannot drift apart the way two
// copies would.

import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

export interface RateLimitPolicy {
  /** Requests allowed per window. */
  limit: number
  /** Window length, in Upstash's duration syntax (e.g. '1 h', '1 m'). */
  window: `${number} ${'s' | 'm' | 'h' | 'd'}`
  /** Redis key prefix, so routes never share a bucket. */
  prefix: string
}

export interface RateLimiter {
  /** True when this request should be refused. */
  isLimited: (ip: string) => Promise<boolean>
  /**
   * Whether this limiter is durable across serverless invocations.
   *
   * False means Upstash is not configured and the in-memory fallback is in
   * use — which on Vercel means each Lambda instance counts separately, so the
   * effective limit is `limit × instances`. Exposed rather than hidden so a
   * caller (and a test) can assert the difference instead of assuming.
   */
  readonly distributed: boolean
}

/**
 * In-memory fallback. NOT multi-instance safe — see `distributed` above.
 * Kept only so local development and CI behave without Redis credentials.
 */
function createLocalLimiter(policy: RateLimitPolicy): RateLimiter {
  const windowMs = parseWindowMs(policy.window)
  const hits = new Map<string, { count: number; resetAt: number }>()

  return {
    distributed: false,
    isLimited: async (ip: string) => {
      const now = Date.now()
      // Prune on each call; an unbounded map in a long-lived Lambda is a leak.
      for (const [key, value] of hits) {
        if (now > value.resetAt) hits.delete(key)
      }
      const entry = hits.get(ip)
      if (!entry) {
        hits.set(ip, { count: 1, resetAt: now + windowMs })
        return false
      }
      if (entry.count >= policy.limit) return true
      entry.count += 1
      return false
    },
  }
}

const WINDOW_UNIT_MS = { s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 } as const

function parseWindowMs(window: RateLimitPolicy['window']): number {
  const [rawAmount, unit] = window.split(' ') as [string, keyof typeof WINDOW_UNIT_MS]
  const amount = Number.parseInt(rawAmount, 10)
  return (Number.isNaN(amount) ? 1 : amount) * (WINDOW_UNIT_MS[unit] ?? WINDOW_UNIT_MS.h)
}

/**
 * A limiter backed by Upstash Redis when it is configured, and by an
 * in-memory map when it is not.
 *
 * Constructed once per module (routes are modules), never per request.
 */
export function createRateLimiter(policy: RateLimitPolicy): RateLimiter {
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    return createLocalLimiter(policy)
  }

  const upstash = new Ratelimit({
    redis: Redis.fromEnv(),
    limiter: Ratelimit.slidingWindow(policy.limit, policy.window),
    prefix: policy.prefix,
  })

  return {
    distributed: true,
    isLimited: async (ip: string) => {
      const { success } = await upstash.limit(ip)
      return !success
    },
  }
}

/**
 * The caller's IP, as far as it can be known behind Vercel's proxy.
 *
 * `x-forwarded-for` is a comma-separated chain and the *first* entry is the
 * original client; taking the whole header would bucket every request from one
 * proxy path together, and taking the last would bucket by Vercel's own edge.
 */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for')
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim()
    if (first) return first
  }
  return headers.get('x-real-ip')?.trim() || 'unknown'
}
