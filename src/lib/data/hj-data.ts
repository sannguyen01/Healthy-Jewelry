// Healthy Jewelry — materials content
//
// **Products and collections no longer live here.** They are reviewed JSON under
// `src/content/catalog/**`, read through `src/lib/catalog`, and validated against a Zod
// schema that stops the build — see docs/adr/034-the-catalogue-is-the-source.md, which
// supersedes ADR 004.
//
// What remains is the materials-science copy: three metals, their properties, and the
// claims the brand makes about them. It is deliberately *not* in the catalogue. That schema
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
  properties: string[]
}


export const hjMaterials: HJMaterial[] = [
  {
    handle: 'titanium',
    title: 'Grade 23 Titanium',
    subtitle: 'Implant-grade',
    body: 'The same alloy used in surgical implants and aerospace structures. Hypoallergenic, 45% lighter than steel, corrosion-proof in saltwater.',
    properties: ['Hypoallergenic', 'Saltwater-resistant', 'Lifetime color stability', 'MRI-safe'],
  },
  {
    handle: 'niobium',
    title: 'Niobium',
    subtitle: 'Anodized',
    body: 'A rare refractory metal, naturally biocompatible. Anodized in oxygen-free environments to achieve stable, pigment-free color.',
    properties: ['Pigment-free color', 'Zero nickel', 'Biocompatible', 'Anodized permanently'],
  },
  {
    handle: 'surgical-steel',
    title: '316L Surgical Steel',
    subtitle: 'Medical grade',
    body: '316L is the same steel specification used in medical instruments. Low carbon content prevents sensitization over extended wear.',
    properties: ['Low-carbon spec', 'High corrosion resistance', 'Polishable', 'FDA-recognized'],
  },
]
