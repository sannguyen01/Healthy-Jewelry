import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'

/**
 * No client-reachable module may read a server-only secret.
 *
 * `config/site.ts` carried three exports — `SHOPIFY_STOREFRONT_TOKEN`,
 * `SHOPIFY_STOREFRONT_ENDPOINT`, `SHOPIFY_REVALIDATION_SECRET` — reading
 * non-`NEXT_PUBLIC_` env vars, and `ContactForm.tsx` (`'use client'`) imports
 * that file. Nothing leaked: Next inlines non-public env vars as `undefined`
 * in the client bundle, so they were always `''` in a browser.
 *
 * The danger was never today's value. It was that the only test on them
 * asserted `typeof === 'string'` — which `''` satisfies — so the code looked
 * covered while proving nothing, and a single rename to `NEXT_PUBLIC_*`, or one
 * `next.config` env passthrough, would have shipped a Storefront token to every
 * visitor with no test turning red.
 *
 * This walks the actual client import graph rather than trusting a convention.
 */

const SRC = path.resolve(__dirname, '../..')

/** A secret is any Shopify/Upstash/Resend env var without the public prefix. */
const SECRET_ENV = /process\.env\.((?!NEXT_PUBLIC_)(?:SHOPIFY|UPSTASH|RESEND)_[A-Z0-9_]+)/g

function sourceFiles(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry)
    if (statSync(full).isDirectory()) {
      if (entry === 'node_modules' || entry === '.next' || entry === 'tests') continue
      sourceFiles(full, found)
    } else if (/\.tsx?$/.test(entry)) {
      found.push(full)
    }
  }
  return found
}

function isClientModule(source: string): boolean {
  return /^\s*['"]use client['"]/m.test(source.split('\n').slice(0, 3).join('\n'))
}

/** Resolve a `@/…` or relative import to a file on disk, if it is ours. */
function resolveImport(fromFile: string, spec: string): string | null {
  let base: string
  if (spec.startsWith('@/')) base = path.join(SRC, spec.slice(2))
  else if (spec.startsWith('.')) base = path.resolve(path.dirname(fromFile), spec)
  else return null // a package, not our source

  for (const candidate of [
    `${base}.ts`,
    `${base}.tsx`,
    path.join(base, 'index.ts'),
    path.join(base, 'index.tsx'),
  ]) {
    try {
      if (statSync(candidate).isFile()) return candidate
    } catch {
      // not this one
    }
  }
  return null
}

function importsOf(file: string, source: string): string[] {
  const specs: string[] = []
  for (const match of source.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
    const resolved = resolveImport(file, match[1])
    if (resolved) specs.push(resolved)
  }
  return specs
}

/**
 * Every module reachable from a `'use client'` entry point.
 *
 * Reachability is what matters, not the directive: `config/site.ts` has no
 * `'use client'` of its own, yet a client component imports it, so its module
 * scope is evaluated in the browser bundle.
 */
function clientReachableModules(): Set<string> {
  const all = sourceFiles(SRC)
  const sources = new Map(all.map((f) => [f, readFileSync(f, 'utf8')]))

  const reachable = new Set<string>()
  const queue = all.filter((f) => isClientModule(sources.get(f) ?? ''))

  while (queue.length > 0) {
    const file = queue.pop() as string
    if (reachable.has(file)) continue
    reachable.add(file)
    for (const dep of importsOf(file, sources.get(file) ?? '')) {
      if (!reachable.has(dep)) queue.push(dep)
    }
  }
  return reachable
}

interface Offence {
  file: string
  line: number
  variable: string
}

describe('server-only secrets never reach a client module', () => {
  const reachable = clientReachableModules()

  it('finds the client graph at all — a rule over an empty set proves nothing', () => {
    // Without this, a broken resolver would silently make every assertion below
    // vacuously true, which is exactly the failure mode this file exists to
    // prevent in the first place.
    expect(reachable.size).toBeGreaterThan(5)
    const relative = [...reachable].map((f) => path.relative(SRC, f))
    expect(relative).toContain('store/cart.tsx')
    expect(relative).toContain('components/contact/ContactForm.tsx')
    // The transitive case: reached only *through* a client component.
    expect(relative).toContain('config/site.ts')
  })

  it('no client-reachable module reads a non-public secret', () => {
    const offences: Offence[] = []

    for (const file of reachable) {
      readFileSync(file, 'utf8')
        .split('\n')
        .forEach((text, index) => {
          if (text.trimStart().startsWith('//') || text.trimStart().startsWith('*')) return
          for (const match of text.matchAll(SECRET_ENV)) {
            offences.push({
              file: path.relative(SRC, file),
              line: index + 1,
              variable: match[1],
            })
          }
        })
    }

    const report = offences.map((o) => `  ${o.file}:${o.line}  ${o.variable}`).join('\n')
    expect(offences, `server-only secret read from a client-reachable module:\n${report}`).toEqual(
      []
    )
  })

  it('the public store domain is still allowed — the rule is about secrets', () => {
    // `NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN` is inlined on purpose and the cart
    // store needs it. A rule that banned every Shopify env var would be wrong
    // and would get switched off.
    const cart = readFileSync(path.join(SRC, 'store/cart.tsx'), 'utf8')
    expect(cart).toContain('shopifyPublicConfig')
    expect([...cart.matchAll(SECRET_ENV)]).toEqual([])

    const publicConfig = readFileSync(path.join(SRC, 'config/shopify-public.ts'), 'utf8')
    expect(publicConfig).toContain('NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN')
    expect([...publicConfig.matchAll(SECRET_ENV)]).toEqual([])
  })

  it('the client store does not import the server config module', () => {
    // The split only holds if the client side actually points at the public
    // file. Importing `@/config/shopify` would re-introduce all three secrets
    // through one line, and the graph walk above would be the only thing that
    // noticed — this says it directly, where the failure is easiest to read.
    const cart = readFileSync(path.join(SRC, 'store/cart.tsx'), 'utf8')
    expect(cart).not.toMatch(/from\s+['"]@\/config\/shopify['"]/)
  })
})

describe('the removed legacy aliases stay removed', () => {
  it('config/site.ts exports no Shopify secret', () => {
    const source = readFileSync(path.join(SRC, 'config/site.ts'), 'utf8')
    for (const name of [
      'SHOPIFY_STOREFRONT_TOKEN',
      'SHOPIFY_STOREFRONT_ENDPOINT',
      'SHOPIFY_REVALIDATION_SECRET',
    ]) {
      expect(source, `${name} must not be exported from a client-reachable module`).not.toMatch(
        new RegExp(`export const ${name}\\b`)
      )
    }
  })
})

/**
 * The customer-account credentials are the newest secrets in the tree, and the
 * two worst to leak: the client secret mints access tokens, and the session
 * secret decrypts every signed-in customer's cookie.
 *
 * The graph walk above already covers them — but *only because* the regex happens
 * to match their names. That is coverage by coincidence, which is the thing this
 * repo keeps getting caught by, so it is asserted directly.
 */
describe('customer-account secrets are inside the pattern, not beside it', () => {
  const CUSTOMER_SECRETS = [
    'SHOPIFY_CUSTOMER_ACCOUNT_CLIENT_ID',
    'SHOPIFY_CUSTOMER_ACCOUNT_CLIENT_SECRET',
    'SHOPIFY_CUSTOMER_ACCOUNT_SESSION_SECRET',
  ]

  it('the secret pattern recognises each of them', () => {
    for (const name of CUSTOMER_SECRETS) {
      // Fresh regex per call: SECRET_ENV is /g and carries lastIndex.
      expect(
        new RegExp(SECRET_ENV.source).test(`process.env.${name}`),
        `${name} is not matched by the secret pattern, so the graph walk cannot protect it`
      ).toBe(true)
    }
  })

  it('the modules holding them are not client modules', () => {
    // A `'use client'` directive added to either of these would put a client
    // secret in the browser bundle, and the graph walk starts *from* client
    // modules — so the file becoming one is the failure it cannot see.
    for (const file of ['lib/shopify/customer/config.ts', 'lib/shopify/customer/session.ts']) {
      const source = readFileSync(path.join(SRC, file), 'utf8')
      expect(isClientModule(source), `${file} must never be a client module`).toBe(false)
    }
  })
})
