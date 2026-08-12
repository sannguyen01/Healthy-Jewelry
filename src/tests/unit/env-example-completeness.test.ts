import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

/**
 * Every environment variable the app or the verification scripts read must appear in
 * `.env.local.example`.
 *
 * That file is the only answer a new contributor gets to "what do I need to set", and it
 * was missing two: `SHOPIFY_STORE_DOMAIN` — read by both scripts, CI and both workflows —
 * and `SHOPIFY_ADMIN_ACCESS_TOKEN`. Neither omission produces an error at setup; they
 * produce a script that fails later for a reason that reads as misconfiguration.
 */

const ROOT = process.cwd()
const EXAMPLE = readFileSync(join(ROOT, '.env.local.example'), 'utf-8')

/** Documented if the name appears at all — as an assignment or in the prose around it. */
const documented = (name: string) => EXAMPLE.includes(name)

function walk(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      if (entry === 'node_modules' || entry === 'tests') continue
      out.push(...walk(full))
    } else if (/\.(tsx?|mjs)$/.test(full)) {
      out.push(full)
    }
  }
  return out
}

/**
 * Variables that are legitimately absent, each for a stated reason. An exemption list beats
 * a narrower scan: the reason is written down instead of being implied by what the walk
 * happens to miss.
 */
const EXEMPT = new Set([
  'NODE_ENV', // set by the runtime
  'CI', // set by the runner
  'PORT', // set by the host
  'VERCEL_URL', // injected by Vercel
  'PLAYWRIGHT_SKIP_BUILD', // test harness plumbing
  'PLAYWRIGHT_CHROMIUM_PATH',
  'PRODUCTION_SITE_URL', // CI-only; documented in docs/credential-inventory.md
  'SMOKE_SECRETS_SOURCE', // CI-only environment marker
  'UPSTASH_REDIS_REST_URL', // optional; documented in the runbook + inventory
  'UPSTASH_REDIS_REST_TOKEN',
  'RESEND_API_KEY', // optional; contact form degrades without it
])

describe('.env.local.example completeness', () => {
  const sources = [join(ROOT, 'src'), join(ROOT, 'scripts')].flatMap(walk)

  const referenced = new Map<string, string[]>()
  for (const file of sources) {
    const src = readFileSync(file, 'utf-8')
    for (const match of src.matchAll(/process\.env\.([A-Z_][A-Z0-9_]*)/g)) {
      const name = match[1]
      referenced.set(name, [...(referenced.get(name) ?? []), relative(ROOT, file)])
    }
  }

  it('finds env references to check', () => {
    expect(sources.length).toBeGreaterThan(20)
    expect(referenced.size).toBeGreaterThan(3)
  })

  it('documents every variable the app or scripts read', () => {
    const undocumented = [...referenced.entries()]
      .filter(([name]) => !EXEMPT.has(name) && !documented(name))
      .map(([name, files]) => `${name}  (read in ${files[0]})`)

    expect(
      undocumented,
      'These variables are read but absent from .env.local.example, so a new setup has\n' +
        'no way to know they exist:\n  ' +
        undocumented.join('\n  '),
    ).toEqual([])
  })

  it('documents both spellings of the store domain', () => {
    // The app can only use the NEXT_PUBLIC_ one; the scripts and workflows use the other.
    // Both are real, so both belong here.
    expect(documented('NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN')).toBe(true)
    expect(documented('SHOPIFY_STORE_DOMAIN')).toBe(true)
  })
})
