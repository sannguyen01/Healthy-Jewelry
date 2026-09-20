/**
 * Every illustration `JewelrySVG` can draw.
 *
 * ## Why this lives here now
 *
 * It was in `src/lib/catalog/types.ts`, the Shopify wire format, because that file was
 * where everything product-shaped accumulated. That file is gone
 * ([ADR 034](../../../docs/adr/034-the-catalogue-is-the-source.md)) and this vocabulary
 * has nothing to do with a catalogue: it is the set of marks
 * `src/components/svg/JewelrySVG.tsx` knows how to render, and it belongs beside
 * `viewbox.ts`, which holds each one's measured bounds.
 *
 * ## Why a runtime array with the type derived from it
 *
 * A union cannot be enumerated, so nothing could check that every member is actually
 * drawn. `svg-coverage.test.tsx` walks this array, renders each member and fails if any
 * returns nothing; `svg-viewbox-contract.test.tsx` requires each to have a measured
 * `viewBox` entry rather than a hand-guessed one.
 *
 * The validation that array-ness also bought — `parseSvgType` checking a Shopify tag
 * against it rather than casting — is no longer needed the same way. The catalogue's
 * `media` union stores `svgType` as a string and the schema is what admits it; before
 * that, `svg:ring-halo` was cast straight to this type and nine products carrying
 * illustration names that did not exist here rendered a completely blank tile with no
 * error anywhere.
 *
 * Adding a type here without drawing it in `JewelrySVG` fails the coverage test.
 */
export const HJ_SVG_TYPES = [
  'ring-arc',
  'ring-dome',
  'ring-flat',
  'ring-split',
  'ring-halo',
  'ring-facet',
  'necklace-disc',
  'necklace-bar',
  'necklace-drop',
  'necklace-chain',
  'earring-stud',
  'earring-hoop',
  'earring-drop',
  'earring-cone',
  'earring-threader',
  'bracelet-cuff',
  'bracelet-bangle',
  'bracelet-link',
  'bracelet-chain',
  'bracelet-bead',
  'charm-classic',
  'charm-disc',
  'charm-anchor',
  'charm-star',
  'charm-heart',
] as const

export type HJSvgType = (typeof HJ_SVG_TYPES)[number]
