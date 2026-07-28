import { describe, it, expect } from 'vitest'
import {
  getAllProducts,
  getProductsByCollection,
  getProductByHandle,
  getBestsellers,
  getNewArrivals,
  getCollectionByHandle,
  hjCollections,
  hjMaterials,
  hjProducts,
} from '@/lib/data/hj-data'

describe('getAllProducts', () => {
  it('returns exactly 17 products', () => {
    expect(getAllProducts()).toHaveLength(17)
  })

  it('returns the same reference as hjProducts', () => {
    expect(getAllProducts()).toBe(hjProducts)
  })
})

describe('getProductsByCollection', () => {
  it('returns 4 products for rings', () => {
    const rings = getProductsByCollection('rings')
    expect(rings).toHaveLength(4)
  })

  it('all returned ring products have collection === "rings"', () => {
    const rings = getProductsByCollection('rings')
    rings.forEach((p) => expect(p.collection).toBe('rings'))
  })

  it('returns 4 products for earrings', () => {
    const earrings = getProductsByCollection('earrings')
    expect(earrings).toHaveLength(4)
  })

  it('returns 4 products for necklaces', () => {
    const necklaces = getProductsByCollection('necklaces')
    expect(necklaces).toHaveLength(4)
  })

  it('returns 3 products for bracelets', () => {
    const bracelets = getProductsByCollection('bracelets')
    expect(bracelets).toHaveLength(3)
  })

  it('returns 2 products for charms', () => {
    const charms = getProductsByCollection('charms')
    expect(charms).toHaveLength(2)
  })

  it('all returned charm products have collection === "charms"', () => {
    const charms = getProductsByCollection('charms')
    charms.forEach((p) => expect(p.collection).toBe('charms'))
  })
})

describe('getProductByHandle', () => {
  it('returns the correct product for arc-band-titanium', () => {
    const product = getProductByHandle('arc-band-titanium')
    expect(product).toBeDefined()
    expect(product?.handle).toBe('arc-band-titanium')
    expect(product?.title).toBe('Arc Band')
    expect(product?.collection).toBe('rings')
  })

  it('returns undefined for a non-existent handle', () => {
    expect(getProductByHandle('nonexistent')).toBeUndefined()
  })

  it('returns undefined for an empty string', () => {
    expect(getProductByHandle('')).toBeUndefined()
  })
})

describe('getBestsellers', () => {
  it('returns at least 1 bestseller', () => {
    expect(getBestsellers().length).toBeGreaterThanOrEqual(1)
  })

  it('all returned products have badge === "Bestseller"', () => {
    getBestsellers().forEach((p) => expect(p.badge).toBe('Bestseller'))
  })

  it('does not include products with other badges', () => {
    const bestsellers = getBestsellers()
    bestsellers.forEach((p) => {
      expect(p.badge).not.toBe('New')
      expect(p.badge).not.toBe('Sale')
    })
  })
})

describe('getNewArrivals', () => {
  it('returns at least 1 new arrival', () => {
    expect(getNewArrivals().length).toBeGreaterThanOrEqual(1)
  })

  it('all returned products have badge === "New"', () => {
    getNewArrivals().forEach((p) => expect(p.badge).toBe('New'))
  })
})

describe('getCollectionByHandle', () => {
  it('returns the rings collection', () => {
    const collection = getCollectionByHandle('rings')
    expect(collection).toBeDefined()
    expect(collection?.handle).toBe('rings')
    expect(collection?.title).toBe('Rings')
  })

  it('returns the earrings collection', () => {
    const collection = getCollectionByHandle('earrings')
    expect(collection?.handle).toBe('earrings')
  })

  it('returns the necklaces collection', () => {
    const collection = getCollectionByHandle('necklaces')
    expect(collection?.handle).toBe('necklaces')
  })

  it('returns the bracelets collection', () => {
    const collection = getCollectionByHandle('bracelets')
    expect(collection?.handle).toBe('bracelets')
  })

  it('returns the charms collection', () => {
    const collection = getCollectionByHandle('charms')
    expect(collection?.handle).toBe('charms')
  })
})

describe('hjCollections', () => {
  it('has exactly 5 entries', () => {
    expect(hjCollections).toHaveLength(5)
  })

  it('contains rings, necklaces, earrings, bracelets, charms', () => {
    const handles = hjCollections.map((c) => c.handle)
    expect(handles).toContain('rings')
    expect(handles).toContain('necklaces')
    expect(handles).toContain('earrings')
    expect(handles).toContain('bracelets')
    expect(handles).toContain('charms')
  })
})

describe('hjMaterials', () => {
  it('has exactly 3 entries', () => {
    expect(hjMaterials).toHaveLength(3)
  })

  it('contains titanium, niobium, surgical-steel', () => {
    const handles = hjMaterials.map((m) => m.handle)
    expect(handles).toContain('titanium')
    expect(handles).toContain('niobium')
    expect(handles).toContain('surgical-steel')
  })
})

describe('brand rules — no stones or crystals', () => {
  it('no product has a badge of "Crystal"', () => {
    hjProducts.forEach((p) => {
      expect(p.badge).not.toBe('Crystal')
    })
  })

  it('no product title contains the word "stone"', () => {
    hjProducts.forEach((p) => {
      expect(p.title.toLowerCase()).not.toContain('stone')
    })
  })

  it('no product title contains "crystal"', () => {
    hjProducts.forEach((p) => {
      expect(p.title.toLowerCase()).not.toContain('crystal')
    })
  })

  it('no product description contains "chakra"', () => {
    hjProducts.forEach((p) => {
      expect(p.description.toLowerCase()).not.toContain('chakra')
    })
  })
})
