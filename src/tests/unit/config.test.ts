import { describe, it, expect } from 'vitest'
import {
  mainNav,
  primaryNavLinks,
  footerLinks,
  footerNavLinks,
  socialLinks,
  legalLinks,
  collectionsNav,
} from '@/config/navigation'
import { shopifyConfig, REVALIDATE } from '@/config/shopify'
import {
  SITE_NAME,
  SITE_URL,
  SITE_DESCRIPTION,
  SITE_TAGLINE,
  SEO_DEFAULTS,
  SOCIAL_LINKS,
  CONTACT_EMAIL,
  SUPPORT_EMAIL,
  SHOPIFY_STOREFRONT_ENDPOINT,
  SHOPIFY_STOREFRONT_TOKEN,
  SHOPIFY_REVALIDATION_SECRET,
} from '@/config/site'

// ── navigation.ts ──────────────────────────────────────────────────────────

describe('mainNav', () => {
  it('has 3 links', () => {
    expect(mainNav).toHaveLength(3)
  })
  it('all links have label and href', () => {
    mainNav.forEach((link) => {
      expect(link.label).toBeTruthy()
      expect(link.href).toMatch(/^\//)
    })
  })
})

describe('primaryNavLinks', () => {
  it('is the same reference as mainNav', () => {
    expect(primaryNavLinks).toBe(mainNav)
  })
})

describe('footerLinks', () => {
  it('has items', () => {
    expect(footerLinks.length).toBeGreaterThan(0)
  })
  it('all links have label and href', () => {
    footerLinks.forEach((link) => {
      expect(link.label).toBeTruthy()
      expect(link.href).toBeTruthy()
    })
  })
})

describe('footerNavLinks', () => {
  it('has items with label and href', () => {
    footerNavLinks.forEach((link) => {
      expect(link.label).toBeTruthy()
      expect(link.href).toBeTruthy()
    })
  })
})

describe('socialLinks', () => {
  it('includes Instagram and TikTok', () => {
    const labels = socialLinks.map((l) => l.label)
    expect(labels).toContain('Instagram')
    expect(labels).toContain('TikTok')
  })
  it('all links have label, href, and icon', () => {
    socialLinks.forEach((link) => {
      expect(link.label).toBeTruthy()
      expect(link.href).toMatch(/^https:\/\//)
      expect(link.icon).toBeTruthy()
    })
  })
})

describe('legalLinks', () => {
  it('includes privacy policy and terms', () => {
    const hrefs = legalLinks.map((l) => l.href)
    expect(hrefs).toContain('/privacy')
    expect(hrefs).toContain('/terms')
  })
})

describe('collectionsNav', () => {
  it('has 4 collections', () => {
    expect(collectionsNav).toHaveLength(4)
  })
  it('each entry has handle, title, description, and href under /shop/', () => {
    collectionsNav.forEach((col) => {
      expect(col.handle).toBeTruthy()
      expect(col.title).toBeTruthy()
      expect(col.description).toBeTruthy()
      expect(col.href).toMatch(/^\/shop\//)
    })
  })
  it('includes rings, necklaces, earrings, bracelets', () => {
    const handles = collectionsNav.map((c) => c.handle)
    expect(handles).toContain('rings')
    expect(handles).toContain('necklaces')
    expect(handles).toContain('earrings')
    expect(handles).toContain('bracelets')
  })
})

// ── shopify.ts ─────────────────────────────────────────────────────────────

describe('shopifyConfig', () => {
  it('has apiVersion 2025-01', () => {
    expect(shopifyConfig.apiVersion).toBe('2025-01')
  })
  it('has all required keys', () => {
    expect(shopifyConfig).toHaveProperty('storeDomain')
    expect(shopifyConfig).toHaveProperty('storefrontAccessToken')
    expect(shopifyConfig).toHaveProperty('adminAccessToken')
    expect(shopifyConfig).toHaveProperty('revalidationSecret')
  })
  it('values default to empty string without env vars', () => {
    expect(typeof shopifyConfig.storeDomain).toBe('string')
    expect(typeof shopifyConfig.storefrontAccessToken).toBe('string')
  })
})

describe('REVALIDATE', () => {
  it('cart is 0 (always fresh)', () => {
    expect(REVALIDATE.cart).toBe(0)
  })
  it('product is 3600 (1 hour)', () => {
    expect(REVALIDATE.product).toBe(3600)
  })
  it('collection is 3600 (1 hour)', () => {
    expect(REVALIDATE.collection).toBe(3600)
  })
  it('page is 86400 (24 hours)', () => {
    expect(REVALIDATE.page).toBe(86400)
  })
})

// ── site.ts ────────────────────────────────────────────────────────────────

describe('site constants', () => {
  it('SITE_NAME is Healthy Jewelry', () => {
    expect(SITE_NAME).toBe('Healthy Jewelry')
  })
  it('SITE_URL contains healthyjewelry', () => {
    expect(SITE_URL).toContain('healthyjewelry')
  })
  it('SITE_DESCRIPTION mentions titanium', () => {
    expect(SITE_DESCRIPTION.toLowerCase()).toContain('titanium')
  })
  it('SITE_TAGLINE is defined', () => {
    expect(SITE_TAGLINE).toBeTruthy()
    expect(typeof SITE_TAGLINE).toBe('string')
  })
  it('CONTACT_EMAIL is a valid email address', () => {
    expect(CONTACT_EMAIL).toContain('@')
    expect(CONTACT_EMAIL).toContain('healthyjewelry')
  })
  it('SUPPORT_EMAIL is a valid email address', () => {
    expect(SUPPORT_EMAIL).toContain('@')
    expect(SUPPORT_EMAIL).toContain('healthyjewelry')
  })
})

describe('SEO_DEFAULTS', () => {
  it('titleTemplate includes site name', () => {
    expect(SEO_DEFAULTS.titleTemplate).toContain('Healthy Jewelry')
  })
  it('defaultTitle is set', () => {
    expect(SEO_DEFAULTS.defaultTitle).toBeTruthy()
  })
  it('openGraph type is website', () => {
    expect(SEO_DEFAULTS.openGraph.type).toBe('website')
  })
  it('openGraph locale is en_US', () => {
    expect(SEO_DEFAULTS.openGraph.locale).toBe('en_US')
  })
  it('openGraph images has width 1200 × height 630', () => {
    const image = SEO_DEFAULTS.openGraph.images[0]
    expect(image.width).toBe(1200)
    expect(image.height).toBe(630)
  })
  it('twitter card is summary_large_image', () => {
    expect(SEO_DEFAULTS.twitter.card).toBe('summary_large_image')
  })
})

describe('SOCIAL_LINKS', () => {
  it('instagram URL contains instagram.com', () => {
    expect(SOCIAL_LINKS.instagram).toContain('instagram.com')
  })
  it('tiktok URL contains tiktok.com', () => {
    expect(SOCIAL_LINKS.tiktok).toContain('tiktok.com')
  })
  it('pinterest URL is defined', () => {
    expect(SOCIAL_LINKS.pinterest).toBeTruthy()
  })
  it('youtube URL is defined', () => {
    expect(SOCIAL_LINKS.youtube).toBeTruthy()
  })
})

describe('legacy Shopify exports', () => {
  it('SHOPIFY_STOREFRONT_ENDPOINT is a string', () => {
    expect(typeof SHOPIFY_STOREFRONT_ENDPOINT).toBe('string')
  })
  it('SHOPIFY_STOREFRONT_TOKEN is a string', () => {
    expect(typeof SHOPIFY_STOREFRONT_TOKEN).toBe('string')
  })
  it('SHOPIFY_REVALIDATION_SECRET is a string', () => {
    expect(typeof SHOPIFY_REVALIDATION_SECRET).toBe('string')
  })
})
