import { describe, it, expect } from 'vitest'
import {
  generateProductMetadata,
  generateCollectionMetadata,
  generatePageMetadata,
} from '@/lib/utils/seo'
import type { HJProduct, HJCollection } from '@/lib/shopify/types'

const mockProduct: HJProduct = {
  id: 'gid://shopify/Product/hj-001',
  defaultVariantId: 'gid://shopify/ProductVariant/hj-001-default',
  handle: 'arc-band-titanium',
  title: 'Arc Band',
  collection: 'rings',
  material: 'titanium',
  tags: ['rings', 'titanium', 'bestseller'],
  price: '89.00',
  compareAtPrice: null,
  badge: 'Bestseller',
  description: 'Grade 23 titanium. Mirror-polished arc profile. Hypoallergenic.',
  spec: '2 mm · 1.8 g',
  svgType: 'ring-arc',
}

const mockCollection: HJCollection = {
  handle: 'rings',
  title: 'Rings',
  description: 'Architectural forms for everyday wear',
  count: 4,
}

// ── generateProductMetadata ────────────────────────────────────────────────

describe('generateProductMetadata', () => {
  it('title includes product name', () => {
    const meta = generateProductMetadata(mockProduct)
    expect(meta.title as string).toContain('Arc Band')
  })
  it('title includes site name', () => {
    const meta = generateProductMetadata(mockProduct)
    expect(meta.title as string).toContain('Healthy Jewelry')
  })
  it('description is sourced from product description', () => {
    const meta = generateProductMetadata(mockProduct)
    expect(meta.description).toContain('titanium')
  })
  it('description is at most 155 characters', () => {
    const longDesc: HJProduct = {
      ...mockProduct,
      description: 'A'.repeat(200),
    }
    const meta = generateProductMetadata(longDesc)
    expect((meta.description as string).length).toBeLessThanOrEqual(155)
  })
  it('openGraph URL includes product handle', () => {
    const meta = generateProductMetadata(mockProduct)
    const og = meta.openGraph as { url?: string }
    expect(og.url).toContain('arc-band-titanium')
  })
  it('openGraph has one image', () => {
    const meta = generateProductMetadata(mockProduct)
    const og = meta.openGraph as { images?: unknown[] }
    expect(og.images).toHaveLength(1)
  })
  it('openGraph image is 1200×630', () => {
    const meta = generateProductMetadata(mockProduct)
    const og = meta.openGraph as { images?: { width: number; height: number }[] }
    expect(og.images![0].width).toBe(1200)
    expect(og.images![0].height).toBe(630)
  })
  it('openGraph type is website', () => {
    const meta = generateProductMetadata(mockProduct)
    const og = meta.openGraph as { type?: string }
    expect(og.type).toBe('website')
  })
  it('twitter card is summary_large_image', () => {
    const meta = generateProductMetadata(mockProduct)
    const tw = meta.twitter as { card?: string }
    expect(tw.card).toBe('summary_large_image')
  })
  it('twitter title matches og title', () => {
    const meta = generateProductMetadata(mockProduct)
    const og = meta.openGraph as { title?: string }
    const tw = meta.twitter as { title?: string }
    expect(tw.title).toBe(og.title)
  })
})

// ── generateCollectionMetadata ─────────────────────────────────────────────

describe('generateCollectionMetadata', () => {
  it('title includes collection name', () => {
    const meta = generateCollectionMetadata(mockCollection)
    expect(meta.title as string).toContain('Rings')
  })
  it('title includes site name', () => {
    const meta = generateCollectionMetadata(mockCollection)
    expect(meta.title as string).toContain('Healthy Jewelry')
  })
  it('description from collection', () => {
    const meta = generateCollectionMetadata(mockCollection)
    expect(meta.description).toContain('everyday wear')
  })
  it('description capped at 155 chars', () => {
    const longDesc: HJCollection = {
      ...mockCollection,
      description: 'B'.repeat(200),
    }
    const meta = generateCollectionMetadata(longDesc)
    expect((meta.description as string).length).toBeLessThanOrEqual(155)
  })
  it('openGraph URL includes collection handle', () => {
    const meta = generateCollectionMetadata(mockCollection)
    const og = meta.openGraph as { url?: string }
    expect(og.url).toContain('rings')
  })
  it('openGraph siteName is Healthy Jewelry', () => {
    const meta = generateCollectionMetadata(mockCollection)
    const og = meta.openGraph as { siteName?: string }
    expect(og.siteName).toBe('Healthy Jewelry')
  })
  it('twitter card is summary_large_image', () => {
    const meta = generateCollectionMetadata(mockCollection)
    const tw = meta.twitter as { card?: string }
    expect(tw.card).toBe('summary_large_image')
  })
})

// ── generatePageMetadata ───────────────────────────────────────────────────

describe('generatePageMetadata', () => {
  it('title includes given page title', () => {
    const meta = generatePageMetadata('About Us')
    expect(meta.title as string).toContain('About Us')
  })
  it('title includes site name', () => {
    const meta = generatePageMetadata('Materials')
    expect(meta.title as string).toContain('Healthy Jewelry')
  })
  it('uses provided description', () => {
    const meta = generatePageMetadata('About Us', 'Our story begins here.')
    expect(meta.description).toBe('Our story begins here.')
  })
  it('falls back to SITE_DESCRIPTION when no description given', () => {
    const meta = generatePageMetadata('Materials')
    expect(meta.description).toBeTruthy()
    expect(typeof meta.description).toBe('string')
  })
  it('openGraph siteName is Healthy Jewelry', () => {
    const meta = generatePageMetadata('About Us')
    const og = meta.openGraph as { siteName?: string }
    expect(og.siteName).toBe('Healthy Jewelry')
  })
  it('openGraph type is website', () => {
    const meta = generatePageMetadata('About Us')
    const og = meta.openGraph as { type?: string }
    expect(og.type).toBe('website')
  })
  it('openGraph has an image', () => {
    const meta = generatePageMetadata('About Us')
    const og = meta.openGraph as { images?: unknown[] }
    expect(og.images).toHaveLength(1)
  })
  it('twitter card is summary_large_image', () => {
    const meta = generatePageMetadata('About Us')
    const tw = meta.twitter as { card?: string }
    expect(tw.card).toBe('summary_large_image')
  })
})
