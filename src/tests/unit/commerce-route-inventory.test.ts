import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import {
  canonicalRoute,
  pageRoutes,
  routeHandlerPaths,
  type DirEntry,
} from '../support/parsers'

const { parseContract } = await import('../../../scripts/lib/commerce-contract.mjs')

/**
 * **The route inventory, reconciled against the three places it is really written.**
 *
 * ## The failure this refuses
 *
 * Contract §6 and §7 are a table in a Markdown file. A table is a claim, and this repository
 * has now shipped the same defect in five different registries: a document asserting a
 * behaviour nothing implemented, read by people who believed it
 * ([ADR 018](../../../docs/adr/018-a-claim-about-a-control-is-not-a-control.md)).
 *
 * For routes it is worse than usual, because the failure is silent in **both** directions:
 *
 * - A route on disk and absent from §6 is an endpoint nobody reviewed. It serves, it is
 *   indexed, and the inventory that was supposed to be exhaustive says nothing about it.
 * - A route in §7 with nothing implementing it is a retirement that never happened. The
 *   contract says `/discount/*` answers 410; the deployment answers 404; the document reads
 *   as a completed decommission.
 *
 * Neither shows up in a build, in a lint pass, or in a page render.
 *
 * ## Why three sources and not one
 *
 * The contract is the claim. The other two are the implementation, and they are *separate*
 * implementations that must agree: `next.config.ts` answers the 308s before a request ever
 * reaches the application, and the `route.ts` files under `src/app` answer the 410s inside
 * it. (Spelled out rather than globbed: a `**` followed by a slash closes a block comment,
 * and the error it produces names a line thirty lines below the real one.) A single
 * reconciliation against one of them would leave the other free to drift.
 *
 * `e2e/retired-routes.spec.ts` is the fourth source and the only one that proves any of this
 * over real HTTP — `toHaveURL()` and a rendered "Gone" both pass on a soft 200. It cannot run
 * here, so this asserts that every retired route **has** an assertion there, which is the
 * part that can be checked without a server.
 *
 * ## Why the config is imported rather than parsed
 *
 * `next.config.ts` exports a `redirects()` function. Calling it returns the same array Next
 * itself consumes, which makes this reconciliation exact. A regex over the source would have
 * unknown coverage ([ADR 007](../../../docs/adr/007-regex-guardrails-have-unknown-coverage.md))
 * and would quietly stop matching the day somebody builds the list with `.map()`.
 */

const ROOT = path.resolve(import.meta.dirname, '../../..')
const APP = path.join(ROOT, 'src/app')

const contract = parseContract(readFileSync(path.join(ROOT, 'COMMERCE-ELIMINATION-CONTRACT.md'), 'utf8'))

/** `readdirSync` behind the `ReadDir` shape `parsers.ts` walks with. */
const readAppDir = (relativePath: string): DirEntry[] =>
  readdirSync(path.join(APP, relativePath), { withFileTypes: true }).map((entry) => ({
    name: entry.name,
    isDirectory: entry.isDirectory(),
  }))

const canon = (routes: string[]) => routes.map(canonicalRoute).sort()

const filesystemPages = pageRoutes(readAppDir)
const filesystemHandlers = routeHandlerPaths(readAppDir)

const nextConfig = (await import('../../../next.config')).default as {
  redirects: () => Promise<{ source: string; destination: string; permanent?: boolean }[]>
}
const redirects = await nextConfig.redirects()

const approved = contract.routesApproved as { route: string; kind: string; status: number }[]
const forbidden = contract.routesForbidden as {
  route: string
  status: number
  location: string | null
  why: string
}[]

/**
 * Routes that exist, serve, and are deliberately not in §6.
 *
 * One entry, and it needs its reason in code rather than only in the contract's prose,
 * because this is the list a future contributor will be tempted to add to.
 */
const NOT_PUBLIC = new Map([
  [
    '/api/webhooks/shopify',
    'answers only to an HMAC-signed delivery, so it is not a public route. It is in the ' +
      'register under WS-F, retained until the Shopify subscriptions are deleted — removing ' +
      'the endpoint first leaves Shopify retrying a failing route for its full backoff ' +
      'schedule.',
  ],
])

describe('the inventory is reading something', () => {
  /*
   * Guard on the guard, first, because every assertion below is a set comparison and a set
   * comparison against an empty set is the cheapest green in testing. A broken `readdirSync`
   * path, a renamed contract section, a `redirects()` that throws — each would make this file
   * pass while checking nothing.
   */
  it('finds pages, handlers, redirects and contract rows', () => {
    expect(filesystemPages.length, 'no page routes found under src/app').toBeGreaterThan(10)
    expect(filesystemHandlers.length, 'no route handlers found').toBeGreaterThan(5)
    expect(redirects.length, 'next.config.ts declares no redirects').toBeGreaterThan(5)
    expect(approved.length, '§6 is empty').toBeGreaterThan(10)
    expect(forbidden.length, '§7 is empty').toBeGreaterThan(10)
  })

  it('canonicalises the three notations onto one', () => {
    expect(canonicalRoute('/orders/[[...path]]')).toBe('/orders/*')
    expect(canonicalRoute('/orders/:path*')).toBe('/orders/*')
    expect(canonicalRoute('/shop/[collection]')).toBe('/shop/:collection')
    // Named single segments stay distinguishable — erasing the name would make
    // /shop/[collection] and /products/[handle] compare equal, which is the mistake that
    // makes a reconciliation look green while comparing the wrong pair.
    expect(canonicalRoute('/products/[handle]')).not.toBe(canonicalRoute('/shop/[collection]'))
  })
})

describe('§6 — the approved route inventory matches the filesystem', () => {
  const approvedPages = canon(approved.filter((r) => r.kind === 'page').map((r) => r.route))
  const approvedHandlers = canon(approved.filter((r) => r.kind === 'route').map((r) => r.route))

  it('every page on disk is approved, and every approved page exists', () => {
    expect(canon(filesystemPages)).toEqual(approvedPages)
  })

  it('every handler on disk is either approved, retired, or named as non-public', () => {
    const retired = new Set(canon(forbidden.map((r) => r.route)))
    const ok = new Set([...approvedHandlers, ...retired, ...canon([...NOT_PUBLIC.keys()])])

    const unaccounted = canon(filesystemHandlers).filter((r) => !ok.has(r))
    expect(
      unaccounted,
      'a route handler serves these paths and the contract does not mention them. An ' +
        'endpoint absent from the inventory is one nobody reviewed.'
    ).toEqual([])
  })

  it('every approved handler exists on disk', () => {
    const onDisk = new Set(canon(filesystemHandlers))
    const missing = approvedHandlers.filter((r) => !onDisk.has(r))
    expect(missing, '§6 approves routes that nothing serves').toEqual([])
  })

  it('every approved route declares a status a browser can receive', () => {
    for (const row of approved) {
      expect(row.status, `${row.route}: ${row.status} is not a success status`).toBeGreaterThanOrEqual(200)
      expect(row.status, `${row.route}`).toBeLessThan(300)
      expect(['page', 'route'], `${row.route}: unknown kind \`${row.kind}\``).toContain(row.kind)
    }
  })

  it('names why each non-public handler is excluded', () => {
    // A path excluded from the public inventory with no stated reason is an exemption
    // nobody can audit. The reason lives here so that deleting the route deletes the excuse.
    for (const [route, why] of NOT_PUBLIC) {
      expect(canon(filesystemHandlers), `${route} is excluded but does not exist`).toContain(
        canonicalRoute(route)
      )
      expect(why.length, `${route}: the reason is too short to be one`).toBeGreaterThan(40)
    }
  })
})

describe('§7 — the forbidden route inventory matches what answers', () => {
  const redirectRows = forbidden.filter((r) => r.status === 308)
  const goneRows = forbidden.filter((r) => r.status === 410)
  const absentRows = forbidden.filter((r) => r.status === 404)

  it('declares all three kinds of retirement', () => {
    // If any of the three groups emptied, the describe below it would pass vacuously. This
    // is where that would show.
    expect(redirectRows.length).toBeGreaterThan(5)
    expect(goneRows.length).toBeGreaterThan(3)
    expect(absentRows.length).toBeGreaterThan(2)
  })

  it('every declared 308 is a real redirect, to the declared destination', () => {
    const configured = new Map(redirects.map((r) => [canonicalRoute(r.source), r]))
    for (const row of redirectRows) {
      const key = canonicalRoute(row.route)
      const actual = configured.get(key)
      expect(actual, `${row.route} is declared a 308 and next.config.ts has no rule for it`).toBeDefined()
      expect(actual!.destination, `${row.route} redirects somewhere else`).toBe(row.location)
      // `permanent: true` is Next's spelling of 308. A 307 would let a crawler keep the old
      // URL indefinitely, which defeats the point of retiring it.
      expect(actual!.permanent, `${row.route} is not permanent`).toBe(true)
    }
  })

  it('every redirect in next.config.ts is declared in §7', () => {
    // The other direction. A redirect nobody wrote down is a routing rule that can silently
    // swallow a live page — the failure the E2E suite's "the routes that stay, stay" test
    // exists for, caught here without a server.
    const declared = new Set(redirectRows.map((r) => canonicalRoute(r.route)))
    const undeclared = redirects.map((r) => r.source).filter((s) => !declared.has(canonicalRoute(s)))
    expect(undeclared, 'next.config.ts redirects these and the contract does not say so').toEqual([])
  })

  it('every declared 410 has a route handler, because a page cannot set a status', () => {
    const onDisk = new Set(canon(filesystemHandlers))
    for (const row of goneRows) {
      expect(
        onDisk.has(canonicalRoute(row.route)),
        `${row.route} is declared 410 and no route.ts serves it. A page.tsx cannot set a ` +
          `status — it renders, and Next answers 200, which is a soft 404 that crawlers index.`
      ).toBe(true)
    }
  })

  it('every declared 410 answers with goneRoute rather than its own copy', () => {
    /*
     * Four hand-rolled `Response` objects is four places for `X-Robots-Tag` to go missing
     * from one — a failure that breaks nothing, renders correctly, and leaves one withdrawn
     * capability indexable. Asserting the shared builder is used is how that stops being
     * possible; `goneResponse.test.ts` then only has to be right once.
     */
    for (const row of goneRows) {
      const dir = canonicalRoute(row.route).replace('/*', '/[[...path]]')
      const candidates = [
        path.join(APP, dir, 'route.ts'),
        path.join(APP, canonicalRoute(row.route), 'route.ts'),
      ]
      const source = candidates.map((f) => { try { return readFileSync(f, 'utf8') } catch { return null } }).find(Boolean)
      expect(source, `${row.route}: no route.ts found at ${candidates.join(' or ')}`).toBeTruthy()
      expect(source!, `${row.route} does not use the shared 410 builder`).toMatch(
        /goneRoute\(/
      )
    }
  })

  it('every declared 404 is a route nothing serves and nothing redirects', () => {
    /*
     * The one direction that is checked by *absence*, and therefore the one most likely to
     * rot. `/api/shopify` and the OAuth callbacks were real endpoints; the contract says
     * they now answer 404, and the only way that stays true is if nothing re-creates them.
     */
    const served = new Set([...canon(filesystemPages), ...canon(filesystemHandlers)])
    const redirected = new Set(redirects.map((r) => canonicalRoute(r.source)))
    for (const row of absentRows) {
      const key = canonicalRoute(row.route)
      expect(served.has(key), `${row.route} is declared 404 and something serves it`).toBe(false)
      expect(redirected.has(key), `${row.route} is declared 404 and something redirects it`).toBe(false)
    }
  })

  it('no route is both approved and forbidden', () => {
    const approvedSet = new Set(canon(approved.map((r) => r.route)))
    const both = canon(forbidden.map((r) => r.route)).filter((r) => approvedSet.has(r))
    expect(both, 'a route cannot both serve and be retired').toEqual([])
  })

  it('every forbidden route states a reason', () => {
    for (const row of forbidden) {
      expect(row.why.length, `${row.route}: no reason given`).toBeGreaterThan(20)
    }
  })

  it('a 410 declares no destination and a 308 declares one', () => {
    // The distinction the whole section rests on: a redirect says *this moved*, and 410 says
    // *this was withdrawn*. A 410 with a Location, or a 308 without one, is a row whose
    // author had not decided which they meant.
    for (const row of goneRows) expect(row.location, `${row.route}`).toBe(null)
    for (const row of redirectRows) expect(row.location, `${row.route}`).toBeTruthy()
  })
})

describe('§7 is asserted over HTTP somewhere', () => {
  /*
   * This file proves the routes are *configured*. Only a real request proves they *answer* —
   * the whole reason `e2e/retired-routes.spec.ts` reads `.status()` with `maxRedirects: 0`
   * rather than calling `.click()` and looking at the page.
   *
   * So the last reconciliation is between the contract and that spec: a retired route with
   * no E2E assertion is one whose behaviour nothing has ever observed. Read from source
   * rather than imported, because importing it would execute `test.describe` outside the
   * Playwright runner.
   */
  const spec = readFileSync(path.join(ROOT, 'e2e/retired-routes.spec.ts'), 'utf8')
  const asserted = new Set(
    [...spec.matchAll(/path:\s*'([^']+)'/g)].map((m) => m[1])
  )

  it('reads the spec', () => {
    expect(asserted.size, 'no paths parsed out of e2e/retired-routes.spec.ts').toBeGreaterThan(10)
  })

  it('every forbidden family has at least one concrete path asserted', () => {
    const missing: string[] = []
    for (const row of forbidden) {
      const key = canonicalRoute(row.route)
      const prefix = key.replace(/\/\*$/, '')
      const covered = [...asserted].some((p) => {
        const c = canonicalRoute(p)
        return key.endsWith('/*') ? c === prefix || c.startsWith(`${prefix}/`) : c === key
      })
      if (!covered) missing.push(row.route)
    }
    expect(
      missing,
      'these are retired in the contract and no E2E test ever requests one. A retirement ' +
        'nothing observes is a retirement nobody has seen happen.'
    ).toEqual([])
  })
})
