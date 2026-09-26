// Healthy Jewelry — materials content
//
// **Products and collections no longer live here.** They are reviewed JSON under
// `src/content/catalog/**`, read through `src/lib/catalog`, and validated against a Zod
// schema that stops the build — see docs/adr/034-the-catalogue-is-the-source.md, which
// supersedes ADR 004.
//
// What remains is the materials-science copy: three metals and their specifications. The
// claims the brand proposes about them are not here — they are records in
// `src/content/claims/claims.json`, each with evidence and a decision, and this file names
// them by id. It is deliberately *not* in the catalogue. That schema
// describes things a visitor can look at and ask an ambassador about — a piece has a handle,
// a URL, sizes, a photograph. A metal has none of those; it is prose rendered by
// `/materials` and the homepage section, and forcing it into a product shape would mean
// inventing fields for it.
//
// This is the last thing in this file. When materials get a content home of their own, the
// file goes with them.

// ── Materials ──────────────────────────────────────────────────────────────

/**
 * A metal, as the brand describes it.
 *
 * Declared here rather than imported, because here is the only place it is used. It lived
 * in `src/lib/catalog/types.ts` alongside the Shopify wire format; that file is gone with
 * the fetcher that needed it, and a type with one consumer has no reason to live anywhere
 * but next to it.
 *
 * `handle` is deliberately a plain `string` rather than the catalogue's `MaterialHandle`.
 * The two vocabularies are reconciled by `hj-data.test.ts`, which compares them directly —
 * importing the schema union here would make the materials copy depend on the product
 * schema, and the whole reason materials are not catalogue records is that they are not
 * products.
 */
export interface HJMaterial {
  handle: string
  title: string
  subtitle: string
  body: string
  /** Specification facts about the metal — always rendered. Never a claim. */
  properties: string[]
  /**
   * Claims proposed for this metal, by registry id. Rendered as chips **only** once approved
   * against evidence that covers this material; until then they render nothing, and the
   * specification properties above are the whole list.
   *
   * Ids rather than wording because the wording lives in `src/content/claims/claims.json`
   * with its evidence and decision, and a second copy here would be a claim that bypasses
   * both. Plain strings for the same reason `handle` is: this module does not import the
   * catalogue. `claims-surfaces.test.ts` reconciles every id against the registry.
   */
  claims: string[]
}

/**
 * The three metals, as specifications.
 *
 * Until 2026-09-26 this carried twelve claims as plain copy — "Implant-grade",
 * "Hypoallergenic", "corrosion-proof in saltwater", "MRI-safe", "Lifetime color stability",
 * "naturally biocompatible", "Zero nickel", "Biocompatible", "Medical grade", "prevents
 * sensitization", "FDA-recognized" — rendered on `/materials` and the homepage with nothing
 * behind any of them. They are claims now, in the registry, pending review; what stays
 * here is what the metal *is*.
 *
 * One was not a claim so much as a conflation: "Low carbon content prevents sensitization
 * over extended wear" used the metallurgical sense of sensitization — carbide precipitation
 * at grain boundaries, which is what the L in 316L guards against — in a sentence a reader
 * takes to be about skin. It is not carried into the registry, because no document could
 * support the reading it invited.
 */
export const hjMaterials: HJMaterial[] = [
  {
    handle: 'titanium',
    title: 'Grade 23 Titanium',
    subtitle: 'Ti-6Al-4V ELI',
    body: 'Titanium alloyed with aluminum and vanadium, in its Extra Low Interstitial grade — the alloy family used in aerospace structures. About 45% lighter than steel.',
    properties: ['Grade 23', 'Ti-6Al-4V ELI', '45% lighter than steel'],
    claims: ['implant-grade', 'hypoallergenic', 'saltwater-resistant', 'colour-stability', 'mri-safe'],
  },
  {
    handle: 'niobium',
    title: 'Niobium',
    subtitle: 'Anodized',
    body: 'A refractory metal, colored by anodizing: the process grows a thin oxide layer on the surface, and that layer is the color — no pigment, no dye, no coating.',
    properties: ['Pigment-free color', 'Anodized finish'],
    claims: ['nickel-free', 'biocompatible', 'anodized-permanence'],
  },
  {
    handle: 'surgical-steel',
    title: '316L Surgical Steel',
    subtitle: 'Low-carbon stainless',
    body: 'The low-carbon grade of 316 stainless steel — the L in 316L stands for low carbon. It takes a mirror polish.',
    properties: ['Low-carbon spec', 'Polishable'],
    claims: ['corrosion-resistance', 'fda-recognised'],
  },
]
