import { describe, it, expect } from 'vitest'
import { getAllCollections, getFeaturedCollections, getCollectionBySlug } from '@/lib/content'

describe('getAllCollections', () => {
  it('returns all 4 collections', () => {
    const collections = getAllCollections()
    expect(collections).toHaveLength(4)
  })
  it('every collection has handle, title, description', () => {
    getAllCollections().forEach((c) => {
      expect(c.handle).toBeTruthy()
      expect(c.title).toBeTruthy()
      expect(c.description).toBeTruthy()
    })
  })
  it('includes rings, necklaces, earrings, bracelets', () => {
    const handles = getAllCollections().map((c) => c.handle)
    expect(handles).toContain('rings')
    expect(handles).toContain('necklaces')
    expect(handles).toContain('earrings')
    expect(handles).toContain('bracelets')
  })
})

describe('getFeaturedCollections', () => {
  it('returns only featured collections', () => {
    const featured = getFeaturedCollections()
    expect(featured.length).toBeGreaterThan(0)
    featured.forEach((c) => {
      expect(c.featured).toBe(true)
    })
  })
  it('all 4 collections are currently featured', () => {
    expect(getFeaturedCollections()).toHaveLength(4)
  })
})

describe('getCollectionBySlug', () => {
  it('returns the correct collection for rings', () => {
    const col = getCollectionBySlug('rings')
    expect(col).toBeDefined()
    expect(col?.handle).toBe('rings')
    expect(col?.title).toBe('Rings')
  })
  it('returns the correct collection for necklaces', () => {
    const col = getCollectionBySlug('necklaces')
    expect(col?.handle).toBe('necklaces')
  })
  it('returns the correct collection for earrings', () => {
    const col = getCollectionBySlug('earrings')
    expect(col?.handle).toBe('earrings')
  })
  it('returns the correct collection for bracelets', () => {
    const col = getCollectionBySlug('bracelets')
    expect(col?.handle).toBe('bracelets')
  })
  it('returns undefined for an unknown slug', () => {
    expect(getCollectionBySlug('crystals')).toBeUndefined()
  })
  it('returns undefined for empty string', () => {
    expect(getCollectionBySlug('')).toBeUndefined()
  })
})
