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
  SITE_DOMAIN,
  SITE_DESCRIPTION,
  SITE_TAGLINE,
  SEO_DEFAULTS,
  SOCIAL_LINKS,
  CONTACT_EMAIL,
  SUPPORT_EMAIL,
  PRIVACY_EMAIL,
  LEGAL_EMAIL,
  SENDER_EMAIL,
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
  it('has 5 collections', () => {
    expect(collectionsNav).toHaveLength(5)
  })
  it('each entry has handle, title, description, and href under /shop/', () => {
    collectionsNav.forEach((col) => {
      expect(col.handle).toBeTruthy()
      expect(col.title).toBeTruthy()
      expect(col.description).toBeTruthy()
      expect(col.href).toMatch(/^\/shop\//)
    })
  })
  it('includes rings, necklaces, earrings, bracelets, charms', () => {
    const handles = collectionsNav.map((c) => c.handle)
    expect(handles).toContain('rings')
    expect(handles).toContain('necklaces')
    expect(handles).toContain('earrings')
    expect(handles).toContain('bracelets')
    expect(handles).toContain('charms')
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
  it('SITE_URL contains the correct (double-L) domain', () => {
    expect(SITE_URL).toContain('healthyjewellery')
  })
  it('SITE_DOMAIN is the bare hostname of SITE_URL', () => {
    expect(SITE_DOMAIN).toBe('healthyjewellery.com')
  })
  it('SITE_DESCRIPTION mentions titanium', () => {
    expect(SITE_DESCRIPTION.toLowerCase()).toContain('titanium')
  })
  it('SITE_TAGLINE is defined', () => {
    expect(SITE_TAGLINE).toBeTruthy()
    expect(typeof SITE_TAGLINE).toBe('string')
  })
  it('CONTACT_EMAIL is a valid address on the correct domain', () => {
    expect(CONTACT_EMAIL).toContain('@')
    expect(CONTACT_EMAIL).toContain('healthyjewellery')
  })
  it('SUPPORT_EMAIL is a valid address on the correct domain', () => {
    expect(SUPPORT_EMAIL).toContain('@')
    expect(SUPPORT_EMAIL).toContain('healthyjewellery')
  })
  it('PRIVACY_EMAIL and LEGAL_EMAIL are valid addresses on the correct domain', () => {
    expect(PRIVACY_EMAIL).toBe('privacy@healthyjewellery.com')
    expect(LEGAL_EMAIL).toBe('legal@healthyjewellery.com')
  })
  it('SENDER_EMAIL is a valid address on the correct domain', () => {
    expect(SENDER_EMAIL).toBe('contact@healthyjewellery.com')
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

// The three legacy `SHOPIFY_*` aliases that used to be asserted here were
// removed from `config/site.ts` on 2026-08-07: they were unused, and they read
// server-only secrets from a module that client components import. The
// assertions were `typeof x === 'string'`, which `''` satisfies — they would
// have passed just as happily if the token really had been exposed.
// `src/tests/unit/secret-exposure.test.ts` now enforces the actual rule.
