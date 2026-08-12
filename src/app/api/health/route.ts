import { NextResponse } from 'next/server'
import { createRateLimiter } from '@/lib/utils/rateLimit'

/**
 * Reports whether rate limiting is actually durable in this deployment.
 *
 * ## Why this exists
 *
 * `createRateLimiter` silently falls back to an in-memory map when
 * `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` are absent. On Vercel
 * that map lives per Lambda instance, so the effective limit is
 * `limit × concurrent instances` rather than `limit` — the same single-instance
 * weakness a security audit already corrected once for `/api/contact`, quietly
 * reintroduced for `/api/shopify`, which is unauthenticated and creates carts.
 *
 * Nothing about that gap is visible from the outside. It does not error, it does
 * not log, and it only manifests under exactly the traffic it exists to stop.
 *
 * ## Configured is not the same as working
 *
 * Reporting `distributed` alone would only prove the two env vars are *set*. A
 * typo'd URL, a revoked token, or a paused Upstash database all leave
 * `distributed: true` while every limit check fails open. So this endpoint spends
 * one real round-trip against Redis and reports what actually happened. A health
 * check that goes green while the thing it checks is broken is worse than no
 * check at all.
 *
 * ## What it deliberately does not return
 *
 * No env values, no URLs, no tokens, no key material — booleans and a fixed
 * status string. The endpoint is public, so it says whether the mechanism works,
 * never how it is wired.
 */

// Never prerendered: a build-time answer would describe the build machine's
// environment, not the running deployment's, and would then be cached as fact.
export const dynamic = 'force-dynamic'

// Module scope, per rateLimit.ts's own guidance ("constructed once per module,
// never per request"). A per-request limiter would allocate a fresh Map on every
// call, which for the in-memory fallback means it could never observe a limit.
//
// The generous limit and short window keep the probe from ever refusing a real
// caller; this bucket exists to be written to, not to gate anything.
const probe = createRateLimiter({
  limit: 1_000_000,
  window: '1 m',
  prefix: 'hj:health',
})

type RedisStatus = 'ok' | 'unreachable' | 'not-configured'

export async function GET(): Promise<NextResponse> {
  let redis: RedisStatus = 'not-configured'

  if (probe.distributed) {
    try {
      // The round-trip is the test. The verdict is irrelevant — what matters is
      // that Upstash answered at all.
      await probe.isLimited('health-check')
      redis = 'ok'
    } catch {
      // Configured but not answering: the case that looks healthy from the env
      // vars alone and is not.
      redis = 'unreachable'
    }
  }

  const healthy = probe.distributed && redis === 'ok'

  return NextResponse.json(
    {
      // True only when limits are genuinely shared across serverless instances.
      rateLimitDistributed: probe.distributed,
      redis,
      healthy,
      hint: healthy
        ? undefined
        : probe.distributed
          ? 'Upstash is configured but did not answer. Rate limits are failing open.'
          : 'UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN are unset in this ' +
            'environment, so rate limits count per Lambda instance rather than globally. ' +
            'Vercel scopes env vars per environment — set them for Preview as well as Production.',
    },
    {
      // 503 when degraded, so a monitor can act on the status code alone without
      // parsing the body.
      status: healthy ? 200 : 503,
      headers: { 'Cache-Control': 'no-store' },
    },
  )
}
