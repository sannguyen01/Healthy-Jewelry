import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { join } from 'node:path'
import ts from 'typescript'
import { parseSource, walk } from '@/lib/analysis/tsAstScan'
import { CLAIM_WITHDRAWAL_BOUND_SECONDS } from '@/lib/catalog/claims-schema'

const {
  EXPERIMENT_CLAIM_ID,
  inlineText,
  isoDay,
  judgeExpiry,
  withExpiringApproval,
  wordingOn,
} = await import('../../../scripts/lib/claim-expiry.mjs')

/**
 * **An expired claim must leave the page a visitor is served — within a stated bound.**
 *
 * `claims-registry.test.ts` proves `resolveClaim()` returns the fallback once an approval has
 * lapsed. It could not prove *when* a page calls it, and for a prerendered page the answer was
 * "at build": `scripts/experiment-claim-expiry.mjs` built `228fdaf` with an approval expiring
 * that day, served it with the clock two days on, and got the expired wording back on eight
 * cache HITs out of eight, in the hero, the `<meta>` description and every Footer.
 *
 * The fix is a revalidation bound on the claim-bearing segments. Next reads segment config as
 * literals, so the number is written in two route files; this file holds each to the one
 * constant, and puts the experiment's verdict on fixtures so every branch of it has been seen.
 */

const ROOT = process.cwd()

/** The numeric literal a module exports as `revalidate`, or null — read from the AST, not a regex. */
function exportedRevalidate(rel: string): number | null {
  const sf = parseSource(rel, readFileSync(join(ROOT, rel), 'utf8'))
  let found: number | null = null
  walk(sf, (node) => {
    if (!ts.isVariableStatement(node)) return
    const exported = node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
    if (!exported) return
    for (const decl of node.declarationList.declarations) {
      if (ts.isIdentifier(decl.name) && decl.name.text === 'revalidate' && decl.initializer && ts.isNumericLiteral(decl.initializer)) {
        found = Number(decl.initializer.text)
      }
    }
  })
  return found
}

describe('the claim-bearing segments re-render within the stated bound', () => {
  it('states a bound shorter than the granularity of an approval', () => {
    // An approval lapses at the end of a UTC day. A bound of a day or more would let an expired
    // claim be served for most of the next one.
    expect(CLAIM_WITHDRAWAL_BOUND_SECONDS).toBeGreaterThan(0)
    expect(CLAIM_WITHDRAWAL_BOUND_SECONDS).toBeLessThan(86_400)
  })

  it.each(['src/app/layout.tsx', 'src/app/opengraph-image.tsx'])('%s exports revalidate equal to the bound', (rel) => {
    expect(exportedRevalidate(rel), `${rel} has no literal \`export const revalidate\``).toBe(
      CLAIM_WITHDRAWAL_BOUND_SECONDS
    )
  })
})

describe('the experiment fixture', () => {
  const registry = JSON.parse(readFileSync(join(ROOT, 'src/content/claims/claims.json'), 'utf8'))
  const now = new Date('2026-09-27T10:00:00Z')

  it('approves the one claim from yesterday until the end of today, and names itself', () => {
    const next = withExpiringApproval(registry, now) as {
      claims: { id: string; decision: unknown; evidence: { documentId: string; appliesTo: { materials: string[] } }[] }[]
    }
    const claim = next.claims.find((c) => c.id === EXPERIMENT_CLAIM_ID)!
    expect(claim.decision).toEqual({
      state: 'approved',
      reviewer: 'Claim-expiry experiment fixture',
      decidedOn: '2026-09-26',
      expiresOn: '2026-09-27',
    })
    expect(claim.evidence[0].documentId).toMatch(/NOT-EVIDENCE/)
    expect(claim.evidence[0].appliesTo.materials.sort()).toEqual(['niobium', 'surgical-steel', 'titanium'])
  })

  it('changes nothing else in the registry, and never the file on disk', () => {
    const next = withExpiringApproval(registry, now)
    const others = (r: { claims: { id: string }[] }) => r.claims.filter((c) => c.id !== EXPERIMENT_CLAIM_ID)
    expect(others(next)).toEqual(others(registry))
    // The repository's own registry is untouched by construction: every record stays pending.
    for (const c of registry.claims as { id: string; decision: { state: string } }[]) {
      expect(c.decision.state, c.id).toBe('pending')
    }
  })

  it('refuses a registry without the claim rather than approving nothing', () => {
    expect(() => withExpiringApproval({ claims: [] }, now)).toThrow(/no "brand-positioning"/)
  })

  it('formats days in UTC', () => {
    expect(isoDay(new Date('2026-09-27T23:59:59Z'))).toBe('2026-09-27')
  })
})

describe('finding the wording on a served page', () => {
  const wording = 'Metal that\nworks with\nyour body.'
  const page = (body: string) => `<html><head>${body}</head><body></body></html>`

  it('reads it across a multi-line heading, in metadata and in JSON-LD', () => {
    expect(inlineText(wording)).toBe('Metal that works with your body.')
    const html =
      '<html><head><meta name="description" content="Metal that works with your body. More."/>' +
      '<script type="application/ld+json">{"description":"Metal that works with your body."}</script></head>' +
      '<body><h1><span>Metal that</span><br/><span>works with</span> <span>your body.</span></h1></body></html>'
    expect(wordingOn(html, wording)).toEqual({ visible: true, metadata: true, jsonLd: true })
  })

  it('does not count the fallback, or a script payload, as visible wording', () => {
    expect(wordingOn(page('<title>Metal, named exactly.</title>'), wording).visible).toBe(false)
    expect(wordingOn('<script>self.__next_f.push("Metal that works with your body.")</script>', wording)).toEqual({
      visible: false,
      metadata: false,
      jsonLd: false,
    })
  })
})

describe('judgeExpiry — every verdict from a fixture', () => {
  const on = { visible: true, metadata: true, jsonLd: false }
  const off = { visible: false, metadata: false, jsonLd: false }

  it('FAIL when a surface that carried the wording still carries it on the last attempt', () => {
    const result = judgeExpiry({ baseline: { '/': on }, attempts: { '/': [{ ...on, cache: 'HIT' }, { ...on, cache: 'HIT' }] } })
    expect(result.verdict).toBe('FAIL')
    expect(result.lingering).toEqual([
      { path: '/', surface: 'visible', attempts: 2 },
      { path: '/', surface: 'metadata', attempts: 2 },
    ])
  })

  it('PASS when every carried surface lets go, recording the attempt it did — stale first request included', () => {
    const result = judgeExpiry({ baseline: { '/': on }, attempts: { '/': [{ ...on, cache: 'STALE' }, { ...off, cache: 'HIT' }] } })
    expect(result).toMatchObject({ verdict: 'PASS', withdrawnAt: { '/ visible': 2, '/ metadata': 2 } })
  })

  it('unevaluable when the baseline never showed the wording — absence afterwards would prove nothing', () => {
    expect(judgeExpiry({ baseline: { '/': off }, attempts: { '/': [off] } })).toMatchObject({
      verdict: 'unevaluable',
      reason: 'fixture-never-rendered',
    })
  })

  it('FAIL, not PASS, when a carried page was never requested after the shift', () => {
    expect(judgeExpiry({ baseline: { '/': on }, attempts: {} }).verdict).toBe('FAIL')
  })

  it('ignores surfaces the claim never reached', () => {
    const result = judgeExpiry({ baseline: { '/about': { visible: true, metadata: false, jsonLd: false } }, attempts: { '/about': [off] } })
    expect(result.carried).toEqual([{ path: '/about', surface: 'visible' }])
    expect(result.verdict).toBe('PASS')
  })
})

/**
 * **The experiment's clock moves both clocks, and only after the jump.**
 *
 * Its first version moved `Date` alone, on the reasoning that `performance` measures durations.
 * Next's cache judges age with `performance.timeOrigin + performance.now()`, so no time passed
 * for the cache and the experiment reported FAIL for a build whose bound was correct. Run in a
 * real child process, because a preload is a process-level fact and an in-process stub of it
 * would test the stub.
 */
describe('scripts/experiments/shift-clock.mjs', () => {
  const preload = pathToFileURL(join(ROOT, 'scripts/experiments/shift-clock.mjs')).href
  const DAY = 86_400_000
  const read = (env: Record<string, string>) => {
    const out = spawnSync(
      process.execPath,
      ['--import', preload, '-e', 'console.log(JSON.stringify({ date: Date.now(), ctor: new Date().getTime(), perf: performance.timeOrigin + performance.now() }))'],
      { env: { ...process.env, ...env }, encoding: 'utf8' }
    )
    expect(out.status, out.stderr).toBe(0)
    return JSON.parse(out.stdout) as { date: number; ctor: number; perf: number }
  }

  it('moves Date and the performance clock together once the jump has passed', () => {
    const before = Date.now()
    const t = read({ HJ_CLOCK_SHIFT_MS: String(DAY), HJ_CLOCK_JUMP_AT_MS: '0' })
    for (const value of [t.date, t.ctor, t.perf]) {
      expect(value - before).toBeGreaterThan(DAY - 60_000)
      expect(value - before).toBeLessThan(DAY + 60_000)
    }
  })

  it('leaves both clocks alone before the jump', () => {
    const before = Date.now()
    const t = read({ HJ_CLOCK_SHIFT_MS: String(DAY), HJ_CLOCK_JUMP_AT_MS: String(before + 10 * 60_000) })
    for (const value of [t.date, t.ctor, t.perf]) expect(Math.abs(value - before)).toBeLessThan(60_000)
  })
})

