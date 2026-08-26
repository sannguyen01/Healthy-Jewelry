import { HJ_SVG_TYPES, type HJSvgType } from '@/lib/shopify/types'

/**
 * The coordinate space each illustration is drawn in.
 *
 * ## Why this is data and not 25 string literals
 *
 * `JewelrySVG` carried a `viewBox` on every case, and nothing outside the component
 * could read them — so no sizing decision anywhere could account for the fact that
 * they disagree. Five distinct ratios shipped (1:1, 4:5, 8:11, 1:2, 2:5), and, worse,
 * each box held a different amount of empty air around its drawing.
 *
 * ## Why the boxes are tight
 *
 * `ProductImage`'s `svgScale` is documented as "how much of the tile the illustration
 * fills". It was not. It sized the `<svg>` element, and `preserveAspectRatio` then fit
 * a differently-padded coordinate space inside that element, so one `svgScale="70%"`
 * produced a **7x spread in optical weight**. Measured at 390px on the detail page:
 *
 * | svgType         | ink / tile area |
 * |-----------------|-----------------|
 * | `ring-arc`      | 33.4%           |
 * | `necklace-disc` | 21.8%           |
 * | `necklace-drop` | 19.4%           |
 * | `earring-drop`  | 12.1%           |
 * | `earring-stud`  |  4.8%           |
 *
 * Each box below is the measured tight bounds of that type's drawn geometry —
 * stroke width included — plus a 2% margin. With the ink filling its own coordinate
 * space, `preserveAspectRatio="xMidYMid meet"` gives every mark the same *maximum
 * extent*, and `svgScale` finally means what its name says.
 *
 * Equal maximum extent, not equal area: a cuff bracelet really is wide and flat and a
 * threader earring really is long and thin. What must not vary is how large each mark
 * reads, not how much surface it covers.
 *
 * ## Why not scale the element instead
 *
 * Because it is not safe. Correcting `earring-stud` by scaling would need a 134% box,
 * and its ink is not centred in its old viewBox (9 units of air above, 34 below —
 * `ring-split` 11/36, `earring-hoop` 18/38, `bracelet-cuff` 20/36). Growing the box
 * pushes off-centre artwork out through `.card-tile`'s `overflow: hidden`, where a
 * breach is a silent amputation rather than a scrollbar. Re-centring the coordinate
 * space fixes the placement and the size in one move.
 *
 * A `Record<HJSvgType, string>` is exhaustive at compile time; `svg-viewbox-contract`
 * walks `HJ_SVG_TYPES` at runtime, for the same reason that array exists at all.
 */
export const SVG_VIEWBOX: Readonly<Record<HJSvgType, string>> = {
  'ring-arc': '2.04 2.04 75.92 75.92', // was '0 0 80 80' — ink filled 0.912
  'ring-dome': '-1.08 -1.08 82.16 82.16', // was '0 0 80 80' — ink filled 0.988
  'ring-flat': '1 1 78 78', // was '0 0 80 80' — ink filled 0.938
  'ring-split': '8.8 9.8 62.4 35.4', // was '0 0 80 80' — ink filled 0.750
  'ring-halo': '2.55 1.8 74.91 75.66', // was '0 0 80 80' — ink filled 0.909
  'ring-facet': '5.58 4.58 68.84 73.84', // was '0 0 80 80' — ink filled 0.887
  'necklace-disc': '7.76 5.76 64.49 77.74', // was '0 0 80 100' — ink filled 0.748
  'necklace-bar': '8.02 6.02 63.96 61.21', // was '0 0 80 100' — ink filled 0.615
  'necklace-drop': '7.64 5.64 64.73 83.98', // was '0 0 80 110' — ink filled 0.734
  'necklace-chain': '12.4 11.4 55.2 57.2', // was '0 0 80 80' — ink filled 0.688
  'earring-stud': '10.26 8.26 19.48 38.48', // was '0 0 40 80' — ink filled 0.463
  'earring-hoop': '16.6 16.6 46.8 26.8', // was '0 0 80 80' — ink filled 0.563
  'earring-drop': '4.22 3.22 31.56 92.56', // was '0 0 40 100' — ink filled 0.890
  'earring-cone': '6.34 3.34 27.32 86.32', // was '0 0 40 100' — ink filled 0.830
  'earring-threader': '14 3.14 11.99 96.72', // was '0 0 40 100' — ink filled 0.930
  'bracelet-cuff': '12.96 18.96 54.08 26.08', // was '0 0 80 80' — ink filled 0.650
  'bracelet-bangle': '7.24 15.24 65.52 49.52', // was '0 0 80 80' — ink filled 0.787
  'bracelet-link': '3.34 29.34 73.32 21.32', // was '0 0 80 80' — ink filled 0.881
  'bracelet-chain': '3.86 30.86 72.28 18.28', // was '0 0 80 80' — ink filled 0.869
  'bracelet-bead': '6.68 15.93 68.64 34.39', // was '0 0 80 80' — ink filled 0.825
  'charm-classic': '28.18 5.23 23.65 66.04', // was '0 0 80 80' — ink filled 0.794
  'charm-disc': '16.71 4.21 46.58 67.08', // was '0 0 80 80' — ink filled 0.806
  'charm-anchor': '16.14 3.14 47.72 70.72', // was '0 0 80 80' — ink filled 0.850
  'charm-star': '10.57 3.07 58.86 74.36', // was '0 0 80 80' — ink filled 0.894
  'charm-heart': '17.39 3.15 45.22 70.2', // was '0 0 80 80' — ink filled 0.844
}

/**
 * The box for `JewelrySVG`'s `default:` case, which is square and drawn to fill it.
 *
 * A separate constant rather than a lookup miss returning `undefined`: an `<svg>` with
 * no `viewBox` scales its contents by nothing at all, so the fallback that exists to
 * guarantee an unknown type still draws something would render at 1 user unit per
 * pixel and be invisible in a way no type-checker could see.
 *
 * Tightened like the rest: the fallback draws two circles out to r=32.5 including
 * stroke, so it reads at the same weight as a real mark instead of announcing
 * itself by being smaller.
 */
export const FALLBACK_VIEWBOX = '6.2 6.2 67.6 67.6'

/** The declared box for `type`, or the fallback's box when it is not a known type. */
export function viewBoxFor(type: string): string {
  return SVG_VIEWBOX[type as HJSvgType] ?? FALLBACK_VIEWBOX
}

/** Every type the map must cover. Re-exported so the contract test has one import. */
export { HJ_SVG_TYPES }
