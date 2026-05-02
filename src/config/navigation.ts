// Healthy Jewelry — Navigation configuration

export interface NavLink {
  label: string
  href: string
  external?: boolean
}

export interface CollectionNav {
  handle: string
  title: string
  description: string
  href: string
}

// ── Main navigation ────────────────────────────────────────────────────────

export const mainNav: NavLink[] = [
  { label: 'Collection', href: '/shop' },
  { label: 'Our Story', href: '/about' },
  { label: 'Contact', href: '/contact' },
]

// Legacy alias
export const primaryNavLinks = mainNav

// ── Footer links ───────────────────────────────────────────────────────────

export const footerLinks: NavLink[] = [
  { label: 'Customer Service', href: '/contact' },
  { label: 'Store Locator', href: '/stores' },
  { label: 'Materials Guide', href: '/materials' },
  { label: 'Legal Notice', href: '/legal' },
  { label: 'Privacy Policy', href: '/privacy' },
]

// Legacy alias
export const footerNavLinks: NavLink[] = [
  { label: 'Shop', href: '/shop' },
  { label: 'Collections', href: '/shop' },
  { label: 'Materials', href: '/materials' },
  { label: 'Our Story', href: '/about' },
  { label: 'Contact', href: '/contact' },
  { label: 'FAQ', href: '/faq' },
]

// ── Social links ───────────────────────────────────────────────────────────

export const socialLinks = [
  { label: 'Instagram', href: 'https://instagram.com/healthyjewelry', icon: 'instagram' },
  { label: 'TikTok', href: 'https://tiktok.com/@healthyjewelry', icon: 'tiktok' },
  { label: 'Pinterest', href: 'https://pinterest.com/healthyjewelry', icon: 'pinterest' },
  { label: 'YouTube', href: 'https://youtube.com/@healthyjewelry', icon: 'youtube' },
] as const

// ── Legal links ────────────────────────────────────────────────────────────

export const legalLinks: NavLink[] = [
  { label: 'Privacy Policy', href: '/privacy' },
  { label: 'Terms of Service', href: '/terms' },
  { label: 'Shipping & Returns', href: '/shipping' },
]

// ── Collections list ───────────────────────────────────────────────────────

export const collectionsNav: CollectionNav[] = [
  {
    handle: 'rings',
    title: 'Rings',
    description: 'Architectural forms for everyday wear',
    href: '/shop/rings',
  },
  {
    handle: 'necklaces',
    title: 'Necklaces',
    description: 'Pendants and chains in pure titanium',
    href: '/shop/necklaces',
  },
  {
    handle: 'earrings',
    title: 'Earrings',
    description: 'Studs, hoops and drops — nickel-free',
    href: '/shop/earrings',
  },
  {
    handle: 'bracelets',
    title: 'Bracelets',
    description: 'Cuffs and bangles. No tarnish. Ever.',
    href: '/shop/bracelets',
  },
]
