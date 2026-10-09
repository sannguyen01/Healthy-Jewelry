// Healthy Jewelry — Navigation configuration

import { SOCIAL_LINKS } from '@/config/site'

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
  { label: 'Pieces', href: '/shop' },
  { label: 'Our metals', href: '/materials' },
  { label: 'Our story', href: '/about' },
  { label: 'Find us', href: '/stores' },
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
  { label: 'Instagram', href: SOCIAL_LINKS.instagram, icon: 'instagram' },
  { label: 'TikTok', href: SOCIAL_LINKS.tiktok, icon: 'tiktok' },
  { label: 'Pinterest', href: SOCIAL_LINKS.pinterest, icon: 'pinterest' },
  { label: 'YouTube', href: SOCIAL_LINKS.youtube, icon: 'youtube' },
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
    description: 'Pendants and chains in titanium, niobium and steel',
    href: '/shop/necklaces',
  },
  {
    handle: 'earrings',
    title: 'Earrings',
    description: 'Studs, hoops and drops',
    href: '/shop/earrings',
  },
  {
    handle: 'bracelets',
    title: 'Bracelets',
    description: 'Cuffs, bangles and links.',
    href: '/shop/bracelets',
  },
  {
    handle: 'charms',
    title: 'Charms',
    description: 'Charms in titanium and steel — build your own piece',
    href: '/shop/charms',
  },
]

// ── Footer groups ──────────────────────────────────────────────────────────
// The footer's disclosure groups, built from the same lists the header and drawer use so a
// destination is added or removed in one place.

export interface FooterGroupSpec {
  title: string
  links: NavLink[]
}

/** Picks entries out of `mainNav` by destination; a href that is not there is a build-time error. */
export const byHref = (...hrefs: string[]): NavLink[] =>
  hrefs.map((href) => {
    const link = mainNav.find((entry) => entry.href === href)
    if (!link) throw new Error(`footer link ${href} is not in mainNav`)
    return link
  })

export const footerGroups: FooterGroupSpec[] = [
  {
    title: 'Shop',
    links: [
      ...byHref('/shop'),
      ...collectionsNav.map((collection) => ({ label: collection.title, href: collection.href })),
    ],
  },
  {
    title: 'About',
    links: [...byHref('/materials', '/about', '/contact'), { label: 'FAQ', href: '/faq' }],
  },
]
