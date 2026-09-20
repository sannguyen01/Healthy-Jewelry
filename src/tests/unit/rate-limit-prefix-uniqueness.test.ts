import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve, relative } from 'node:path'
import ts from 'typescript'
import { parseSource, walk } from '@/lib/analysis/tsAstScan'

/**
 * **Every rate limiter owns its own bucket.**
 *
 * ## The test that could not see its own failure mode
 *
 * `shopify-proxy-buckets.test.ts` proves that a read flood cannot starve the
 * checkout, by driving requests through the route and counting refusals. It is a
 * good test and it is **blind to the most likely way this fix gets undone**:
 * giving the two limiters the same `prefix`.
 *
 * A mutation run showed it. Setting `hj:shopify:write` to `hj:shopify:read` left
 * all eight cases green — because with Upstash unconfigured, which is every test
 * environment, `createRateLimiter` returns the in-memory fallback, and each call
 * allocates its **own Map**. The prefix is read only on the Upstash path. So the
 * buckets are separate by construction in test and merged by configuration in
 * production, and no behavioural test run in CI can tell the difference.
 *
 * That is [ADR 020](../../../docs/adr/020-a-test-that-cannot-fail-is-documentation.md)
 * exactly, and the answer is not a better behavioural test — it is to check the
 * property that actually differs, statically, in the one place it is written
 * down.
 *
 * ## Why this scans the tree rather than the one route
 *
 * A collision between `/api/shopify`'s two limiters is the case that prompted
 * this, but it is not a special case. Six limiters exist across five files, and
 * any two sharing a prefix silently merge their budgets in production —
 * `/api/contact`'s 5/hour guard on a paid email API sharing with
 * `/api/analytics`' 120/minute would be the expensive version of the same
 * mistake. The property is "distinct bucket per policy", and it belongs to the
 * repository rather than to one route.
 *
 * Read through the TypeScript AST, never regex-matched: a pattern would count a
 * prefix written in a comment and miss one built from a constant
 * ([ADR 007](../../../docs/adr/007-regex-guardrails-have-unknown-coverage.md)).
 */

const ROOT = resolve(__dirname, '../../..')
const SRC = join(ROOT, 'src')

interface FoundPrefix {
  file: string
  line: number
  prefix: string
}

/** Every `.ts`/`.tsx` file under `src/`, excluding the tests themselves. */
function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      if (entry === 'tests' || entry === 'test' || entry === 'node_modules') continue
      sourceFiles(full, out)
      continue
    }
    if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(full)
  }
  return out
}

/**
 * Every `createRateLimiter({ … prefix: '…' })` in the tree, with its location.
 *
 * Matches on the callee name rather than on an import binding, so a renamed
 * import (`import { createRateLimiter as makeLimiter }`) would be missed — which
 * is why the count assertion below exists: it fails if the scanner stops finding
 * limiters that are known to be there.
 */
function declaredPrefixes(): FoundPrefix[] {
  const found: FoundPrefix[] = []

  for (const file of sourceFiles(SRC)) {
    const source = readFileSync(file, 'utf8')
    if (!source.includes('createRateLimiter')) continue

    const ast = parseSource(file, source)
    walk(ast, (node) => {
      if (
        !ts.isCallExpression(node) ||
        !ts.isIdentifier(node.expression) ||
        node.expression.text !== 'createRateLimiter'
      ) {
        return
      }
      const [arg] = node.arguments
      if (!arg || !ts.isObjectLiteralExpression(arg)) return

      for (const prop of arg.properties) {
        if (
          ts.isPropertyAssignment(prop) &&
          ts.isIdentifier(prop.name) &&
          prop.name.text === 'prefix' &&
          ts.isStringLiteralLike(prop.initializer)
        ) {
          found.push({
            file: relative(ROOT, file),
            line: ast.getLineAndCharacterOfPosition(prop.getStart(ast)).line + 1,
            prefix: prop.initializer.text,
          })
        }
      }
    })
  }

  return found
}

const prefixes = declaredPrefixes()

describe('rate-limiter prefixes', () => {
  it('finds the limiters that are known to exist', () => {
    // Guards the scanner rather than the code. A refactor that renames the
    // import, or moves a limiter into a factory, would silently reduce this to
    // zero and every assertion below would then pass vacuously — which is the
    // failure mode this whole file exists to remove, reappearing one level up.
    expect(
      prefixes.length,
      'the AST scan found no createRateLimiter calls with a literal prefix. Either every ' +
        'limiter was removed, or the scan stopped matching them — check the callee name ' +
        'and whether any prefix is now built from a constant rather than written inline.'
    ).toBeGreaterThanOrEqual(3)
  })

  it('every prefix is distinct', () => {
    const seen = new Map<string, FoundPrefix[]>()
    for (const entry of prefixes) {
      const list = seen.get(entry.prefix) ?? []
      list.push(entry)
      seen.set(entry.prefix, list)
    }

    const collisions = [...seen.entries()]
      .filter(([, entries]) => entries.length > 1)
      .map(
        ([prefix, entries]) =>
          `"${prefix}" declared at ${entries.map((e) => `${e.file}:${e.line}`).join(' and ')}`
      )

    expect(
      collisions,
      'Two rate limiters share a Redis key prefix, so they share a bucket. With Upstash ' +
        'unconfigured this is invisible — the in-memory fallback allocates a fresh Map per ' +
        'limiter and ignores the prefix entirely — so it will not show up in any test that ' +
        'drives requests through a route. In production the two budgets merge, and the ' +
        'cheaper traffic spends the expensive operation’s allowance.'
    ).toEqual([])
  })

  /*
   * '/api/shopify declares two different prefixes, not one' was here.
   *
   * It guarded the case that prompted this whole file: the proxy metered reads and writes
   * out of one bucket, so a browsing session could exhaust a customer's checkout budget.
   * The proxy is gone with the cart, and with it both limiters. The uniqueness rule below
   * still covers every limiter that remains — which is the part that generalises.
   */

  it('no prefix is empty or whitespace', () => {
    // An empty prefix is not a namespace, it is the absence of one — and every
    // limiter carrying it would key on the bare IP, merging all of them.
    const blank = prefixes.filter((p) => p.prefix.trim() === '')
    expect(blank, 'a limiter declares an empty prefix').toEqual([])
  })
})
