import Link from 'next/link'
import Image from 'next/image'
import { countWord } from '@/lib/utils/countWord'
import { ArrowIcon } from '@/components/ui/ArrowIcon'

/**
 * The collections that have a photograph. Earrings and charms do; rings, necklaces and bracelets
 * are pending photography (and in the actual metals: both photographs show gold-coloured pieces),
 * so they appear in the index only, rather than as a placeholder tile the page would have to
 * apologise for. When a collection is photographed it is added here and takes the next feature slot.
 */
const COLLECTION_PHOTOS: Partial<Record<string, string>> = {
  earrings: '/images/collections/earrings.jpg',
  charms: '/images/collections/charms.jpg',
}

/** The board shows two photographs and an index. A third would need a third slot designed. */
const FEATURED = 2

/** One collection, resolved by the server from the catalogue. */
export interface CollectionTile {
  handle: string
  title: string
  /** The catalogue's line for it ("Studs, hoops and drops"). */
  description: string
}

/**
 * Two photographs and an index (ADR 051, B4).
 *
 * The photographs are the collections that have one, in the order the catalogue lists them; the
 * index beside them is every collection, so all five paths are on the page whether or not they
 * have been shot. A server component: nothing here holds state or handles an event, and the hover
 * it used to script is a CSS rule.
 */
export function CollectionGrid({ tiles }: { tiles: CollectionTile[] }) {
  const featured = tiles.filter((tile) => COLLECTION_PHOTOS[tile.handle]).slice(0, FEATURED)

  return (
    <section className="hj-band" data-tone="subtle">
      <div className="hj-coll-head">
        <span className="label-eyebrow">Collections</span>
        <h2 className="hj-h2">{countWord(tiles.length)} ways in.</h2>
      </div>

      <div className="hj-grid hj-coll-grid">
        {featured.map((tile) => (
          <Link key={tile.handle} href={`/shop/${tile.handle}`} className="hj-coll-tile">
            <div className="card-tile hj-coll-photo">
              <Image
                src={COLLECTION_PHOTOS[tile.handle] as string}
                alt=""
                fill
                sizes="(max-width: 900px) 50vw, 40vw"
                style={{ objectFit: 'cover' }}
              />
            </div>
            <div className="hj-coll-caption">
              <h3 className="hj-coll-name">{tile.title}</h3>
              <span className="hj-spec">{tile.description}</span>
            </div>
          </Link>
        ))}

        <nav aria-label="All collections" className="hj-coll-index">
          <p className="hj-label hj-coll-index-head">Index</p>
          <ul className="hj-coll-index-list" role="list">
            {tiles.map((tile) => (
              <li key={tile.handle}>
                <Link href={`/shop/${tile.handle}`} className="hj-coll-index-row">
                  {tile.title}
                  <ArrowIcon />
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </section>
  )
}

export default CollectionGrid
