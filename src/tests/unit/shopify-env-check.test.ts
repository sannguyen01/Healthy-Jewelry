import { describe, expect, it, vi, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { checkShopifyEnv, warnIfShopifyUnconfigured } from '@/lib/shopify/env-check'

/**
 * The static-fallback architecture means an unconfigured deployment builds
 * clean, renders every page, and reports healthy — the failure only surfaces
 * when a customer clicks Checkout. The build log is the last place that can
 * catch it, so what the log says is a contract, not a nicety.
 */

const CONFIGURED = {
  NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN: 'hj.myshopify.com',
  SHOPIFY_STOREFRONT_ACCESS_TOKEN: 'token',
  SHOPIFY_WEBHOOK_SECRET: 'secret',
  SHOPIFY_REVALIDATION_SECRET: 'secret',
}

afterEach(() => vi.restoreAllMocks())

describe('checkShopifyEnv', () => {
  it('reports nothing when every variable is set', () => {
    const result = checkShopifyEnv(CONFIGURED)
    expect(result.missing).toEqual([])
    expect(result.messages).toEqual([])
  })

  it('names each missing variable', () => {
    const result = checkShopifyEnv({ ...CONFIGURED, SHOPIFY_WEBHOOK_SECRET: undefined })
    expect(result.missing.map((v) => v.key)).toEqual(['SHOPIFY_WEBHOOK_SECRET'])
    expect(result.messages.join('\n')).toContain('SHOPIFY_WEBHOOK_SECRET')
  })

  it('treats an empty string as missing — an unset Vercel var reads as ""', () => {
    expect(checkShopifyEnv({ ...CONFIGURED, NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN: '' }).missing).toHaveLength(1)
  })

  it('flags the store domain as build-time inlined', () => {
    // This is the single most expensive misunderstanding on this project:
    // setting it in Vercel does nothing to an already-built deployment.
    const result = checkShopifyEnv({})
    const domain = result.missing.find((v) => v.key === 'NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN')
    expect(domain?.inlined).toBe(true)
    expect(result.messages.join('\n')).toContain('inlined at build time')
  })

  it('names the environment-scope and stale-build-cache traps', () => {
    const text = checkShopifyEnv({}).messages.join('\n')
    expect(text).toMatch(/Preview/)
    expect(text).toMatch(/fresh build/)
  })

  it('says the site still builds, so the warning is not mistaken for a failure', () => {
    expect(checkShopifyEnv({}).messages.join('\n')).toMatch(/static fallback catalog/)
  })
})

describe('warnIfShopifyUnconfigured', () => {
  it('warns and reports true when configuration is incomplete', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(warnIfShopifyUnconfigured({})).toBe(true)
    expect(warn).toHaveBeenCalled()
  })

  it('stays silent and reports false when fully configured', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(warnIfShopifyUnconfigured(CONFIGURED)).toBe(false)
    expect(warn).not.toHaveBeenCalled()
  })

  it('never throws — the site must build without Shopify', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(() => warnIfShopifyUnconfigured({})).not.toThrow()
  })
})

describe('the check is wired into the build', () => {
  it('next.config.ts calls it, so a real build actually prints the warning', () => {
    // A diagnostic nothing invokes is worse than none: it reads as covered.
    const config = readFileSync(path.resolve(__dirname, '../../../next.config.ts'), 'utf8')
    expect(config).toContain('warnIfShopifyUnconfigured')
    expect(config).toMatch(/warnIfShopifyUnconfigured\(\)/)
  })

  it('imports it relatively — next.config.ts gets no tsconfig path aliases', () => {
    const config = readFileSync(path.resolve(__dirname, '../../../next.config.ts'), 'utf8')
    expect(config).toMatch(/from '\.\/src\/lib\/shopify\/env-check'/)
  })
})
