import { expect, type Page } from '@playwright/test'
import { getProductByHandle } from '../../src/lib/data/hj-data'

/**
 * Put items in the bag, now that no visitor action can.
 *
 * ## Why this exists
 *
 * Every spec that needed a non-empty bag used to do the same two steps: pick a ring size,
 * click Add to Bag. Five files carried their own copy, each with its own comment
 * explaining the size gate. **Add to Bag has been removed**, so all five broke at once.
 *
 * Seeding `localStorage` is not a shortcut around the real path here — it *is* the real
 * path. The only visitors who can still have a bag are those carrying an `hj-cart` written
 * before the control was removed, and that is exactly what this writes. The specs below go
 * on covering the drawer, the line-keying regression, the consent-banner overlap and the
 * checkout handoff, all of which still ship.
 *
 * ## Why the whole product object
 *
 * `CartItem.product` is a full `HJProduct`, and `CartDrawer` is mounted on every page and
 * reads it whether or not the drawer is open. A hand-written stub would render a drawer
 * the application could never produce, so the record comes from the real catalogue —
 * `src/lib/data/hj-data.ts`, which is also what the app itself serves under E2E's
 * placeholder Shopify credentials.
 *
 * ## Lifetime
 *
 * This helper and every caller die with the cart store. When `src/store/cart.tsx` and the
 * `hj-cart` key go, delete this file rather than porting it.
 */

/** The shape `zustand/persist` writes: `partialize`'s fields, and version 0 (none declared). */
interface PersistedCart {
  state: {
    items: { product: unknown; quantity: number; variantId: string }[]
    shopifyCartId: null
    checkoutUrl: null
    pendingCheckoutCartId: null
    justCompleted: false
  }
  version: 0
}

export const SEED_HANDLE = 'arc-band-titanium'
export const STORAGE_KEY = 'hj-cart'

/**
 * Build a persisted bag holding one line per requested size.
 *
 * Exported separately from {@link seedBag} so a spec can assert on the fixture it seeded
 * rather than restating the expected title or price in a second place.
 */
export function buildPersistedCart(sizes: readonly string[], handle = SEED_HANDLE): PersistedCart {
  const product = getProductByHandle(handle)
  if (!product) throw new Error(`${handle} is not in the catalogue; cannot seed a bag with it`)

  const items = sizes.map((size) => {
    const variant = product.variants.find((v) =>
      v.selectedOptions.some((o) => o.name === 'Size' && o.value === size)
    )
    if (!variant) {
      throw new Error(
        `${handle} has no "${size}" variant. Sizes are synthesised in hj-data.ts — if the ` +
          'size list changed, this fixture has to change with it.'
      )
    }
    return { product, quantity: 1, variantId: variant.id }
  })

  return {
    state: {
      items,
      shopifyCartId: null,
      checkoutUrl: null,
      pendingCheckoutCartId: null,
      justCompleted: false,
    },
    version: 0,
  }
}

/**
 * Seed the bag before the next navigation.
 *
 * Uses `addInitScript`, so it applies to every page load in the context rather than only
 * the first — several callers navigate more than once.
 *
 * Call this **before** `page.goto`. Rehydration is async (`hasHydrated` in the store), so
 * callers that measure or assert on the badge must wait for it; {@link openBag} does.
 */
export async function seedBag(page: Page, sizes: readonly string[] = ['7']): Promise<void> {
  const persisted = JSON.stringify(buildPersistedCart(sizes))
  await page.addInitScript(
    ([key, value]) => {
      try {
        window.localStorage.setItem(key, value)
      } catch {
        // Safari private mode throws on the accessor. Let the spec's own assertion be the
        // thing that reports it — a throw here would blame the harness for a browser mode.
      }
    },
    [STORAGE_KEY, persisted] as const
  )
}

/** Open the bag drawer and wait for it, so callers do not each re-derive the selector. */
export async function openBag(page: Page): Promise<void> {
  await page.getByRole('button', { name: /open bag/i }).click()
  await expect(page.getByRole('dialog', { name: /shopping bag/i })).toBeVisible()
}
