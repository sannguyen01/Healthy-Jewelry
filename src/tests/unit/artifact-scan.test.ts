import { afterEach, describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const { parseContract } = await import('../../../scripts/lib/commerce-contract.mjs')
const { parseEgress } = await import('../../../scripts/lib/egress.mjs')
const { classifyArtifact, formatReport, scanArtifacts, verdict, CREDENTIAL_SHAPES } = await import(
  '../../../scripts/lib/artifact-scan.mjs'
)
const { main, secretValuesFrom } = await import('../../../scripts/scan-build-artifacts.mjs')

/**
 * **The build-output scan, pointed at answers that are already known.**
 *
 * The real build this scanner runs against is — once the application workstream has landed
 * — supposed to be clean. A scanner only ever shown clean output has never been observed
 * finding anything, which is the state [ADR 024](../../../docs/adr/024-a-tool-never-pointed-at-a-known-answer.md)
 * refuses to register a control in. So every rule here is shown an asset it must fail, an
 * asset it must pass, and the boundary between them.
 *
 * ## Why no forbidden identifier is written in this file
 *
 * The fixtures are **generated from the contract's own patterns** at runtime. That is not a
 * way around the commerce contract — this file would be entitled to a `negative-control`
 * classification — it is a stronger test: every §3 identifier and every §5 package rule the
 * contract declares today, and every one it declares tomorrow, is fed to the scanner and
 * must be found. A hand-picked fixture list tests the identifiers its author remembered.
 * The generator handles the regular-expression subset the contract actually uses and fails
 * by name on anything else, so a new pattern it cannot sample is a loud test failure rather
 * than a silently skipped rule.
 *
 * Credential-shaped samples are assembled here and nowhere else, and the redaction test
 * asserts they never reach the scanner's output in any form.
 */

const ROOT = path.resolve(import.meta.dirname, '../../..')
const CONTRACT_TEXT = readFileSync(path.join(ROOT, 'COMMERCE-ELIMINATION-CONTRACT.md'), 'utf8')
const contract = parseContract(CONTRACT_TEXT)
const { forbidden } = parseEgress(CONTRACT_TEXT)

type Identifier = { id: string; source: string; scope: string; pattern: RegExp }
type Asset = { path: string; kind: string; side: string; text: string }
type Finding = {
  rule: string
  id: string | null
  scope: string | null
  path: string
  offset: number
  field: string | null
  blocking: boolean
  marker: string
}

/**
 * One string matching a pattern from the subset the contract uses: literals, escapes,
 * `\b`, flat and nested groups with alternation (first branch taken), character classes
 * (first member taken), and the quantifiers `{n}`, `{n,}`, `{n,m}`, `+`, `*`, `?`.
 */
function sampleFor(source: string): string {
  let i = 0
  const atom = (): string => {
    const c = source[i]
    if (c === '\\') {
      const n = source[i + 1]
      i += 2
      if (n === 'b') return ''
      if (n === 's') return ' '
      if (n === 'd') return '0'
      if (n === 'w') return 'a'
      return n
    }
    if (c === '(') {
      let depth = 0
      let j = i
      for (; j < source.length; j += 1) {
        if (source[j] === '\\') { j += 1; continue }
        if (source[j] === '(') depth += 1
        if (source[j] === ')' && --depth === 0) break
      }
      const inner = source.slice(i + 1, j).replace(/^\?:/, '')
      i = j + 1
      return sampleFor(inner)
    }
    if (c === '[') {
      const end = source.indexOf(']', i)
      const cls = source.slice(i + 1, end)
      i = end + 1
      return cls[0] === '\\' ? cls[1] : cls[0]
    }
    if (c === '^' || c === '$') {
      i += 1
      return ''
    }
    i += 1
    return c
  }
  let out = ''
  while (i < source.length) {
    if (source[i] === '|') break // first alternative only
    const piece = atom()
    const q = source.slice(i).match(/^(\{(\d+)(,\d*)?\}|\+|\*|\?)/)
    if (q) {
      i += q[0].length
      const times = q[2] ? Number(q[2]) : q[0] === '+' ? 1 : 0
      out += piece.repeat(times)
    } else {
      out += piece
    }
  }
  return out
}

const identifiers = contract.identifiers as Identifier[]
const firstOf = (scope: string) => identifiers.find((i) => i.scope === scope)!
const STAGED = firstOf('staged')
const ABSOLUTE = firstOf('absolute')
const VALUE = firstOf('value')
const stagedSample = sampleFor(STAGED.source)
const absoluteSample = sampleFor(ABSOLUTE.source)
const credentialSample = sampleFor(VALUE.source)
const hostSample = `cdn.${forbidden[0].host}`
const packageSample = (() => {
  const s = sampleFor(contract.packages[0].source)
  return s.endsWith('/') ? `${s}x` : s
})()

/** A retained route whose own name carries a staged identifier, as the real one does. */
const ROUTE = `api/hooks/${stagedSample}`
const REGISTER = [
  { path: `src/app/${ROUTE}/route.ts`, workstream: 'WS-F' },
  // A non-retaining workstream's route: its output earns nothing.
  { path: 'src/app/api/other/route.ts', workstream: 'WS-A' },
]
const OWN_DIR = `.next/server/app/${ROUTE}/`

const client = (p: string, text: string): Asset => ({ path: p, kind: 'client', side: 'client', text })
const server = (p: string, text: string): Asset => ({ path: p, kind: 'server', side: 'server', text })

/** The minimum a real build always has: one client asset, one server asset, the route. */
const baseline = (): Asset[] => [
  client('.next/static/chunks/app.js', 'console.log("hello")'),
  server('.next/server/app/page.js', 'module.exports={}'),
  server(`${OWN_DIR}route.js`, 'R.c("server/chunks/own.js")'),
  server('.next/server/chunks/own.js', 'module.exports=1'),
]

const scan = (assets: Asset[], extra: Record<string, unknown> = {}) =>
  scanArtifacts({ assets, contract, forbiddenHosts: forbidden, register: REGISTER, ...extra })

const blocking = (r: { findings: Finding[] }) => r.findings.filter((f) => f.blocking)

describe('the sample generator reaches every rule the contract declares', () => {
  it.each(identifiers.map((i) => [i.id, i] as const))('§3 %s has a sample its own pattern matches', (_id, ident) => {
    const sample = sampleFor(ident.source)
    expect(
      ident.pattern.test(sample),
      `could not generate a sample for \`${ident.id}\` from \`${ident.source}\`. Teach sampleFor the ` +
        `construct it uses; skipping it would leave a contract rule the artifact scan was never shown.`
    ).toBe(true)
  })

  it('reaches every §5 package rule', () => {
    for (const rule of contract.packages as { source: string; pattern: RegExp }[]) {
      const s = sampleFor(rule.source)
      expect(rule.pattern.test(s.endsWith('/') ? `${s}x` : s), rule.source).toBe(true)
    }
  })
})

describe('classifyArtifact decides kind by who receives the bytes', () => {
  it.each([
    ['.next/static/chunks/app.js', 'client'],
    ['.next/server/app/index.html', 'client'],
    ['.next/server/app/shop.rsc', 'client'],
    ['.next/server/app/about.segments/_tree.segment.rsc', 'client'],
    ['.next/server/app/api/sitemap.body', 'client'],
    ['.next/server/app/faq.meta', 'client'],
    ['public/robots.txt', 'public'],
    ['.next/server/chunks/ssr/x.js', 'server'],
    ['.next/server/app-paths-manifest.json', 'server'],
    ['.next/routes-manifest.json', 'server'],
    ['.next/server/chunks/x.js.map', 'sourcemap'],
    ['.next/static/chunks/x.js.map', 'sourcemap'],
    ['.next/server/app/page.js.nft.json', 'trace'],
  ])('%s → %s', (p, kind) => {
    expect(classifyArtifact(p)).toMatchObject({ kind })
  })

  it('judges a source map as the side it maps', () => {
    expect(classifyArtifact('.next/static/chunks/x.js.map')).toMatchObject({ side: 'client' })
    expect(classifyArtifact('.next/server/chunks/x.js.map')).toMatchObject({ side: 'server' })
  })

  it.each(['.next/cache/webpack/x.pack', '.next/types/routes.d.ts', '.next/trace', 'src/app/page.tsx'])(
    '%s is skipped with a reason',
    (p) => {
      expect(classifyArtifact(p)).toHaveProperty('skip')
    }
  )
})

describe('client output: zero tolerance for every rule', () => {
  it('passes a clean build', () => {
    const r = scan(baseline())
    expect(blocking(r)).toEqual([])
    expect(verdict(r).ok).toBe(true)
  })

  it('fails the injected canary: a §13 host in a client chunk', () => {
    // The known-forbidden fixture. If this ever passes, the scan has stopped scanning.
    const r = scan([...baseline(), client('.next/static/chunks/canary.js', `fetch("https://${hostSample}/x.js")`)])
    // (The first §13 host is the vendor's, so the same bytes also carry staged identifiers;
    // those are asserted by the per-identifier cases below, and only the host is pinned here.)
    expect(blocking(r).filter((f) => f.rule === 'forbidden-host')).toEqual([
      expect.objectContaining({ id: forbidden[0].host, path: '.next/static/chunks/canary.js' }),
    ])
    expect(verdict(r).ok).toBe(false)
  })

  it.each(identifiers.map((i) => [i.id, i] as const))('finds §3 %s in a client chunk', (_id, ident) => {
    const r = scan([...baseline(), client('.next/static/chunks/x.js', `var a="${sampleFor(ident.source)}";`)])
    expect(blocking(r).map((f) => f.id)).toContain(ident.id)
  })

  it('finds a staged identifier in prerendered HTML, which the server allowance never reaches', () => {
    // The page lives under .next/server and is sent to every visitor. A route-name
    // allowance that leaked onto it would excuse exactly what a visitor can read.
    // The fixture names the retained route itself, which is exactly the text the server-side
    // name allowance absorbs — so this fails if that allowance is ever applied client-side.
    const r = scan([...baseline(), client(`.next/server/app/${ROUTE}.html`, `<a href="/${ROUTE}">${stagedSample}</a>`)])
    expect(blocking(r)).toEqual([
      expect.objectContaining({ id: STAGED.id, path: `.next/server/app/${ROUTE}.html` }),
      expect.objectContaining({ id: STAGED.id, path: `.next/server/app/${ROUTE}.html` }),
    ])
    expect(r.allowance.absorbed).toEqual({})
  })

  it('finds a prohibited package compiled into a client chunk', () => {
    const r = scan([...baseline(), client('.next/static/chunks/x.js', `[project]/node_modules/${packageSample}/index.js`)])
    expect(blocking(r).some((f) => f.rule === 'package')).toBe(true)
  })

  it('does not call a lookalike host forbidden', () => {
    const r = scan([...baseline(), client('.next/static/chunks/x.js', `"https://not${forbidden[0].host}.example/"`)])
    expect(blocking(r).filter((f) => f.rule === 'forbidden-host')).toEqual([])
  })

  it('treats public/ as client', () => {
    const r = scan([...baseline(), { path: 'public/x.svg', kind: 'public', side: 'client', text: `<a href="https://${hostSample}"/>` }])
    expect(blocking(r).map((f) => f.rule)).toContain('forbidden-host')
  })
})

describe('server output: absolute and value blocked, staged only where a retained route owns it', () => {
  it('blocks an absolute identifier anywhere on the server side, including the retained route', () => {
    const r = scan([...baseline(), server(`${OWN_DIR}route.js`, `R.c("server/chunks/own.js");var x="${absoluteSample}"`)])
    expect(blocking(r).map((f) => f.id)).toContain(ABSOLUTE.id)
  })

  it('blocks a staged identifier in a chunk no retained route owns', () => {
    const r = scan([...baseline(), server('.next/server/chunks/other.js', `process.env.${stagedSample}`)])
    expect(blocking(r)).toEqual([expect.objectContaining({ id: STAGED.id, path: '.next/server/chunks/other.js' })])
  })

  it("allows a staged identifier in the retained route's own output", () => {
    const r = scan([...baseline(), server(`${OWN_DIR}route_client-reference-manifest.js`, `"${stagedSample}"`)])
    expect(blocking(r)).toEqual([])
    expect(r.allowance.absorbed[`retained-route-output:${ROUTE}`]).toBeGreaterThan(0)
  })

  it('allows it in a chunk only the retained route loads, and names that chunk', () => {
    const assets = baseline()
    assets[3] = server('.next/server/chunks/own.js', `var k="${stagedSample}"`)
    const r = scan(assets)
    expect(blocking(r)).toEqual([])
    expect(r.allowance.routes[0].exclusiveChunks).toEqual(['.next/server/chunks/own.js'])
  })

  it('refuses it in a chunk the retained route shares with another route', () => {
    // Code in a shared chunk is reachable from a route the register does not excuse.
    const assets = [
      ...baseline(),
      server('.next/server/chunks/shared.js', `var k="${stagedSample}"`),
      server(`${OWN_DIR}route.js`, 'R.c("server/chunks/own.js");R.c("server/chunks/shared.js")'),
      server('.next/server/app/api/other/route.js', 'R.c("server/chunks/shared.js")'),
    ]
    const r = scan(assets)
    expect(blocking(r)).toEqual([expect.objectContaining({ path: '.next/server/chunks/shared.js' })])
  })

  it("allows the route's own name in a manifest, and nothing one character outside it", () => {
    const inside = scan([...baseline(), server('.next/server/app-paths-manifest.json', `{"/${ROUTE}/route":"app/${ROUTE}/route.js"}`)])
    expect(blocking(inside)).toEqual([])
    expect(inside.allowance.absorbed[`retained-route-name:${ROUTE}`]).toBe(2)

    const bundlerSpelling = scan([...baseline(), server('.next/server/chunks/y.js', `"${ROUTE.replace(/\//g, '_')}_route"`)])
    expect(blocking(bundlerSpelling)).toEqual([])

    const outside = scan([...baseline(), server('.next/server/app-paths-manifest.json', `{"/${ROUTE}":1,"${stagedSample}X":2}`)])
    expect(blocking(outside)).toHaveLength(1)
  })

  it('earns nothing from a register row outside the retaining workstreams', () => {
    const r = scan([...baseline(), server('.next/server/app/api/other/route.js', `"${stagedSample}"`)])
    expect(blocking(r)).toHaveLength(1)
    expect(r.allowance.routes.map((x: { route: string }) => x.route)).toEqual([ROUTE])
  })

  it('fails when a retained route has no output at all', () => {
    // Either the path mapping broke, or the route is gone and its register row should be.
    const r = scan(baseline().filter((a) => !a.path.startsWith(OWN_DIR)))
    expect(blocking(r)).toEqual([expect.objectContaining({ rule: 'allowance-matches-nothing', id: ROUTE })])
  })
})

describe('source maps and traces are read for what they hold', () => {
  const map = (p: string, body: object): Asset => ({
    path: p,
    kind: 'sourcemap',
    side: p.startsWith('.next/static/') ? 'client' : 'server',
    text: JSON.stringify(body),
  })

  it('does not match a staged identifier that only appears in sourcesContent — a comment is free', () => {
    const r = scan([
      ...baseline(),
      map('.next/server/chunks/z.js.map', { version: 3, sources: ['src/x.ts'], names: ['a'], sourcesContent: [`// ${stagedSample}\nlet a`], mappings: '' }),
    ])
    expect(blocking(r)).toEqual([])
  })

  it('matches one in names, because names were code, and points at the entry', () => {
    const r = scan([
      ...baseline(),
      map('.next/server/chunks/z.js.map', { version: 3, sources: [], names: ['a', `${stagedSample}Config`], mappings: '' }),
    ])
    expect(blocking(r)).toEqual([expect.objectContaining({ id: STAGED.id, field: 'names[1]' })])
    expect(blocking(r)[0].offset).toBeGreaterThan(0)
  })

  it('matches a credential anywhere in a map, sourcesContent included', () => {
    const r = scan([
      ...baseline(),
      map('.next/server/chunks/z.js.map', { version: 3, sources: [], names: [], sourcesContent: [`// ${credentialSample}`], mappings: '' }),
    ])
    expect(blocking(r).map((f) => f.id)).toEqual([VALUE.id])
  })

  it('matches a prohibited package in sources', () => {
    const r = scan([
      ...baseline(),
      map('.next/server/chunks/z.js.map', { version: 3, sources: [`node_modules/${packageSample}/a.js`], names: [], mappings: '' }),
    ])
    expect(blocking(r).map((f) => f.rule)).toEqual(['package'])
  })

  it('fails an unreadable map rather than skipping it', () => {
    const r = scan([...baseline(), { path: '.next/server/chunks/z.js.map', kind: 'sourcemap', side: 'server', text: '{not json' }])
    expect(blocking(r).map((f) => f.rule)).toEqual(['unreadable-sourcemap'])
  })

  it('reads a trace for packages only — a path naming the vendor is not code', () => {
    const trace = (text: string): Asset => ({ path: '.next/server/app/page.js.nft.json', kind: 'trace', side: 'server', text })
    expect(blocking(scan([...baseline(), trace(`{"files":["../../docs/${stagedSample}-notes.md"]}`)]))).toEqual([])
    expect(
      blocking(scan([...baseline(), trace(`{"files":["../../node_modules/${packageSample}/index.js"]}`)])).map((f) => f.rule)
    ).toEqual(['package'])
  })
})

describe('credentials', () => {
  it('finds every extra credential shape and none of their labels alone', () => {
    // Each extra shape requires the body of a secret. A PEM parser legitimately carries the
    // header text, and a scan that failed on library code would be muted.
    for (const shape of CREDENTIAL_SHAPES as { id: string; source: string }[]) {
      const r = scan([...baseline(), server('.next/server/chunks/k.js', `"${sampleFor(shape.source)}"`)])
      expect(blocking(r).map((f) => f.id), shape.id).toEqual([shape.id])
    }
    const header = ['-----BEGIN', 'PRIVATE', 'KEY-----'].join(' ')
    expect(blocking(scan([...baseline(), server('.next/server/chunks/k.js', `"${header}"`)]))).toEqual([])
  })

  it('finds a value the build machine holds, anywhere, and names only the variable', () => {
    const value = ['mock', 'value', 'long', 'enough'].join('-')
    const r = scan([...baseline(), server('.next/server/chunks/k.js', `x="${value}"`)], {
      secretValues: [{ name: 'EXAMPLE_SECRET', value }],
    })
    expect(blocking(r)).toEqual([expect.objectContaining({ rule: 'secret-value', id: 'env:EXAMPLE_SECRET' })])
  })

  it('selects credential-named, non-public, non-trivial variables only', () => {
    const long = 'x'.repeat(20)
    expect(
      secretValuesFrom({
        A_SECRET: long,
        B_TOKEN: long,
        C_API_KEY: long,
        NEXT_PUBLIC_D_TOKEN: long,
        E_TOKEN: 'short',
        F_URL: long,
        G_PASSWORD: undefined,
      }).map((s: { name: string }) => s.name)
    ).toEqual(['A_SECRET', 'B_TOKEN', 'C_API_KEY'])
  })

  it('never lets a matched value reach its output — findings, JSON or report', () => {
    const secret = ['mock', 'value', 'long', 'enough'].join('-')
    const r = scan(
      [
        ...baseline(),
        client('.next/static/chunks/leak.js', `a="${credentialSample}";b="${secret}";c="https://${hostSample}"`),
        server('.next/server/chunks/leak.js', `a="${credentialSample}"`),
      ],
      { secretValues: [{ name: 'EXAMPLE_SECRET', value: secret }] }
    )
    expect(blocking(r).length).toBeGreaterThanOrEqual(4)
    const everything = [JSON.stringify(r), formatReport(r).join('\n')].join('\n')
    for (const value of [credentialSample, secret, hostSample]) {
      expect(everything.includes(value), 'a matched value reached the output').toBe(false)
    }
    // And the markers are fixed text, so a reader still knows what was found and where.
    expect(formatReport(r).join('\n')).toMatch(/\[redacted credential-shape:[\w-]+\]/)
  })

  it('reports byte offsets, not character offsets', () => {
    const r = scan([...baseline(), client('.next/static/chunks/u.js', `"éé${hostSample}"`)])
    // Two two-byte characters and a quote before the match: offset 5, where a character
    // count would say 3 and point a reader at the wrong bytes of a minified file.
    expect(blocking(r).find((f) => f.rule === 'forbidden-host')?.offset).toBe(5)
  })
})

describe('verdict: a scan of nothing is not a pass', () => {
  it('fails on zero assets', () => {
    const v = verdict(scan([]))
    expect(v.ok).toBe(false)
    expect(v.reasons.join(' ')).toMatch(/no assets were inspected/)
  })

  it('fails when either side is missing', () => {
    expect(verdict(scan(baseline().filter((a) => a.kind !== 'client'))).reasons.join(' ')).toMatch(/no client assets/)
    expect(verdict(scan(baseline().filter((a) => a.kind !== 'server'))).reasons.join(' ')).toMatch(/no server assets/)
  })

  it('counts files and bytes per kind', () => {
    const r = scan(baseline())
    expect(r.coverage.client).toEqual({ files: 1, bytes: 20 })
    expect(r.coverage.server.files).toBe(3)
  })
})

describe('the CLI, against a build tree on disk', () => {
  let dir: string | null = null
  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true })
    dir = null
  })

  /** A repository root holding the real contract and register and a minimal build. */
  function tree(files: Record<string, string>): string {
    dir = mkdtempSync(path.join(tmpdir(), 'artifact-scan-'))
    const all: Record<string, string> = {
      'COMMERCE-ELIMINATION-CONTRACT.md': CONTRACT_TEXT,
      'docs/commerce-dependency-register.md': readFileSync(path.join(ROOT, 'docs/commerce-dependency-register.md'), 'utf8'),
      ...files,
    }
    for (const [rel, text] of Object.entries(all)) {
      mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true })
      writeFileSync(path.join(dir, rel), text)
    }
    return dir
  }

  /** The real register's retained routes, so the fixture build carries their output. */
  const retainedDirs = readFileSync(path.join(ROOT, 'docs/commerce-dependency-register.md'), 'utf8')
    .split('\n')
    .filter((l) => l.includes('| WS-F |'))
    .map((l) => l.match(/`src\/app\/(.+)\/route\.ts`/)?.[1])
    .filter(Boolean) as string[]

  const minimalBuild = () => ({
    '.next/static/chunks/app.js': 'console.log(1)',
    '.next/server/app/page.js': 'module.exports={}',
    '.next/cache/huge.pack': `"${hostSample}"`, // skipped: never deployed
    ...Object.fromEntries(retainedDirs.map((d) => [`.next/server/app/${d}/route.js`, 'module.exports={}'])),
  })

  const run = (root: string, argv: string[] = []) => {
    const lines: string[] = []
    const code = main({ argv, env: {}, log: (l: string) => lines.push(l), root })
    return { code, out: lines.join('\n') }
  }

  it('exits 0 on a clean build and prints what it inspected and skipped', () => {
    const { code, out } = run(tree(minimalBuild()))
    expect(code).toBe(0)
    expect(out).toMatch(/client\s+1 files/)
    expect(out).toMatch(/incremental build cache/)
  })

  it('exits 1 on the injected canary', () => {
    const { code, out } = run(tree({ ...minimalBuild(), '.next/static/chunks/canary.js': `"https://${hostSample}/"` }))
    expect(code).toBe(1)
    expect(out).toMatch(/client · forbidden-host/)
    expect(out.includes(hostSample)).toBe(false)
  })

  it('exits 1 when there is no build to scan', () => {
    const { code, out } = run(tree({}))
    expect(code).toBe(1)
    expect(out).toMatch(/no assets were inspected/)
  })

  it('emits a redacted machine report with --json', () => {
    const { code, out } = run(tree({ ...minimalBuild(), '.next/static/chunks/canary.js': `"${credentialSample}"` }), ['--json'])
    expect(code).toBe(1)
    const report = JSON.parse(out)
    expect(report.ok).toBe(false)
    expect(report.findings[0]).toMatchObject({ rule: 'credential-shape', id: VALUE.id })
    expect(out.includes(credentialSample)).toBe(false)
  })
})
