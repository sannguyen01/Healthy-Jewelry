/**
 * Every catalogue file, imported statically.
 *
 * ## Why a hand-maintained list and not `fs.readdirSync`
 *
 * A directory walk is obviously nicer to maintain and it does not survive deployment.
 * Next traces the files a route needs by following its imports; a path assembled at runtime
 * is invisible to that trace, so `src/content/catalog/**` would be left out of the
 * serverless bundle and every dynamic route — `/search` is one — would throw ENOENT in
 * production while building and running perfectly on a machine with the repository on disk.
 * That failure appears only after deploy, only on some routes, which is the worst shape a
 * failure can have.
 *
 * Static imports are traced, tree-shaken, and type-checked. The cost is that this list can
 * drift from the directory, so `catalog-manifest.test.ts` reconciles the two in both
 * directions: a JSON file absent from this list fails, and an entry here naming a file that
 * does not exist fails to compile. Neither can be noticed late.
 *
 * ## Deliberately untyped
 *
 * These are `unknown` on purpose. A `resolveJsonModule` import gives TypeScript a structural
 * type inferred from the literal, which would make a malformed record *compile* and let the
 * schema check look redundant. Everything here goes through `productSchema` in `index.ts`
 * before anything reads a field off it.
 *
 * Generated once from the directory; edited by hand thereafter. Adding a product is two
 * lines here and one file there.
 */

// ── Products ───────────────────────────────────────────────────────────────

import arcBandTitanium from '../../content/catalog/products/arc-band-titanium.json'
import arcHoopsTitanium from '../../content/catalog/products/arc-hoops-titanium.json'
import barNecklaceTitanium from '../../content/catalog/products/bar-necklace-titanium.json'
import cableCuffTitanium from '../../content/catalog/products/cable-cuff-titanium.json'
import classicCharmTitanium from '../../content/catalog/products/classic-charm-titanium.json'
import coneStudsNiobium from '../../content/catalog/products/cone-studs-niobium.json'
import discCharmSurgicalSteel from '../../content/catalog/products/disc-charm-surgical-steel.json'
import discStudsTitanium from '../../content/catalog/products/disc-studs-titanium.json'
import domeRingTitanium from '../../content/catalog/products/dome-ring-titanium.json'
import dropPendantSurgicalSteel from '../../content/catalog/products/drop-pendant-surgical-steel.json'
import flatBandNiobium from '../../content/catalog/products/flat-band-niobium.json'
import flatBangleTitanium from '../../content/catalog/products/flat-bangle-titanium.json'
import linkBraceletSurgicalSteel from '../../content/catalog/products/link-bracelet-surgical-steel.json'
import linkChainNiobium from '../../content/catalog/products/link-chain-niobium.json'
import orbitPendantTitanium from '../../content/catalog/products/orbit-pendant-titanium.json'
import splitRingTitanium from '../../content/catalog/products/split-ring-titanium.json'
import tubeDropsSurgicalSteel from '../../content/catalog/products/tube-drops-surgical-steel.json'

// ── Collections ────────────────────────────────────────────────────────────

import collectionBracelets from '../../content/catalog/collections/bracelets.json'
import collectionCharms from '../../content/catalog/collections/charms.json'
import collectionEarrings from '../../content/catalog/collections/earrings.json'
import collectionNecklaces from '../../content/catalog/collections/necklaces.json'
import collectionRings from '../../content/catalog/collections/rings.json'

/** Raw, unvalidated product records. Read them through `@/lib/catalog`, never from here. */
export const rawProducts: readonly unknown[] = [
  arcBandTitanium,
  arcHoopsTitanium,
  barNecklaceTitanium,
  cableCuffTitanium,
  classicCharmTitanium,
  coneStudsNiobium,
  discCharmSurgicalSteel,
  discStudsTitanium,
  domeRingTitanium,
  dropPendantSurgicalSteel,
  flatBandNiobium,
  flatBangleTitanium,
  linkBraceletSurgicalSteel,
  linkChainNiobium,
  orbitPendantTitanium,
  splitRingTitanium,
  tubeDropsSurgicalSteel,
]

/** Raw, unvalidated collection records. Read them through `@/lib/catalog`, never from here. */
export const rawCollections: readonly unknown[] = [
  collectionBracelets,
  collectionCharms,
  collectionEarrings,
  collectionNecklaces,
  collectionRings,
]
