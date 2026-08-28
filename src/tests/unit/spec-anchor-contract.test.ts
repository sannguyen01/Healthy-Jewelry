import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { parseSource } from '@/lib/analysis/tsAstScan'
import { collectGotoAnchors, routeOf } from '@/lib/analysis/specAnchors'

/**
 * **Every spec navigates to something that still exists, and every route is covered or
 * excluded on the record.**
 *
 * ## The fossil
 *
 * `e2e/contact.spec.ts` asserted a `{ success: true }` contract that PR #32 had deleted
 * 17 days earlier. It kept passing — for the wrong reason — so the contact form's real
 * success path had zero coverage for that entire window, invisible because the test
 * looked green. Fixed in PR #39; the class it belonged to was not.
 *
 * A fossil is not a failing test. It is a test whose signal has stopped carrying
 * information, and nothing about a green run distinguishes the two.
 *
 * ## Why not compare modification dates
 *
 * The obvious forcing function — compare each spec's mtime against the route it
 * exercises — was measured against this suite before being rejected. `e2e/shop.spec.ts`
 * is 24 days behind `globals.css` and is perfectly healthy, while `contact.spec.ts` was
 * *newer* than its route for most of its fossil period. Timestamps produce noise exactly
 * where information is needed.
 *
 * Three tiers replace it, strongest first. This file is the two structural ones:
 *
 * 1. **Anchor resolution** — a spec that navigates to a deleted route fails immediately
 *    rather than passing on a 404 page. Playwright will happily `goto` a 404, and every
 *    assertion phrased as "a heading is visible" or "the status is not 500" still passes
 *    there.
 * 2. **Coverage manifest** — every route is named by a spec or listed in `e2e/COVERAGE.md`
 *    with a reason. Vitest coverage is scoped to `src/lib`, `src/store` and `src/config`
 *    on purpose, so **E2E is the only automated coverage the UI layer has**: an uncovered
 *    route is entirely uncovered, and today six of them are, with nothing saying so.
 *
 * The third tier — whether a spec's assertions can still fail at all — cannot be answered
 * by reading source, and lives in `scripts/probe-assertion-liveness.mjs`. See
 * [ADR 020](../../../docs/adr/020-a-test-that-cannot-fail-is-documentation.md).
 */

const ROOT = resolve(__dirname, '../../..')
const E2E = join(ROOT, 'e2e')
const APP = join(ROOT, 'src/app')

/**
 * Paths a spec navigates to **on purpose** expecting a 404. Each is a negative probe, so
 * "this does not resolve" is the assertion rather than a defect.
 *
 * Two different absences hide behind one status code, and they are not interchangeable:
 *
 * - **No route.** Nothing in `src/app` matches the path at all.
 * - **No content.** A route matches — `/products/[handle]` serves anything under
 *   `/products/` — and the handler 404s because the handle is not in the catalogue.
 *
 * Both entries below are the second kind, which is why the exclusivity check further
 * down asks whether a *literal* route exists rather than whether the pattern matches. A
 * pattern match here proves the probe reaches the handler it means to test.
 *
 * Declared rather than inferred: a scan cannot tell a deliberate 404 probe from a spec
 * left pointing at a route somebody deleted, and guessing would make the check useless in
 * the one case it exists for.
 */
const INTENTIONALLY_NOT_FOUND: Record<string, string> = {
  '/products/this-product-does-not-exist':
    'Asserts a real 404 rather than the static fallback catalogue — ADR 004.',
  '/shop/not-a-collection':
    'Asserts the collection route 404s on an unknown handle (dynamicParams = false).',
}

function specFiles(): string[] {
  return readdirSync(E2E)
    .filter((f) => f.endsWith('.spec.ts'))
    .map((f) => join(E2E, f))
}

/** Every route the app router serves, pages and API handlers alike. */
function appRoutes(dir: string = APP, prefix = ''): string[] {
  const routes: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      if (entry.startsWith('_')) continue
      routes.push(...appRoutes(full, `${prefix}/${entry}`))
    } else if (entry === 'page.tsx' || entry === 'route.ts') {
      routes.push(prefix === '' ? '/' : prefix)
    }
  }
  return routes
}

const routes = appRoutes()

/** Does any route serve this concrete path? Dynamic segments match anything. */
function isServed(path: string): boolean {
  if (routes.includes(path)) return true
  const parts = path.split('/').filter(Boolean)
  return routes.some((pattern) => {
    const patternParts = pattern.split('/').filter(Boolean)
    if (patternParts.length !== parts.length) return false
    return patternParts.every((segment, i) => segment.startsWith('[') || segment === parts[i])
  })
}

/** Does any route start with this static prefix, e.g. `/products/`? */
function isPrefixServed(prefix: string): boolean {
  return routes.some((route) => `${route}/`.startsWith(prefix))
}

const anchorsBySpec = specFiles().map((path) => ({
  path,
  name: path.slice(E2E.length + 1),
  anchors: collectGotoAnchors(parseSource(path, readFileSync(path, 'utf8'))),
}))

describe('the scan knows its own coverage', () => {
  it('finds specs', () => {
    expect(anchorsBySpec.length).toBeGreaterThan(10)
  })

  it('finds routes', () => {
    expect(routes.length).toBeGreaterThan(20)
  })

  it('resolves every goto argument in the suite', () => {
    // The ADR 007 assertion. Half the `goto` calls here are template literals, loop
    // variables destructured from a local table, or module constants — a literal-only
    // scan would cover a third of the suite and report success. If a new spec uses a form
    // the resolver does not understand, this fails by name instead of shrinking the set
    // silently.
    const blind = anchorsBySpec
      .filter((s) => s.anchors.unresolved.length > 0)
      .map((s) => `${s.name}: ${s.anchors.unresolved.join(', ')}`)

    expect(
      blind,
      'These goto arguments could not be resolved from source, so the checks below do ' +
        'not cover them. Either write the navigation in a form specAnchors understands, ' +
        'or teach the resolver this one — do not leave it unresolved, because an ' +
        'unresolved anchor is an unchecked one.'
    ).toEqual([])
  })
})

describe('every spec navigates to something that exists', () => {
  it.each(anchorsBySpec.map((s) => [s.name, s] as const))('%s', (_name, spec) => {
    for (const anchor of spec.anchors.paths) {
      const route = routeOf(anchor)
      const served = isServed(route)
      const intentional = anchor in INTENTIONALLY_NOT_FOUND || route in INTENTIONALLY_NOT_FOUND

      expect(
        served || intentional,
        `${spec.name} navigates to ${anchor}, which no route serves.\n\n` +
          `If the route was removed, this spec is asserting against a 404 page — and ` +
          `"a heading is visible" or "the status is not 500" both pass there, which is ` +
          `how a spec keeps reporting green after the thing it tested is gone.\n\n` +
          `If the 404 is the point, add it to INTENTIONALLY_NOT_FOUND with the reason.`
      ).toBe(true)

      // A *literal* static route at this exact path would mean the negative probe is
      // testing nothing — the page renders and the spec's 404 assertion is checking the
      // wrong thing. A pattern match is fine and expected: that is how a data-level 404
      // reaches the handler under test.
      expect(
        routes.includes(route) && intentional,
        `${anchor} is declared as expecting a 404, but a static route serves it directly`
      ).toBe(false)
    }

    for (const prefix of spec.anchors.prefixes) {
      expect(
        isPrefixServed(prefix),
        `${spec.name} builds paths under ${prefix}, which matches no route`
      ).toBe(true)
    }
  })

  it('every intentionally-unrouted path is still referenced by some spec', () => {
    // A stale exemption outliving its spec is the fossil pattern applied to the
    // exemption list itself.
    const referenced = new Set(anchorsBySpec.flatMap((s) => s.anchors.paths))
    for (const path of Object.keys(INTENTIONALLY_NOT_FOUND)) {
      expect(referenced, `INTENTIONALLY_NOT_FOUND names ${path}, which no spec visits`).toContain(
        path
      )
    }
  })
})

/**
 * The prefix a dynamic route is reached by, e.g. `/products/[handle]` → `/products/`.
 * A spec that builds paths with a template literal proves the route is exercised without
 * naming a concrete segment.
 */
function dynamicPrefixOf(route: string): string | null {
  const bracket = route.indexOf('[')
  return bracket === -1 ? null : route.slice(0, bracket)
}

const allPaths = anchorsBySpec.flatMap((s) => s.anchors.paths.map(routeOf))
const allPrefixes = anchorsBySpec.flatMap((s) => s.anchors.prefixes)

/** Does any spec navigate to this route, literally or through a dynamic segment? */
function isVisited(route: string): boolean {
  if (allPaths.includes(route)) return true

  const prefix = dynamicPrefixOf(route)
  if (prefix && allPrefixes.includes(prefix)) return true

  // A concrete path a spec visits may be served by this dynamic route.
  const parts = route.split('/').filter(Boolean)
  return allPaths.some((path) => {
    const pathParts = path.split('/').filter(Boolean)
    if (pathParts.length !== parts.length) return false
    return parts.every((segment, i) => segment.startsWith('[') || segment === pathParts[i])
  })
}

/** `route — reason` lines from the manifest's fenced block. */
function coverageExceptions(): Map<string, string> {
  const source = readFileSync(join(ROOT, 'e2e/COVERAGE.md'), 'utf8')
  const match = source.match(/^([ \t]*)```coverage-exceptions\n([\s\S]*?)^\1```$/m)
  const exceptions = new Map<string, string>()
  if (!match) return exceptions
  for (const line of match[2].split('\n')) {
    const entry = line.match(/^\s*(\S+)\s+—\s+(.+?)\s*$/)
    if (entry) exceptions.set(entry[1], entry[2])
  }
  return exceptions
}

const exceptions = coverageExceptions()

describe('every route is covered or excluded on the record', () => {
  it('the manifest was found and parsed', () => {
    // Without this, every route below would be "not excluded" and the check would fail
    // loudly — which is the safe direction, but it would fail for the wrong reason and
    // send the reader to the wrong file.
    expect(
      exceptions.size,
      'e2e/COVERAGE.md has no ```coverage-exceptions block, or none of its lines parsed. ' +
        'Each line must read `route — reason` with an em dash.'
    ).toBeGreaterThan(0)
  })

  it.each(routes)('%s', (route) => {
    const visited = isVisited(route)
    const excluded = exceptions.has(route)

    expect(
      visited || excluded,
      `No E2E spec navigates to ${route}, and e2e/COVERAGE.md does not say why not.\n\n` +
        `Vitest coverage is scoped to src/lib, src/store and src/config, so E2E is the ` +
        `only automated coverage the UI layer has — a route no spec visits is not ` +
        `thinly covered, it is uncovered.\n\n` +
        `Either add a spec, or add a line to the coverage-exceptions block saying which ` +
        `other layer covers it. /faq, /legal and /stores sat in exactly this state with ` +
        `nothing recording it.`
    ).toBe(true)
  })

  it('no exception describes a route a spec already visits', () => {
    // The stale direction. An exception that outlives the gap it documented reads as a
    // considered decision and is really just an old note.
    for (const route of exceptions.keys()) {
      expect(
        isVisited(route),
        `e2e/COVERAGE.md excuses ${route} from E2E coverage, but a spec does visit it. ` +
          `Remove the line — an exception nobody re-examined is worse than none.`
      ).toBe(false)
    }
  })

  it('no exception names a route that does not exist', () => {
    for (const route of exceptions.keys()) {
      expect(routes, `e2e/COVERAGE.md names ${route}, which no route serves`).toContain(route)
    }
  })

  it('every exception names the layer that covers it instead', () => {
    for (const [route, reason] of exceptions) {
      expect(reason.length, `${route}: the reason is too short to be one`).toBeGreaterThan(40)
    }
  })
})
