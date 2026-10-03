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
 * implementations that must agree: `next.config.ts` may answer a redirect before a request
 * ever reaches the application, and the `route.ts` files under `src/app` answer inside it.
 * Since 2026-09-27 every §7 308 is a `route.ts` too — `retiredRoute()` answers GET and HEAD
 * with the redirect and every other method with the 410 page, because a config redirect
 * answers a stale POST with a 308 and the client repeats the POST at the successor. So the
 * 308 check below **calls each handler** rather than reading its source: it asks what the
 * route answers, which is the only question a regex over a file could get wrong
 * ([ADR 007](../../../docs/adr/007-regex-guardrails-have-unknown-coverage.md)). (Spelled out rather than globbed: a `**` followed by a slash closes a block comment,
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
  redirects?: () => Promise<{ source: string; destination: string; permanent?: boolean }[]>
}
/** Empty today: every §7 redirect is a route handler. Kept so a config redirect is still reconciled. */
const redirects = (await nextConfig.redirects?.()) ?? []

/**
 * Which on-disk handler Next would dispatch a concrete path to — a small model of the App
 * Router's matching, enough for this tree: a static segment beats a dynamic one, `[x]` is one
 * segment, `[...x]` one or more, `[[...x]]` zero or more. Used both ways: a 308 row must be
 * served by the handler that owns it, and a 404 row must be served by none.
 */
function handlerFor(concrete: string): string | null {
  const segments = concrete.split('/').filter(Boolean)
  const score = (raw: string): number | null => {
    const parts = raw.split('/').filter(Boolean)
    let points = 0
    for (let i = 0; i < parts.length; i += 1) {
      const part = parts[i]
      if (part.startsWith('[[...')) return i <= segments.length ? points : null
      if (part.startsWith('[...')) return i < segments.length ? points : null
      if (i >= segments.length) return null
      if (part.startsWith('[')) continue
      if (part !== segments[i]) return null
      points += 1
    }
    return parts.length === segments.length ? points + 1 : null
  }
  let best: string | null = null
  let bestScore = -1
  for (const raw of filesystemHandlers) {
    const s = score(raw)
    if (s !== null && s > bestScore) {
      best = raw
      bestScore = s
    }
  }
  return best
}

/** One concrete request path for a §7 row: the route itself, or a path beneath its family. */
const concretePathOf = (route: string) => (route.includes(':path*') ? route.replace('/:path*', '/add') : route)

/** The handler module at an on-disk route, loaded through the same alias the app uses. */
async function loadHandler(raw: string) {
  return (await import(/* @vite-ignore */ `@/app${raw}/route`)) as Record<string, (r: Request) => Response>
}

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
    // No `redirects.length` floor any more: the §7 308s are route handlers, and the config
    // declaring none is the expected state. The 308 check below has its own guard.
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

  it('every declared 308 redirects GET and HEAD to its destination, and answers a stale action 410', async () => {
    /*
     * Asked of the handler, not of its source. Each row is resolved to the handler Next would
     * dispatch a concrete path of it to, and that handler is called: GET and HEAD must be a
     * permanent redirect to the declared location — 308, never 307, which would let a crawler
     * keep the old URL indefinitely — and POST must be the 410 page. A config redirect is
     * still accepted for GET, but it cannot pass the POST half: it answers every method with
     * the 308, which is how a multipart product form ended on "Server action not found.".
     */
    const configured = new Map(redirects.map((r) => [canonicalRoute(r.source), r]))
    let checked = 0
    for (const row of redirectRows) {
      const concrete = concretePathOf(row.route)
      const raw = handlerFor(concrete)
      expect(
        raw,
        `${row.route} is declared a 308 and no route handler serves ${concrete}` +
          (configured.has(canonicalRoute(row.route))
            ? ' — next.config.ts redirects it, and a config redirect answers a stale POST with a 308 too'
            : '')
      ).not.toBeNull()
      const handler = await loadHandler(raw!)
      for (const method of ['GET', 'HEAD'] as const) {
        const response = handler[method](new Request(`http://origin${concrete}?utm_source=x`, { method }))
        expect(response.status, `${method} ${concrete} (${raw})`).toBe(308)
        expect(response.headers.get('location'), `${method} ${concrete} redirects somewhere else`).toBe(
          `${row.location}?utm_source=x`
        )
        // A handler is a function where a config redirect was an edge rule; the edge may only
        // answer repeats itself if the response says it can.
        expect(response.headers.get('cache-control'), `${method} ${concrete} is not edge-cacheable`).toMatch(/s-maxage=\d+/)
      }
      const post = handler.POST(new Request(`http://origin${concrete}`, { method: 'POST' }))
      expect(post.status, `a stale POST to ${concrete} is not the 410 page`).toBe(410)
      expect(post.headers.get('x-robots-tag'), `POST ${concrete}`).toMatch(/noindex/i)
      checked += 1
    }
    expect(checked, 'no 308 row was checked').toBe(redirectRows.length)
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
      // And no catch-all swallows it: a `[[...path]]` one level up would serve it without its
      // canonical spelling ever appearing on disk.
      expect(handlerFor(concretePathOf(row.route)), `${row.route} is declared 404 and a handler matches it`).toBeNull()
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
   * So the last reconciliation is between the contract and that spec, and it runs both
   * ways. Contract → spec: a retired route with no E2E assertion is one whose behaviour
   * nothing has ever observed. Spec → contract: a literal case whose status or location
   * disagrees with §7 is the spec asserting a *different* contract, and until 2026-09-26
   * only the path was compared — the spec could have said `/cart` answers 410 while §7
   * said 308, and whichever the server did, one of the two documents was wrong and nothing
   * said which. Now each literal's `status` and `location` must equal its family's.
   *
   * The generated matrix in the same spec reads §7 directly and so cannot disagree with
   * it; these literals are the hand-written half, and the half that needs checking. Read
   * from source rather than imported, because importing the spec would execute
   * `test.describe` outside the Playwright runner. The family matcher is the one the matrix
   * generator uses (`e2e/support/routeMatrix.ts`), so the two cannot pick different rows,
   * loaded per test because this block may not add a top-level import.
   */
  const spec = readFileSync(path.join(ROOT, 'e2e/retired-routes.spec.ts'), 'utf8')
  const asserted = new Set(
    [...spec.matchAll(/path:\s*'([^']+)'/g)].map((m) => m[1])
  )
  /** The literal cases that declare an answer: `{ path, status, location }`, in that order. */
  const cases = [
    ...spec.matchAll(/path:\s*'([^']+)',\s*status:\s*(\d+),\s*location:\s*(?:'([^']+)'|null)\s*,/g),
  ].map((m) => ({ path: m[1], status: Number(m[2]), location: m[3] ?? null }))
  const familyOf = async () => (await import('../../../e2e/support/routeMatrix')).familyOf

  it('reads the spec', () => {
    expect(asserted.size, 'no paths parsed out of e2e/retired-routes.spec.ts').toBeGreaterThan(10)
    // If the case regex stopped matching the table's shape, every check below would pass
    // on an empty list. The table has 20 answered rows today.
    expect(cases.length, 'no { path, status, location } cases parsed out of the spec').toBeGreaterThanOrEqual(19)
  })

  it('every forbidden family has at least one concrete path asserted', async () => {
    const match = await familyOf()
    const missing = forbidden
      .filter((row) => !cases.some((c) => match(c.path, forbidden)?.route === row.route))
      .map((row) => row.route)
    expect(
      missing,
      'these are retired in the contract and no E2E test ever requests one. A retirement ' +
        'nothing observes is a retirement nobody has seen happen.'
    ).toEqual([])
  })

  it('every literal case belongs to a §7 family and declares exactly its answer', async () => {
    const match = await familyOf()
    const disagreements: string[] = []
    for (const c of cases) {
      const row = match(c.path, forbidden)
      if (!row) {
        disagreements.push(`${c.path}: no §7 row governs it — retire it in the contract first`)
        continue
      }
      if (row.status !== c.status || row.location !== c.location) {
        disagreements.push(
          `${c.path}: spec says ${c.status} ${c.location ?? '—'}, §7 (${row.route}) says ` +
            `${row.status} ${row.location ?? '—'}`
        )
      }
    }
    expect(
      disagreements,
      'The spec and the contract describe different retirements. Fix whichever is wrong — ' +
        'the contract is the decision, so the spec usually follows it.'
    ).toEqual([])
  })

  it('a path the spec asserts without a declared answer is not a retired route', async () => {
    // The unknown-handle 404s share the `path:` shape but declare no status, because they
    // are §6 routes answering for data they do not hold. A retired path written that way
    // would escape the comparison above, so it must not be one.
    const match = await familyOf()
    const answered = new Set(cases.map((c) => c.path))
    const unanswered = [...asserted].filter((p) => !answered.has(p))
    expect(unanswered.length, 'expected the unknown-handle cases here').toBeGreaterThan(0)
    expect(unanswered.filter((p) => match(p, forbidden) !== null)).toEqual([])
  })
})
