/**
 * A metal's provenance dot: six pixels of its finish beside its name, in the menu's metallurgy
 * column and the materials registry (ADR 051). Decorative (`aria-hidden`): the name beside it is
 * the information, and a colour that carried meaning alone would fail WCAG 1.4.1.
 *
 * Titanium takes the accent token; niobium and steel have a swatch of their own
 * (`--metal-niobium`, `--metal-steel`), classified in `design-tokens-contrast.test.ts` as carrying
 * no text. Niobium's is its anodized blue, which is the metal's real finish and not the brand's.
 */

export type MetalHandle = 'titanium' | 'niobium' | 'surgical-steel'

export interface MetalDotProps {
  /** A `hjMaterials` handle. */
  metal: MetalHandle | string
}

export function MetalDot({ metal }: MetalDotProps) {
  return <span aria-hidden="true" className="hj-metal-dot" data-metal={metal} />
}

export default MetalDot
