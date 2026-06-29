/* ═══════════════════════════════════════════
   HEALTHY JEWELRY — Content Layer Types
   ═══════════════════════════════════════════
   Canonical product/cart types live in:
     @/lib/shopify/types  →  HJProduct, HJCollection (Shopify shape)
     @/store/cart         →  CartItem, CartState
   The types below are for the CMS/content layer only.
   ═══════════════════════════════════════════ */

// CMS collection shape — includes `featured` flag not present in the Shopify layer
export interface HJCollection {
  handle: string
  title: string
  description: string
  featured: boolean
  count: number
}

export interface NavigationItem {
  label: string
  href: string
  children?: NavigationItem[]
}
