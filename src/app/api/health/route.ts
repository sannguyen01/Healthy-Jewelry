import { NextResponse } from 'next/server'
import { Resend } from 'resend'
import { createRateLimiter } from '@/lib/utils/rateLimit'

/**
 * Reports whether the deployment's out-of-band dependencies actually work.
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
 * `/api/contact` has the same shape of gap: PR #32 made a missing
 * `RESEND_API_KEY` fail honestly at request time (503, no more silent
 * `{ success: true }`) instead of lying, but that failure is still only
 * visible to whoever happens to submit the form. `resend` below is the same
 * "checkable rather than invisible" treatment already given to Redis.
 *
 * Nothing about either gap is visible from the outside on its own. Neither
 * errors, neither logs, and each only manifests under exactly the condition
 * it exists to catch.
 *
 * ## Configured is not the same as working
 *
 * Reporting presence alone would only prove an env var is *set*. A typo'd
 * Upstash URL, a revoked token, a paused database, or a revoked Resend key all
 * leave "configured" true while the thing it configures is dead. So this
 * endpoint spends one real round-trip against each and reports what actually
 * happened. A health check that goes green while the thing it checks is
 * broken is worse than no check at all.
 *
 * `resend` is checked via `apiKeys.list()` — an authenticated, side-effect-free
 * call that validates the key without sending any mail, deliberately, since a
 * scheduled health probe sending real email every few minutes would itself be
 * the kind of silent surprise this file exists to prevent.
 *
 * `resend` is informational only: it does not affect `healthy` or the response
 * status code, which stay scoped to rate-limiting as before. Whether a
 * misconfigured Resend key should fail a *scheduled* smoke run is a decision
 * for whoever wires this into `production-smoke.yml` — this project has twice
 * shipped an alarm that fires on a state its own owner already knows about
 * (see the 2026-08-13 architecture notes in STATE.md), and `RESEND_API_KEY`
 * being unset is exactly that: a known, tracked, already-open item, not a
 * surprise.
 *
 * ## What it deliberately does not return
 *
 * No env values, no URLs, no tokens, no key material — statuses and booleans
 * only. The endpoint is public, so it says whether each mechanism works, never
 * how it is wired.
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
type ResendStatus = 'ok' | 'unreachable' | 'not-configured'

/**
 * `apiKeys.list()` authenticates the key against Resend's API without
 * sending anything — the same "spend a real round-trip" treatment as the
 * Redis probe above, without the side effect a send would have.
 */
async function checkResend(): Promise<ResendStatus> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return 'not-configured'

  try {
    const { error } = await new Resend(apiKey).apiKeys.list()
    return error ? 'unreachable' : 'ok'
  } catch {
    return 'unreachable'
  }
}

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

  const resend = await checkResend()
  const healthy = probe.distributed && redis === 'ok'

  return NextResponse.json(
    {
      // True only when limits are genuinely shared across serverless instances.
      rateLimitDistributed: probe.distributed,
      redis,
      // Informational only — does not affect `healthy` or the status code.
      // See the file-level doc comment for why this stays non-blocking.
      resend,
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
    }
  )
}
