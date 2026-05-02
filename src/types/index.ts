/* ═══════════════════════════════════════════
   HEALTHY JEWELRY — Core Type Definitions
   ═══════════════════════════════════════════ */

export type MaterialGrade = 'Grade 23' | 'Grade 5' | 'Grade 2' | 'Commercially Pure'

export interface HJMaterial {
  id: string
  handle: string
  name: string
  grade: MaterialGrade
  description: string
  properties: string[]
  biocompatible: boolean
}

export interface HJCollection {
  handle: string
  title: string
  description: string
  featured: boolean
  count: number
}

export interface HJProduct {
  id: string
  handle: string
  title: string
  collection: string
  price: string
  compareAtPrice: string | null
  material: string
  svgType: string
  badge: 'Bestseller' | 'New' | null
  description: string
  available: boolean
}

export interface CartItem {
  productId: string
  handle: string
  title: string
  price: string
  quantity: number
  svgType: string
}

export interface CartState {
  items: CartItem[]
  isOpen: boolean
  addItem: (item: Omit<CartItem, 'quantity'>) => void
  removeItem: (productId: string) => void
  updateQuantity: (productId: string, quantity: number) => void
  clearCart: () => void
  toggleCart: () => void
  total: () => string
}

export interface NavigationItem {
  label: string
  href: string
  children?: NavigationItem[]
}
