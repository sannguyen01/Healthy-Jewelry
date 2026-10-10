/**
 * The claims registry schema — what the brand may say about its metals, and on whose
 * authority.
 *
 * ## Why a claim is a record and not a sentence
 *
 * Until 2026-09-26 every health, skin, imaging and corrosion statement on this site was a
 * string literal in a component: "MRI-safe" on all seventeen product pages, "the body simply
 * does not react to it" on `/faq`, "Hypoallergenic" in a catalogue description, "FDA-
 * recognized" as a property chip. None of them cited anything, and nothing could have
 * noticed, because a sentence has no type checker. The contract says it outright (§8):
 * *"Grade 23 titanium" is a specification. "Safe for sensitive skin" is a claim, and a claim
 * needs a source.*
 *
 * The owner's decision is **enforce now**: a claim with no reviewed evidence renders a
 * neutral factual fallback until a named reviewer approves it against a document. Nothing in
 * this repository is evidence today, so every record here is `pending` and every surface
 * renders its fallback. The proposed wording is kept verbatim so that approving a claim is
 * one reviewed edit to this file, not a copy rewrite across nine pages.
 *
 * ## The four parts
 *
 * - **materialSpec** — the exact designation of each metal. The designation is a
 *   specification and always renders. The *standard* it is said to meet (ASTM F136 and the
 *   rest) is a certification claim about the actual stock, so it renders only when its
 *   provenance is documented for the thing being described.
 * - **claim** — a category, the proposed wording, and the neutral fallback.
 * - **evidence** — documents, each saying what it applies to and who reviewed it.
 * - **decision** — `pending`, `approved`, `rejected` or `expired`. `approved` requires at
 *   least one evidence item, enforced below, because an approval citing nothing is the
 *   exact state this registry exists to end.
 *
 * ## Validation happens at module load, from the catalogue reader
 *
 * `src/lib/catalog/index.ts` parses this registry the first time it is imported, and
 * `next.config.ts` imports that reader — so a malformed claim fails the build exactly as a
 * malformed product does. See `catalog-content.test.ts` for the wiring assertion.
 */

import { z } from 'zod'
import { MATERIAL_HANDLES } from './schema'

// ── Vocabularies ───────────────────────────────────────────────────────────

/**
 * The kinds of statement this registry governs.
 *
 * Seven, and each is a question a reviewer answers with a different kind of document: a
 * patch-test or allergen report, an ISO 10993-style biocompatibility file, an imaging
 * compatibility assessment, a regulator's listing, a corrosion or durability test, a
 * composition certificate. A claim that fits none of them is not a claim this file governs
 * — it is copy — and forcing it into a category would make the category mean nothing.
 */
export const CLAIM_CATEGORIES = [
  'skin-contact',
  'biocompatibility',
  'medical-imaging',
  'regulatory',
  'corrosion',
  'durability',
  'allergen',
] as const

/**
 * Every claim the site knows how to render, declared once.
 *
 * The same move as `COLLECTION_HANDLES`: the ids live in TypeScript so that
 * `claimText('mri-safe', …)` is type-checked at every call site, and the loader below
 * requires the registry to hold exactly this set. A typo'd id is a compile error, a
 * record for an id nobody renders fails the build, and an id with no record fails it too —
 * never a silent fallback that looks like a pending claim.
 */
export const CLAIM_IDS = [
  // Site-wide
  'brand-positioning',
  'campaign-band',
  'materials-intro',
  // Material and piece properties, rendered as chips
  'implant-grade',
  'hypoallergenic',
  'saltwater-resistant',
  'colour-stability',
  'mri-safe',
  'nickel-free',
  'biocompatible',
  'anodized-permanence',
  'corrosion-resistance',
  'fda-recognised',
  // Answers whose whole content was a claim
  'faq-titanium-safety',
  'faq-niobium',
  'faq-water',
  'faq-mri',
  'faq-scratch-tarnish',
  'faq-continuous-wear',
  'materials-faq-skin',
  'materials-faq-mri',
] as const

export type ClaimId = (typeof CLAIM_IDS)[number]
export type ClaimCategory = (typeof CLAIM_CATEGORIES)[number]
export type ClaimMaterial = (typeof MATERIAL_HANDLES)[number]

// ── Building blocks ────────────────────────────────────────────────────────

/**
 * **The longest an expired approval can stay in a page a visitor is served, in seconds** — plus
 * the one request that notices.
 *
 * `resolveClaim()` decides at render time, and for a prerendered page render time was the build:
 * measured on 2026-09-27 (`scripts/experiment-claim-expiry.mjs` against `228fdaf`), an approval
 * two days past `expiresOn` was still in the homepage hero, its `<meta>` description and every
 * Footer, on eight cache HITs out of eight. Nothing re-rendered a page because a date passed.
 *
 * So the claim-bearing segments revalidate on this interval: the root layout (every page renders
 * the Footer's positioning line) and the default share card. Next requires those exports to be
 * literals, so each repeats the number, and `claim-expiry.test.ts` holds both to this constant.
 * Under stale-while-revalidate the first request after the window still receives the old page
 * and triggers the new one — the bound is the window plus that request, stated rather than
 * rounded away. An hour because an approval's granularity is a day: the cost is one
 * regeneration per page per hour of traffic, and the gain is that a lapsed claim stops being
 * served without anyone remembering to redeploy.
 */
export const CLAIM_WITHDRAWAL_BOUND_SECONDS = 3600

/** The day an approval was given or a record lapses. Exported: the hero record's approval is "exactly as a claim's does" (ADR 054), so the rule is written once. */
export const isoDate = z.iso.date()

/**
 * A named person. Deliberately not an email or a role: "the materials team" has approved
 * nothing, and an approval is only as good as the individual who can be asked about it.
 */
export const reviewer = z.string().trim().min(3)

/** A catalogue handle. Exported with the two above for the hero record, which names the pieces its photograph shows. */
export const productHandle = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'a product handle is a lowercase kebab-case slug')

/**
 * What a document, or a designation, is about.
 *
 * Three granularities, because they are three different promises. A mill certificate for a
 * titanium bar covers a **material**. A test report on a finished design covers **product
 * handles**. A certificate for one production run covers **batch ids** — and nothing in the
 * catalogue records which batch a piece came from, so batch evidence covers no render
 * context today. That is conservative on purpose: traceability that is not modelled is
 * traceability nobody can check.
 */
export const appliesToSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('material'), materials: z.array(z.enum(MATERIAL_HANDLES)).min(1) }).strict(),
  z.object({ kind: z.literal('product'), handles: z.array(productHandle).min(1) }).strict(),
  z.object({ kind: z.literal('batch'), batchIds: z.array(z.string().min(1)).min(1) }).strict(),
])

export const evidenceSchema = z
  .object({
    documentId: z.string().min(1),
    title: z.string().min(1),
    appliesTo: appliesToSchema,
    reviewer,
    reviewedOn: isoDate,
  })
  .strict()

/**
 * The review outcome.
 *
 * `expiresOn` is optional because the owner's brief makes it so. A claim approved with no
 * expiry is one nobody is ever prompted to restate, which is ADR 029's "a gap nobody
 * restates is indistinguishable from one nobody remembers" — so `claimsNearingExpiry()` can
 * only watch the claims that carry one. Recorded rather than silently accepted.
 *
 * `expired` exists as a *recorded* state, distinct from an `approved` claim whose
 * `expiresOn` has passed: the first is a decision somebody wrote down, the second is a clock
 * that ran out. Both render the fallback; only the first says a person looked.
 */
export const decisionSchema = z.discriminatedUnion('state', [
  z.object({ state: z.literal('pending') }).strict(),
  z
    .object({
      state: z.literal('approved'),
      reviewer,
      decidedOn: isoDate,
      expiresOn: isoDate.optional(),
    })
    .strict(),
  z
    .object({
      state: z.literal('rejected'),
      reason: z.string().trim().min(10),
      decidedOn: isoDate,
    })
    .strict(),
  z
    .object({
      state: z.literal('expired'),
      reviewer,
      decidedOn: isoDate,
      expiredOn: isoDate,
    })
    .strict(),
])

/**
 * One claim.
 *
 * `wording` and `fallback` may carry a `\n` as a line-break hint for display headings — the
 * homepage hero sets the positioning line on three lines. `claimText()` joins them with a
 * space for every other surface; `claimLines()` splits them for the one that breaks.
 *
 * `reviewNotes` is required, and may be empty. It is where a known problem with the
 * *proposed* wording is written down for the reviewer, so that it is not rediscovered at
 * approval time or, worse, not discovered at all. An optional field would be absent on
 * exactly the records where somebody meant to add one.
 */
export const claimSchema = z
  .object({
    id: z.enum(CLAIM_IDS),
    category: z.enum(CLAIM_CATEGORIES),
    wording: z.string().trim().min(1),
    fallback: z.string().trim().min(1),
    evidence: z.array(evidenceSchema),
    decision: decisionSchema,
    reviewNotes: z.array(z.string().trim().min(1)),
  })
  .strict()
  .superRefine((claim, ctx) => {
    if (claim.decision.state === 'approved' && claim.evidence.length === 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['evidence'],
        message:
          `"${claim.id}" is approved and cites no evidence. An approval is a reviewer ` +
          `matching wording to a document; with no document it is the brand's own ` +
          `authority again, which is the state this registry exists to end.`,
      })
    }
    if (
      claim.decision.state === 'approved' &&
      claim.decision.expiresOn !== undefined &&
      claim.decision.expiresOn <= claim.decision.decidedOn
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['decision', 'expiresOn'],
        message: `"${claim.id}" expires on or before the day it was approved.`,
      })
    }
    if (claim.wording === claim.fallback) {
      ctx.addIssue({
        code: 'custom',
        path: ['fallback'],
        message:
          `"${claim.id}" falls back to its own wording, so the claim renders whether or not ` +
          `anybody approved it.`,
      })
    }
  })

/**
 * The standard a material is said to meet, or the explicit fact that none is proposed.
 * A state rather than `null` for the same reason as the catalogue's pending fields.
 */
export const standardSchema = z.discriminatedUnion('state', [
  z.object({ state: z.literal('none') }).strict(),
  z.object({ state: z.literal('named'), value: z.string().trim().min(1) }).strict(),
])

export const provenanceSchema = z.discriminatedUnion('state', [
  z.object({ state: z.literal('pending') }).strict(),
  z
    .object({
      state: z.literal('documented'),
      documentId: z.string().min(1),
      appliesTo: appliesToSchema,
      reviewer,
      reviewedOn: isoDate,
    })
    .strict(),
])

export const materialSpecSchema = z
  .object({
    material: z.enum(MATERIAL_HANDLES),
    /** The exact designation. A specification — always rendered. */
    designation: z.string().trim().min(1),
    appliesTo: appliesToSchema,
    standard: standardSchema,
    provenance: provenanceSchema,
    reviewNotes: z.array(z.string().trim().min(1)),
  })
  .strict()

export const claimsRegistrySchema = z
  .object({
    materialSpecs: z.array(materialSpecSchema),
    claims: z.array(claimSchema),
  })
  .strict()

export type AppliesTo = z.infer<typeof appliesToSchema>
export type Evidence = z.infer<typeof evidenceSchema>
export type ClaimDecision = z.infer<typeof decisionSchema>
export type ClaimRecord = z.infer<typeof claimSchema>
export type MaterialSpec = z.infer<typeof materialSpecSchema>
export type ClaimsRegistry = z.infer<typeof claimsRegistrySchema>

// ── Loading ────────────────────────────────────────────────────────────────

/**
 * Parse and cross-check the registry, or throw naming everything wrong with it.
 *
 * Pure and exported for the same reason `loadCatalog` is (ADR 024): the branches that stop
 * a build must be reachable from a fixture, not only by shipping a broken record.
 *
 * The set-level checks are the ones a per-record schema cannot see, and each is a way a
 * claim would silently never render, or silently always render its fallback:
 *
 * - every id in `CLAIM_IDS` has exactly one record, and no record is duplicated;
 * - every material has exactly one specification (the product page's material line reads it);
 * - every product handle named in an `appliesTo` exists in the catalogue — a typo'd handle
 *   is evidence that covers nothing, which reads exactly like evidence nobody supplied.
 */
export function loadClaimsRegistry(
  raw: unknown,
  known: { productHandles: readonly string[] }
): ClaimsRegistry {
  const parsed = claimsRegistrySchema.safeParse(raw)
  if (!parsed.success) {
    throw new Error(
      `The claims registry in src/content/claims/ is invalid.\n\n` +
        `${JSON.stringify(parsed.error.issues, null, 2)}\n\n` +
        `See src/lib/catalog/claims-schema.ts for what each field means. This throw is ` +
        `deliberate: an invalid claim stops the build rather than rendering on the ` +
        `brand's own authority.`
    )
  }

  const registry = parsed.data
  const problems: string[] = []

  const ids = registry.claims.map((c) => c.id)
  for (const id of CLAIM_IDS) {
    const count = ids.filter((x) => x === id).length
    if (count === 0) problems.push(`claim "${id}" is rendered by the site and has no record`)
    if (count > 1) problems.push(`claim "${id}" has ${count} records; which one renders is arbitrary`)
  }

  for (const material of MATERIAL_HANDLES) {
    const count = registry.materialSpecs.filter((s) => s.material === material).length
    if (count !== 1) {
      problems.push(`material "${material}" has ${count} specifications; it must have exactly one`)
    }
  }

  const handles = new Set(known.productHandles)
  const checkHandles = (appliesTo: AppliesTo, where: string) => {
    if (appliesTo.kind !== 'product') return
    for (const handle of appliesTo.handles) {
      if (!handles.has(handle)) {
        problems.push(`${where} names product "${handle}", which the catalogue does not hold`)
      }
    }
  }
  for (const claim of registry.claims) {
    claim.evidence.forEach((e, i) => checkHandles(e.appliesTo, `claim "${claim.id}" evidence[${i}]`))
  }
  for (const spec of registry.materialSpecs) {
    checkHandles(spec.appliesTo, `materialSpec "${spec.material}"`)
    if (spec.provenance.state === 'documented') {
      checkHandles(spec.provenance.appliesTo, `materialSpec "${spec.material}" provenance`)
    }
  }

  if (problems.length > 0) {
    throw new Error(
      `${problems.length} problem(s) in the claims registry (src/content/claims/):\n\n` +
        `${problems.map((p) => `  ${p}`).join('\n')}\n\n` +
        `This throw is deliberate: a claim that cannot resolve stops the build.`
    )
  }

  return registry
}
