import Link from 'next/link'
import { hjMaterials } from '@/lib/data/hj-data'
import { materialChips } from '@/lib/catalog'
import { countWord } from '@/lib/utils/countWord'
import { MetalDot } from '@/components/ui/MetalDot'
import { ArrowIcon } from '@/components/ui/ArrowIcon'

const ordinals = ['01', '02', '03']

/**
 * The metals, as a registry (ADR 051): a left column that says what this is and where the full
 * page is, and on the right one ruled row per metal. Each row is its ordinal and finish dot, its
 * name and designation, and its description with the specification chips.
 *
 * The three rows are `hjMaterials` whole, so the page, the menu's metallurgy column and `/materials`
 * cannot disagree about a metal. The chips are `materialChips()`: specification facts first, then
 * any claim a named reviewer has approved for this metal (none yet; see `hj-data.ts`).
 *
 * The ordinals were `--ash` numerals at 3rem, decoration exempt from contrast under WCAG 1.4.3 and
 * excluded from axe by `data-decorative`. They are `01` in the label voice now, at `--ink-2`, beside
 * the provenance dot: a number that tells the reader where they are in a list is not ornament, so
 * it clears 4.5:1 like any other text and nothing is excluded.
 */
export function MaterialsSection() {
  return (
    <section className="hj-band">
      <div className="hj-grid">
        <div className="hj-registry-intro">
          <span className="label-eyebrow">Materials</span>
          <h2 className="hj-h2">
            Built from the
            <br />
            inside out.
          </h2>
          <p className="hj-lede">
            {countWord(hjMaterials.length)} metals, each named by its exact specification.
          </p>
          <Link href="/materials" className="hj-link">
            The materials page
            <ArrowIcon />
          </Link>
        </div>

        <ol className="hj-registry" role="list">
          {hjMaterials.map((material, i) => (
            <li key={material.handle} className="hj-registry-row">
              <div className="hj-registry-ordinal hj-label" aria-hidden="true">
                <MetalDot metal={material.handle} />
                {ordinals[i]}
              </div>

              <div>
                <h3 className="hj-registry-name">{material.title}</h3>
                <p className="hj-spec hj-registry-designation">{material.designation}</p>
              </div>

              <div>
                <p className="hj-registry-body">{material.body}</p>
                <ul className="hj-chips" role="list">
                  {materialChips(material).map((chip) => (
                    <li key={chip} className="hj-spec hj-chip">
                      {chip}
                    </li>
                  ))}
                </ul>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}

export default MaterialsSection
