import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

/**
 * **An exception is a claim, and a claim needs a probe.**
 *
 * `e2e/COVERAGE.md` lists the routes no E2E spec visits, each with a reason.
 * `spec-anchor-contract.test.ts` already enforces the hard part of that
 * contract: every route is either visited or listed, a listed route that *is*
 * visited fails, and there is no third option.
 *
 * What nothing checked is whether the reasons are true. Every line reads like
 * this:
 *
 * > `/api/revalidate — Verified by src/tests/unit/api-revalidate-route.test.ts,
 * > which exercises the secret check and the cache-tag contract directly.`
 *
 * That sentence is doing real work — it is the argument for why a route with no
 * browser coverage is nevertheless covered — and it was pure prose. Delete the
 * file it names and the manifest still reads as a complete justification while
 * the route it excuses has become genuinely uncovered. Rename it and the same.
 * This is [ADR 018](../../../docs/adr/018-a-claim-about-a-control-is-not-a-control.md)
 * applied to the one document in the repository whose entire purpose is to say
 * "covered elsewhere".
 *
 * Nearly happened in this review's own branch: deleting the orphaned
 * `/api/search` route meant deleting its exception line, and had the line been
 * left behind pointing at a handler that no longer existed, nothing would have
 * said so.
 *
 * ## What this checks, and what it deliberately does not
 *
 * Each exception must name at least one test file; every file it names must
 * exist; and each of those files must mention the route it claims to cover.
 * That last one is the difference between "a test file exists" and "a test file
 * about this". It cannot prove the assertions inside are meaningful — that is
 * the fossil question, and `scripts/probe-assertion-liveness.mjs` answers it.
 */

const ROOT = resolve(__dirname, '../../..')
const MANIFEST = join(ROOT, 'e2e/COVERAGE.md')

interface Exception {
  route: string
  reason: string
  line: number
}

/** The `coverage-exceptions` fenced block, parsed into `route — why not` pairs. */
function exceptions(): Exception[] {
  const text = readFileSync(MANIFEST, 'utf8')
  const lines = text.split('\n')
  const start = lines.findIndex((l) => l.trim() === '```coverage-exceptions')
  if (start === -1) return []

  const out: Exception[] = []
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i]
    if (line.trim().startsWith('```')) break
    if (!line.trim()) continue

    // The separator is an em dash, matching the manifest's own stated format.
    const split = line.indexOf('—')
    if (split === -1) continue
    out.push({
      route: line.slice(0, split).trim(),
      reason: line.slice(split + 1).trim(),
      line: i + 1,
    })
  }
  return out
}

/** Every test/spec path a reason names. */
function citedFiles(reason: string): string[] {
  return [...reason.matchAll(/(?:src\/tests|e2e|scripts)\/[\w./-]*\.(?:test\.tsx?|spec\.ts|mjs)/g)].map(
    (m) => m[0]
  )
}

const parsed = exceptions()

describe('the coverage manifest parses at all', () => {
  it('finds the coverage-exceptions block and some entries in it', () => {
    // Guards the parser, not the manifest. A fence that gets renamed silently
    // empties this list and every assertion below then passes vacuously —
    // which is the exact failure shape the rest of this file exists to refuse.
    expect(
      parsed.length,
      'No entries parsed out of e2e/COVERAGE.md. Either every exception was removed, or ' +
        'the ```coverage-exceptions fence or the "route — reason" separator changed shape ' +
        'and this check is now reading nothing.'
    ).toBeGreaterThan(0)
  })

  it('every entry names a route that starts with a slash', () => {
    const malformed = parsed.filter((e) => !e.route.startsWith('/'))
    expect(malformed.map((e) => `${e.line}: ${e.route}`)).toEqual([])
  })
})

describe('every exception cites evidence, and the evidence exists', () => {
  it('each reason names at least one test file', () => {
    // A reason with no citation is an opinion. It may be a perfectly good one,
    // and it is still not something a future reader can check.
    const uncited = parsed.filter((e) => citedFiles(e.reason).length === 0)
    expect(
      uncited.map((e) => `${e.route} (line ${e.line}): ${e.reason}`),
      'A coverage exception gives a reason that names no test file. The manifest exists ' +
        'to say "covered elsewhere" — without naming where, it says "uncovered, and we ' +
        'have made our peace with it", which is a different decision needing a different ' +
        'sentence.'
    ).toEqual([])
  })

  it('every cited file exists on disk', () => {
    const missing: string[] = []
    for (const entry of parsed) {
      for (const file of citedFiles(entry.reason)) {
        if (!existsSync(join(ROOT, file))) missing.push(`${entry.route} cites ${file}`)
      }
    }
    expect(
      missing,
      'A coverage exception cites a test file that does not exist. The route it excuses ' +
        'has no browser coverage and now no unit coverage either, while the manifest ' +
        'still reads as a complete justification.'
    ).toEqual([])
  })

  it('every cited file actually mentions the route it vouches for', () => {
    // The difference between "a test file exists" and "a test file about this".
    // A citation pointing at a real but unrelated file is the shape a
    // copy-pasted exception takes, and it is indistinguishable from a correct
    // one by existence alone.
    const unrelated: string[] = []
    for (const entry of parsed) {
      for (const file of citedFiles(entry.reason)) {
        const full = join(ROOT, file)
        if (!existsSync(full)) continue
        const source = readFileSync(full, 'utf8')
        // The route path itself, or the handler module it maps to — a route
        // test usually imports `@/app/api/foo/route` rather than writing '/api/foo'.
        const asImport = `app${entry.route}/route`
        if (!source.includes(entry.route) && !source.includes(asImport)) {
          unrelated.push(`${entry.route} cites ${file}, which never mentions it`)
        }
      }
    }
    expect(unrelated).toEqual([])
  })
})

describe('the manifest does not excuse a route twice', () => {
  it('each route appears at most once', () => {
    const seen = new Map<string, number[]>()
    for (const entry of parsed) {
      seen.set(entry.route, [...(seen.get(entry.route) ?? []), entry.line])
    }
    const duplicated = [...seen.entries()]
      .filter(([, lines]) => lines.length > 1)
      .map(([route, lines]) => `${route} at lines ${lines.join(', ')}`)

    // Two entries for one route means two reasons, and a reader has no way to
    // know which one is current — so the stale one is load-bearing until
    // somebody guesses.
    expect(duplicated).toEqual([])
  })
})
