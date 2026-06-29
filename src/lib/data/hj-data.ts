import type {
  HJProduct,
  HJCollection,
  HJMaterial,
  HJCollectionHandle,
} from '@/lib/shopify/types'

// ── Collections ────────────────────────────────────────────────────────────

export const hjCollections: HJCollection[] = [
  {
    handle: 'rings',
    title: 'Rings',
    description: 'Architectural forms for everyday wear',
    count: 4,
  },
  {
    handle: 'necklaces',
    title: 'Necklaces',
    description: 'Pendants and chains in pure titanium',
    count: 4,
  },
  {
    handle: 'earrings',
    title: 'Earrings',
    description: 'Studs, hoops and drops — nickel-free',
    count: 4,
  },
  {
    handle: 'bracelets',
    title: 'Bracelets',
    description: 'Cuffs and bangles. No tarnish. Ever.',
    count: 3,
  },
]

// ── Materials ──────────────────────────────────────────────────────────────

export const hjMaterials: HJMaterial[] = [
  {
    handle: 'titanium',
    title: 'Grade 23 Titanium',
    subtitle: 'Implant-grade',
    body: 'The same alloy used in surgical implants and aerospace structures. Hypoallergenic, 45% lighter than steel, corrosion-proof in saltwater.',
    properties: [
      'Hypoallergenic',
      'Saltwater-resistant',
      'Lifetime color stability',
      'MRI-safe',
    ],
  },
  {
    handle: 'niobium',
    title: 'Niobium',
    subtitle: 'Anodized',
    body: 'A rare refractory metal, naturally biocompatible. Anodized in oxygen-free environments to achieve stable, pigment-free color.',
    properties: [
      'Pigment-free color',
      'Zero nickel',
      'Biocompatible',
      'Anodized permanently',
    ],
  },
  {
    handle: 'surgical-steel',
    title: '316L Surgical Steel',
    subtitle: 'Medical grade',
    body: '316L is the same steel specification used in medical instruments. Low carbon content prevents sensitization over extended wear.',
    properties: [
      'Low-carbon spec',
      'High corrosion resistance',
      'Polishable',
      'FDA-recognized',
    ],
  },
]

// ── Products ───────────────────────────────────────────────────────────────

export const hjProducts: HJProduct[] = [
  // ── Rings ────────────────────────────────────────────────────────────────
  {
    id: 'gid://shopify/Product/hj-001',
    defaultVariantId: 'gid://shopify/ProductVariant/hj-001-default',
    handle: 'arc-band-titanium',
    title: 'Arc Band',
    collection: 'rings',
    material: 'titanium',
    tags: ['rings', 'titanium', 'bestseller', 'everyday'],
    price: '89.00',
    compareAtPrice: null,
    badge: 'Bestseller',
    description: 'Grade 23 titanium. Mirror-polished arc profile. Hypoallergenic.',
    spec: '2 mm · 1.8 g',
    svgType: 'ring-arc',
  },
  {
    id: 'gid://shopify/Product/hj-002',
    defaultVariantId: 'gid://shopify/ProductVariant/hj-002-default',
    handle: 'dome-ring-titanium',
    title: 'Dome Ring',
    collection: 'rings',
    material: 'titanium',
    tags: ['rings', 'titanium', 'new'],
    price: '112.00',
    compareAtPrice: null,
    badge: 'New',
    description: 'Architectural dome profile. Brushed titanium finish.',
    spec: '4 mm · 2.4 g',
    svgType: 'ring-dome',
  },
  {
    id: 'gid://shopify/Product/hj-003',
    defaultVariantId: 'gid://shopify/ProductVariant/hj-003-default',
    handle: 'flat-band-niobium',
    title: 'Flat Band',
    collection: 'rings',
    material: 'niobium',
    tags: ['rings', 'niobium'],
    price: '74.00',
    compareAtPrice: null,
    badge: null,
    description: 'Anodized niobium. Color-stable, pigment-free finish.',
    spec: '3 mm · 1.6 g',
    svgType: 'ring-flat',
  },
  {
    id: 'gid://shopify/Product/hj-004',
    defaultVariantId: 'gid://shopify/ProductVariant/hj-004-default',
    handle: 'split-ring-titanium',
    title: 'Split Ring',
    collection: 'rings',
    material: 'titanium',
    tags: ['rings', 'titanium'],
    price: '98.00',
    compareAtPrice: '130.00',
    badge: 'Sale',
    description: 'Open split design. Adjustable fit. Brushed titanium.',
    spec: 'Adjustable · 2.1 g',
    svgType: 'ring-split',
  },

  // ── Necklaces ────────────────────────────────────────────────────────────
  {
    id: 'gid://shopify/Product/hj-005',
    defaultVariantId: 'gid://shopify/ProductVariant/hj-005-default',
    handle: 'orbit-pendant-titanium',
    title: 'Orbit Pendant',
    collection: 'necklaces',
    material: 'titanium',
    tags: ['necklaces', 'titanium', 'bestseller'],
    price: '145.00',
    compareAtPrice: null,
    badge: 'Bestseller',
    description: 'Suspended disc pendant on 18" titanium cable chain.',
    spec: 'Disc 18 mm · chain 18"',
    svgType: 'necklace-disc',
  },
  {
    id: 'gid://shopify/Product/hj-006',
    defaultVariantId: 'gid://shopify/ProductVariant/hj-006-default',
    handle: 'bar-necklace-titanium',
    title: 'Linear Bar',
    collection: 'necklaces',
    material: 'titanium',
    tags: ['necklaces', 'titanium'],
    price: '128.00',
    compareAtPrice: null,
    badge: null,
    description: '40 mm horizontal bar on box chain. Mirror finish.',
    spec: 'Bar 40 mm · chain 16"',
    svgType: 'necklace-bar',
  },
  {
    id: 'gid://shopify/Product/hj-007',
    defaultVariantId: 'gid://shopify/ProductVariant/hj-007-default',
    handle: 'drop-pendant-surgical-steel',
    title: 'Teardrop Pendant',
    collection: 'necklaces',
    material: 'surgical-steel',
    tags: ['necklaces', 'surgical-steel', 'new'],
    price: '96.00',
    compareAtPrice: null,
    badge: 'New',
    description: '316L surgical steel. Polished teardrop form.',
    spec: 'Drop 24 mm · chain 20"',
    svgType: 'necklace-drop',
  },
  {
    id: 'gid://shopify/Product/hj-008',
    defaultVariantId: 'gid://shopify/ProductVariant/hj-008-default',
    handle: 'link-chain-niobium',
    title: 'Fine Link Chain',
    collection: 'necklaces',
    material: 'niobium',
    tags: ['necklaces', 'niobium'],
    price: '158.00',
    compareAtPrice: null,
    badge: null,
    description: 'Anodized niobium belcher chain. No clasp allergens.',
    spec: '2.4 mm links · 18"',
    svgType: 'necklace-chain',
  },

  // ── Earrings ─────────────────────────────────────────────────────────────
  {
    id: 'gid://shopify/Product/hj-009',
    defaultVariantId: 'gid://shopify/ProductVariant/hj-009-default',
    handle: 'disc-studs-titanium',
    title: 'Disc Studs',
    collection: 'earrings',
    material: 'titanium',
    tags: ['earrings', 'titanium', 'bestseller'],
    price: '68.00',
    compareAtPrice: null,
    badge: 'Bestseller',
    description: 'Flat disc studs on implant-grade titanium posts.',
    spec: 'Disc 8 mm · post 6 mm',
    svgType: 'earring-stud',
  },
  {
    id: 'gid://shopify/Product/hj-010',
    defaultVariantId: 'gid://shopify/ProductVariant/hj-010-default',
    handle: 'arc-hoops-titanium',
    title: 'Arc Hoops',
    collection: 'earrings',
    material: 'titanium',
    tags: ['earrings', 'titanium', 'new'],
    price: '89.00',
    compareAtPrice: null,
    badge: 'New',
    description: 'Open arc hoop with snap closure. Grade 23 titanium.',
    spec: '14 mm diameter · 1.2 mm wire',
    svgType: 'earring-hoop',
  },
  {
    id: 'gid://shopify/Product/hj-011',
    defaultVariantId: 'gid://shopify/ProductVariant/hj-011-default',
    handle: 'tube-drops-surgical-steel',
    title: 'Tube Drops',
    collection: 'earrings',
    material: 'surgical-steel',
    tags: ['earrings', 'surgical-steel'],
    price: '78.00',
    compareAtPrice: null,
    badge: null,
    description: 'Suspended tube drops on 316L steel ear wires.',
    spec: 'Tube 18 mm drop length',
    svgType: 'earring-drop',
  },
  {
    id: 'gid://shopify/Product/hj-012',
    defaultVariantId: 'gid://shopify/ProductVariant/hj-012-default',
    handle: 'cone-studs-niobium',
    title: 'Cone Studs',
    collection: 'earrings',
    material: 'niobium',
    tags: ['earrings', 'niobium'],
    price: '72.00',
    compareAtPrice: null,
    badge: null,
    description: 'Anodized niobium cone studs. Permanent color finish.',
    spec: 'Cone 7 mm · post 5 mm',
    svgType: 'earring-cone',
  },

  // ── Bracelets ────────────────────────────────────────────────────────────
  {
    id: 'gid://shopify/Product/hj-013',
    defaultVariantId: 'gid://shopify/ProductVariant/hj-013-default',
    handle: 'cable-cuff-titanium',
    title: 'Cable Cuff',
    collection: 'bracelets',
    material: 'titanium',
    tags: ['bracelets', 'titanium'],
    price: '168.00',
    compareAtPrice: null,
    badge: null,
    description: 'Twisted titanium cable cuff. Open-end, adjustable.',
    spec: '2.5 mm cable · 160 mm',
    svgType: 'bracelet-cuff',
  },
  {
    id: 'gid://shopify/Product/hj-014',
    defaultVariantId: 'gid://shopify/ProductVariant/hj-014-default',
    handle: 'flat-bangle-titanium',
    title: 'Flat Bangle',
    collection: 'bracelets',
    material: 'titanium',
    tags: ['bracelets', 'titanium', 'bestseller'],
    price: '142.00',
    compareAtPrice: null,
    badge: 'Bestseller',
    description: '4 mm flat bangle. Brushed outer, polished inner.',
    spec: '4 mm width · 63 mm ID',
    svgType: 'bracelet-bangle',
  },
  {
    id: 'gid://shopify/Product/hj-015',
    defaultVariantId: 'gid://shopify/ProductVariant/hj-015-default',
    handle: 'link-bracelet-surgical-steel',
    title: 'Link Bracelet',
    collection: 'bracelets',
    material: 'surgical-steel',
    tags: ['bracelets', 'surgical-steel'],
    price: '118.00',
    compareAtPrice: null,
    badge: null,
    description: '316L surgical steel square links. Lobster clasp.',
    spec: '8 mm links · 18 cm',
    svgType: 'bracelet-link',
  },
]

// ── Helper functions ───────────────────────────────────────────────────────

export function getProductsByCollection(handle: HJCollectionHandle): HJProduct[] {
  return hjProducts.filter((p) => p.collection === handle)
}

export function getProductByHandle(handle: string): HJProduct | undefined {
  return hjProducts.find((p) => p.handle === handle)
}

export function getCollectionByHandle(handle: HJCollectionHandle): HJCollection | undefined {
  return hjCollections.find((c) => c.handle === handle)
}

export function getBestsellers(): HJProduct[] {
  return hjProducts.filter((p) => p.badge === 'Bestseller')
}

export function getNewArrivals(): HJProduct[] {
  return hjProducts.filter((p) => p.badge === 'New')
}

export function getAllProducts(): HJProduct[] {
  return hjProducts
}
