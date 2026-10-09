import { describe, it, expect } from 'vitest'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const { judgeTraces, renderTraces, isRepositoryFile, RUNTIME_READS } = await import(
  '../../../scripts/lib/function-traces.mjs'
)
const { collectTraces, exitCode, main } = await import('../../../scripts/audit-function-traces.mjs')

/**
 * **What a server function ships, pointed at the trace that shipped the repository.**
 *
 * On 2026-10-04 the product share card read its fonts through `readFile(FONT_FILES.regular)`.
 * Turbopack could not resolve a path held in an object, warned "Dynamic filesystem access
 * causes tracing of the whole project", and traced 520 repository files into the card's
 * route and into the product page: 124 test files, 58 coverage reports, 47 scripts, 46 ADRs,
 * 25 e2e specs and every root `.md`. The fixture below is that trace's real shape, reduced.
 * ADR 047.
 */

const ROOT = resolve(__dirname, '../../..')
const CARD = 'app/products/[handle]/opengraph-image/route'
const PAGE = 'app/products/[handle]/page'
const ROOT_CARD = 'app/opengraph-image/route'
const FONTS = ['public/fonts/barlow-condensed-500.ttf', 'public/fonts/dm-sans-9pt-500.ttf']
const ROOT_FONTS = [...FONTS, 'public/fonts/dm-sans-9pt-300.ttf']
const DEPENDENCIES = ['node_modules/.pnpm/next@16.3.8/node_modules/next/dist/server/next.js', '.next/server/chunks/[turbopack]_runtime.js']

/** The shape of the whole-project trace, reduced: one file from each kind it swept in. */
const WHOLE_PROJECT = [
  ...DEPENDENCIES,
  ...FONTS,
  'src/tests/unit/manifest-integrity.test.ts',
  'src/tests/unit/function-traces.test.ts',
  'coverage/lcov.info',
  'scripts/audit-manifest-integrity.mjs',
  'docs/adr/031-a-clean-merge-is-not-a-correct-merge.md',
  'e2e/homepage.spec.ts',
  'CLAUDE.md',
  'public/brand/knot-silver.png',
]

const clean = () => ({
  [CARD]: [...DEPENDENCIES, ...FONTS],
  [PAGE]: [...DEPENDENCIES, ...FONTS],
  [ROOT_CARD]: [...DEPENDENCIES, ...ROOT_FONTS],
  'app/faq/page': [...DEPENDENCIES],
})

describe('the verdict', () => {
  it('passes the traces this build produces: dependencies, build output, and the fonts where they belong', () => {
    const verdict = judgeTraces(clean())
    expect(verdict).toMatchObject({ status: 'ok', traceCount: 4, strays: [], missing: [] })
    expect(exitCode(verdict)).toBe(0)
  })

  it('accepts the root card\'s fonts in every page trace, because the root layout imports the card', () => {
    // Measured on the real build: the layout's metadata imports the card module for `alt` and
    // `size`, so each of the page functions carries the three fonts (ADR 051).
    const verdict = judgeTraces({
      ...clean(),
      'app/about/page': [...DEPENDENCIES, ...ROOT_FONTS],
      'app/shop/[collection]/page': [...DEPENDENCIES, ...ROOT_FONTS],
      'app/_not-found/page': [...DEPENDENCIES, ...ROOT_FONTS],
    })
    expect(verdict).toMatchObject({ status: 'ok', strays: [], missing: [] })
  })

  it('fails the whole-project trace, and groups what it shipped by directory', () => {
    const verdict = judgeTraces({ ...clean(), [CARD]: WHOLE_PROJECT })
    expect(verdict.status).toBe('failed')
    expect(exitCode(verdict)).toBe(1)
    expect(verdict.strays).toHaveLength(1)
    expect(verdict.strays[0].trace).toBe(CARD)
    expect(verdict.strays[0].files).not.toContain(FONTS[0]) // allowed where it is read
    expect(verdict.strays[0].byDirectory).toEqual([
      { directory: 'src/tests', count: 2 },
      { directory: 'CLAUDE.md', count: 1 },
      { directory: 'coverage', count: 1 },
      { directory: 'docs/adr', count: 1 },
      { directory: 'e2e', count: 1 },
      { directory: 'public', count: 1 },
      { directory: 'scripts', count: 1 },
    ])
  })

  it('allows a runtime read only in the traces it is named for', () => {
    // The fonts are the cards'. Pages carry them too (the root layout imports the root card), but
    // the same files in a route handler mean something else started reading the repository, and
    // are reported like any other stray.
    const verdict = judgeTraces({ ...clean(), 'app/api/version/route': [...DEPENDENCIES, FONTS[0]] })
    expect(verdict.strays).toEqual([
      { trace: 'app/api/version/route', files: [FONTS[0]], byDirectory: [{ directory: 'public', count: 1 }] },
    ])
  })

  it('fails when a file the card reads at runtime is missing from its trace', () => {
    // On Vercel the function holds its trace and nothing else: ENOENT in production, while
    // every local run reads the file off the disk and passes.
    const verdict = judgeTraces({ ...clean(), [CARD]: [...DEPENDENCIES, FONTS[1]] })
    expect(verdict.status).toBe('failed')
    expect(verdict.missing).toMatchObject([{ file: FONTS[0], trace: CARD, traceExists: true }])
  })

  it('does not require the page to carry the fonts, only allows it', () => {
    expect(judgeTraces({ ...clean(), [PAGE]: [...DEPENDENCIES] }).status).toBe('ok')
  })

  it('says when the trace it was told to expect was never built', () => {
    const traces: Record<string, string[]> = clean()
    delete traces[CARD]
    expect(judgeTraces(traces).missing.map((m: { traceExists: boolean }) => m.traceExists)).toEqual([false, false])
  })

  it('separates "nothing to read" from "read and clean" (ADR 020)', () => {
    const verdict = judgeTraces({})
    expect(verdict.status).toBe('unevaluable')
    expect(exitCode(verdict)).toBe(2)
    expect(renderTraces(verdict).join('\n')).toMatch(/could not run/)
  })

  it('classifies dependencies, build output and paths outside the repository as not repository files', () => {
    expect(isRepositoryFile('node_modules/react/index.js')).toBe(false)
    expect(isRepositoryFile('.next/server/chunks/a.js')).toBe(false)
    expect(isRepositoryFile('../outside/thing.js')).toBe(false)
    expect(isRepositoryFile('src/lib/catalog/index.ts')).toBe(true)
    expect(isRepositoryFile('CLAUDE.md')).toBe(true)
  })

  it('names every runtime read for a trace that exists in this app', () => {
    for (const read of RUNTIME_READS) {
      expect(read.reason.length).toBeGreaterThan(20)
      expect(readFileSync(join(ROOT, read.file)).length, `${read.file} is not in the repository`).toBeGreaterThan(0)
    }
  })
})

describe('what the reader is told', () => {
  it('names the trace, the counts, and the remedy at the call site', () => {
    const text = renderTraces(judgeTraces({ ...clean(), [CARD]: WHOLE_PROJECT })).join('\n')
    expect(text).toContain('✗ no server function traces repository files (4 traces read)')
    expect(text).toContain(`· ${CARD}: 8 repository files`)
    expect(text).toContain('tracing of the whole project')
    expect(text).toContain("readFile(path.join(process.cwd(), 'public/fonts/x.ttf'))")
    expect(text).toContain('RUNTIME_READS')
  })

  it('tells the reader why a missing file will only fail in production', () => {
    const text = renderTraces(judgeTraces({ ...clean(), [CARD]: [...DEPENDENCIES] })).join('\n')
    expect(text).toContain('✗ every file a function reads at runtime is in its trace')
    expect(text).toMatch(/will not exist\s+there at runtime/)
    expect(text).toContain('outputFileTracingIncludes')
  })

  it('says nothing about remedies on a clean build', () => {
    const text = renderTraces(judgeTraces(clean())).join('\n')
    expect(text).not.toContain('Write the path at the call')
    expect(text).not.toContain('will not exist')
  })
})

describe('the transport: reading .nft.json from a build directory', () => {
  function fakeBuild(traces: Record<string, string[]>) {
    const root = mkdtempSync(join(tmpdir(), 'hj-traces-'))
    for (const [name, files] of Object.entries(traces)) {
      const file = join(root, '.next/server', `${name}.js.nft.json`)
      mkdirSync(resolve(file, '..'), { recursive: true })
      // `.nft.json` lists paths relative to the trace file itself, as Next writes them.
      const depth = name.split('/').length + 1
      writeFileSync(file, JSON.stringify({ version: 1, files: files.map((f) => `${'../'.repeat(depth)}${f}`) }))
    }
    return root
  }

  it('resolves each listed path against the repository root and names traces as Next does', () => {
    const root = fakeBuild({ [CARD]: [...DEPENDENCIES, ...FONTS], 'app/faq/page': [DEPENDENCIES[0]] })
    try {
      expect(collectTraces(root)).toEqual({
        [CARD]: [...DEPENDENCIES, ...FONTS],
        'app/faq/page': [DEPENDENCIES[0]],
      })
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('exits 1 on a whole-project build and 2 on an empty one', () => {
    const lines: string[] = []
    const dirty = fakeBuild({ ...clean(), [CARD]: WHOLE_PROJECT })
    const empty = mkdtempSync(join(tmpdir(), 'hj-traces-empty-'))
    try {
      expect(main({ argv: [], log: (l: string) => lines.push(l), root: dirty })).toBe(1)
      expect(lines.join('\n')).toContain('repository files')
      expect(main({ argv: ['--json'], log: () => {}, root: empty })).toBe(2)
    } finally {
      rmSync(dirty, { recursive: true, force: true })
      rmSync(empty, { recursive: true, force: true })
    }
  })
})

describe('ci.yml asks after the build, inside the required job', () => {
  const workflow = readFileSync(join(ROOT, '.github/workflows/ci.yml'), 'utf8')
  const verify = workflow.slice(workflow.indexOf('  verify:'), workflow.indexOf('  dependency-scope:'))

  it('runs the probe after the production build that writes the traces', () => {
    const buildAt = verify.indexOf('pnpm build')
    const probeAt = verify.indexOf('node scripts/audit-function-traces.mjs')
    expect(probeAt, 'ci.yml does not run scripts/audit-function-traces.mjs in verify').toBeGreaterThan(-1)
    expect(buildAt).toBeGreaterThan(-1)
    expect(probeAt).toBeGreaterThan(buildAt)
  })
})
