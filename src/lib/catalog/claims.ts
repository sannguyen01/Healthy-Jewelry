/**
 * Claim resolution — pure functions over a registry, a render context and a clock.
 *
 * Nothing here reads a file, a module-level registry or `Date.now()`. The loaded registry and
 * the render-time clock are supplied by `src/lib/catalog/index.ts`, which is what pages and
 * server components call. Keeping the decision pure is ADR 024's rule: every branch below —
 * each decision state, an applicability mismatch, an expiry — is a fixture in
 * `claims-registry.test.ts`, not something only a broken deployment could exercise.
 *
 * ## Resolution, in one sentence
 *
 * A claim renders its proposed wording **only** when its decision is `approved`, the
 * approval is not dated in the future, it is not past `expiresOn` at render time, and at
 * least one evidence item applies to the thing being described. Every other case renders the
 * fallback, and the result says which case it was.
 *
 * ## Expiry changes what renders; it never fails the build
 *
 * [ADR 029](../../../docs/adr/029-a-governance-clock-is-not-a-merge-gate.md): a condition
 * that becomes true with no commit — a date passing — must not turn every pull request red.
 * An approved claim past its expiry quietly reverts to its fallback, and
 * `claimsNearingExpiry()` is the pure input for a scheduled probe that tells the person who
 * can act.
 */

import { MATERIAL_HANDLES, type MaterialHandle } from './schema'
import type { AppliesTo, ClaimId, ClaimRecord, ClaimsRegistry, MaterialSpec } from './claims-schema'

/**
 * What is being described when a claim renders.
 *
 * - `site`: a statement about the whole range — the positioning line, the campaign band.
 * - `material`: a statement about one metal — `/materials`, the homepage materials section.
 * - `product`: a statement about one piece — the product page.
 */
export type ClaimContext =
  | { kind: 'site' }
  | { kind: 'material'; material: MaterialHandle }
  | { kind: 'product'; handle: string; material: MaterialHandle }

export type ClaimResolution =
  | { rendered: 'wording'; text: string; reason: 'approved' }
  | {
      rendered: 'fallback'
      text: string
      reason:
        | 'pending'
        | 'rejected'
        | 'expired'
        | 'past-expiry'
        | 'decided-in-future'
        | 'not-applicable'
    }

const DAY_MS = 86_400_000

/** Midnight UTC at the start of an ISO calendar date. */
function startOfDay(isoDate: string): number {
  return Date.parse(`${isoDate}T00:00:00Z`)
}

/**
 * Does a document (or a designation) cover this render context?
 *
 * `pieceLevel` is the distinction between a property of a metal and a certification of a
 * piece. For a claim like "hypoallergenic", evidence about the material covers every piece
 * made of it. For a *standard* — "ASTM F136" — the statement is about the actual stock the
 * piece came from, so on a product page only evidence naming that product counts.
 *
 * `batch` evidence covers nothing: no render context knows which batch a piece came from.
 * A site context is covered only by one document spanning every material, because a claim
 * about the whole range is a claim about each metal in it.
 */
export function covers(
  appliesTo: AppliesTo,
  context: ClaimContext,
  options: { pieceLevel: boolean } = { pieceLevel: false }
): boolean {
  if (appliesTo.kind === 'batch') return false

  switch (context.kind) {
    case 'site':
      return (
        appliesTo.kind === 'material' &&
        MATERIAL_HANDLES.every((m) => appliesTo.materials.includes(m))
      )
    case 'material':
      return appliesTo.kind === 'material' && appliesTo.materials.includes(context.material)
    case 'product':
      if (appliesTo.kind === 'product') return appliesTo.handles.includes(context.handle)
      return !options.pieceLevel && appliesTo.materials.includes(context.material)
  }
}

/** Find a claim by id, or throw — an id the registry does not hold is a build error. */
export function findClaim(registry: ClaimsRegistry, id: ClaimId): ClaimRecord {
  const claim = registry.claims.find((c) => c.id === id)
  if (!claim) {
    throw new Error(
      `Claim "${id}" is not in the registry. The loader requires every CLAIM_IDS entry to ` +
        `have a record, so reaching this means a registry was built without loadClaimsRegistry().`
    )
  }
  return claim
}

/**
 * The single decision: wording or fallback, and why.
 *
 * `now` is the render time. For a statically generated page that is the build; for a
 * request-time page it is the request. Either way it is supplied, never read.
 */
export function resolveClaim(
  registry: ClaimsRegistry,
  id: ClaimId,
  context: ClaimContext,
  now: Date
): ClaimResolution {
  const claim = findClaim(registry, id)
  const fallback = (reason: Exclude<ClaimResolution, { rendered: 'wording' }>['reason']) =>
    ({ rendered: 'fallback', text: claim.fallback, reason }) as const

  const { decision } = claim
  switch (decision.state) {
    case 'pending':
      return fallback('pending')
    case 'rejected':
      return fallback('rejected')
    case 'expired':
      return fallback('expired')
    case 'approved': {
      // An approval dated tomorrow is a typo or a pre-emptive edit. Either way nobody has
      // approved anything *yet*, and ADR 029 records the same shape reading as permanently
      // fresh for an acceptance clock.
      if (startOfDay(decision.decidedOn) > now.getTime()) return fallback('decided-in-future')
      // Valid through the whole of `expiresOn`, in UTC.
      if (
        decision.expiresOn !== undefined &&
        now.getTime() >= startOfDay(decision.expiresOn) + DAY_MS
      ) {
        return fallback('past-expiry')
      }
      if (!claim.evidence.some((e) => covers(e.appliesTo, context))) {
        return fallback('not-applicable')
      }
      return { rendered: 'wording', text: claim.wording, reason: 'approved' }
    }
  }
}

/**
 * The wordings that may currently render anywhere: approved, not decided in the future, and
 * not past expiry at `now`. Applicability is deliberately not checked — this is the
 * allow-list for the claim-lexicon test, which asks "is this wording one somebody approved?",
 * while `resolveClaim` answers "does it apply here?" at the point of rendering.
 */
export function approvedWordingSpans(registry: ClaimsRegistry, now: Date): string[] {
  return registry.claims
    .filter((claim) => {
      const { decision } = claim
      if (decision.state !== 'approved') return false
      if (startOfDay(decision.decidedOn) > now.getTime()) return false
      if (decision.expiresOn !== undefined && now.getTime() >= startOfDay(decision.expiresOn) + DAY_MS) {
        return false
      }
      return true
    })
    .map((claim) => inline(claim.wording))
}

/** Collapse the `\n` line-break hints into single spaces, for every surface but a heading. */
export function inline(text: string): string {
  return text.split('\n').map((line) => line.trim()).filter(Boolean).join(' ')
}

/** Split on the `\n` line-break hints, for a heading that sets the claim on several lines. */
export function lines(text: string): string[] {
  return text.split('\n').map((line) => line.trim()).filter(Boolean)
}

/**
 * The claims in `ids` that resolve to their wording, in order, and nothing else.
 *
 * For **list** surfaces — the property chips on a material, the notes under a product. A
 * list does not render a fallback per item: three chips reading "under review" are noise
 * rather than information, and the list's neutral content is the specification beside it
 * (the designation, the finish). A sentence surface uses `resolveClaim()` and always
 * renders something.
 */
export function approvedWordings(
  registry: ClaimsRegistry,
  ids: readonly ClaimId[],
  context: ClaimContext,
  now: Date
): string[] {
  return ids
    .map((id) => resolveClaim(registry, id, context, now))
    .filter((r) => r.rendered === 'wording')
    .map((r) => inline(r.text))
}

export function findMaterialSpec(registry: ClaimsRegistry, material: MaterialHandle): MaterialSpec {
  const spec = registry.materialSpecs.find((s) => s.material === material)
  if (!spec) throw new Error(`No material specification for "${material}".`)
  return spec
}

/**
 * The standard a material is certified to — or `null`, which is today's answer everywhere.
 *
 * Asserting "ASTM F136" is a certification claim about the actual stock, so it renders only
 * when the specification's provenance is `documented` **and** that documentation covers the
 * thing being described at piece level: a product page needs a document naming the product,
 * `/materials` needs one naming the material.
 */
export function documentedStandard(
  registry: ClaimsRegistry,
  material: MaterialHandle,
  context: ClaimContext
): string | null {
  const spec = findMaterialSpec(registry, material)
  if (spec.standard.state !== 'named') return null
  if (spec.provenance.state !== 'documented') return null
  if (!covers(spec.provenance.appliesTo, context, { pieceLevel: true })) return null
  return spec.standard.value
}

export interface ExpiringClaim {
  id: ClaimId
  expiresOn: string
  /** Days from `now` to the end of `expiresOn`, rounded up. Zero or negative means it has lapsed. */
  daysRemaining: number
}

/**
 * Approved claims whose expiry falls within `days` of `now`, **including** ones already past.
 *
 * The input for a scheduled control-audit probe (proposed, not built here): a lapsed
 * approval renders its fallback silently, which is correct for the page and invisible to
 * the owner. The probe's job is to tell the person who can restate it — never to fail a
 * merge (ADR 029). Sorted soonest first.
 *
 * A claim approved with no `expiresOn` never appears here. That is the stated limit of an
 * optional expiry, and it is recorded in the schema rather than discovered.
 */
export function claimsNearingExpiry(
  registry: ClaimsRegistry,
  now: Date,
  days: number
): ExpiringClaim[] {
  const found: ExpiringClaim[] = []
  for (const claim of registry.claims) {
    if (claim.decision.state !== 'approved' || claim.decision.expiresOn === undefined) continue
    const end = startOfDay(claim.decision.expiresOn) + DAY_MS
    const daysRemaining = Math.ceil((end - now.getTime()) / DAY_MS)
    if (daysRemaining <= days) {
      found.push({ id: claim.id, expiresOn: claim.decision.expiresOn, daysRemaining })
    }
  }
  return found.sort((a, b) => a.expiresOn.localeCompare(b.expiresOn))
}
