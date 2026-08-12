import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { parseSource, envReads } from '@/lib/analysis/tsAstScan'

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

  // Minted by `next.config.ts` at build time and exposed through Next's `env` option —
  // never set by a human, and documenting them would invite someone to try. They carry
  // the build stamp (`src/config/build-info.ts`) that lets a deployment identify itself.
  'NEXT_PUBLIC_HJ_BUILD_TIME',
  'NEXT_PUBLIC_HJ_COMMIT',
  'NEXT_PUBLIC_HJ_VERCEL_ENV',
  'NEXT_PUBLIC_HJ_VERCEL_URL',
  'NEXT_PUBLIC_HJ_BRANCH',
  'VERCEL_ENV', // injected by Vercel
  'VERCEL_GIT_COMMIT_SHA',
  'VERCEL_GIT_COMMIT_REF',
])

describe('.env.local.example completeness', () => {
  const sources = [join(ROOT, 'src'), join(ROOT, 'scripts')].flatMap(walk)

  const referenced = new Map<string, string[]>()
  for (const file of sources) {
    const src = readFileSync(file, 'utf-8')
    for (const name of envReads(parseSource(file, src))) {
      referenced.set(name, [...(referenced.get(name) ?? []), relative(ROOT, file)])
    }
  }

  it('finds env references to check', () => {
    expect(sources.length).toBeGreaterThan(20)
    expect(referenced.size).toBeGreaterThan(3)
  })

  /**
   * The reason for the parser, kept as a test so it survives the next person who finds
   * `envReads` verbose — the same convention the other two converted guardrails follow
   * (ADR 007).
   *
   * The old regex read `process.env.NEXT_PUBLIC_FOO` out of a **code comment explaining
   * Next's build-time inliner** and reported it as an undocumented variable. Through the
   * parser this cannot happen: a comment is never a node.
   */
  it('does not read a variable name out of a comment, which the old regex did', () => {
    const source = [
      '// Next substitutes process.env.NEXT_PUBLIC_FROM_A_COMMENT textually.',
      '/** Also process.env.NEXT_PUBLIC_FROM_A_BLOCK. */',
      'export const real = process.env.NEXT_PUBLIC_ACTUALLY_READ',
    ].join('\n')

    expect(envReads(parseSource('sample.ts', source))).toEqual(['NEXT_PUBLIC_ACTUALLY_READ'])
    expect([...source.matchAll(/process\.env\.([A-Z_][A-Z0-9_]*)/g)]).toHaveLength(3)
  })

  /**
   * A computed key has no statically knowable name, so reporting one would be a guess
   * dressed as a fact. `/api/version/route.ts` reads this way deliberately, to defeat
   * Next's inliner and observe the *runtime* environment.
   */
  it('reports nothing for a computed key rather than inventing a name', () => {
    const source = 'const v = (process.env as Record<string, string>)[name]'
    expect(envReads(parseSource('sample.ts', source))).toEqual([])
  })

  it('reads a bracketed string key, which is the same access spelled differently', () => {
    const source = "const v = process.env['SHOPIFY_STORE_DOMAIN']"
    expect(envReads(parseSource('sample.ts', source))).toEqual(['SHOPIFY_STORE_DOMAIN'])
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
