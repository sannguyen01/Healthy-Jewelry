import { describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const {
  ASSERTION_EVIDENCE,
  BANNER_HEAD_LINES,
  BLOCKING,
  CLASSES,
  SUPERSESSION_BANNER,
  auditPackages,
  classify,
  evaluate,
  globToRegExp,
  languageOf,
  lockfilePackages,
  occurrences,
  parseContract,
  parseRegister,
  retainedPaths,
  section,
  splitPositions,
  tableRows,
} = await import('../../../scripts/lib/commerce-contract.mjs')

/**
 * **The Commerce Elimination Contract, held against the repository and against itself.**
 *
 * ## Two halves, and the second is the one that matters
 *
 * The first half drives the scanner with fixtures: a file that should trip each rule, and —
 * more importantly — a file that should *not*. The second half runs it against this working
 * tree and asserts zero blocking findings.
 *
 * Only the second half is a gate. Only the first half can tell you *why* it went red, and
 * only the first half survives a rewrite of the tree it is checking. This repository has
 * shipped three probes that were correct against their own fixtures and wrong the first time
 * they met real data ([ADR 024](../../../docs/adr/024-a-tool-never-pointed-at-a-known-answer.md)),
 * and one parser that was wrong in the direction no liveness anchor sees — it returned a
 * *longer* list than it should ([ADR 028](../../../docs/adr/028-a-fixture-is-the-input-you-thought-of.md)).
 * Both halves, every time.
 *
 * ## Why every rule has a mutation
 *
 * A checker whose rules have never been observed firing is a checker nobody has tested; it
 * is the shape [ADR 020](../../../docs/adr/020-a-test-that-cannot-fail-is-documentation.md)
 * names, and the reason `scripts/lib/sentinels.mjs` exists. So each rule below is driven
 * against an input that violates it **and** an input that does not, because a rule that
 * fires on everything is exactly as useless as one that fires on nothing — and the second
 * failure mode is the one that gets a guardrail muted rather than fixed.
 */

const ROOT = path.resolve(import.meta.dirname, '../../..')
const read = (rel: string) => readFileSync(path.join(ROOT, rel), 'utf8')

const CONTRACT_PATH = 'COMMERCE-ELIMINATION-CONTRACT.md'
const REGISTER_PATH = 'docs/commerce-dependency-register.md'

const contract = parseContract(read(CONTRACT_PATH))
const register = parseRegister(read(REGISTER_PATH))

/** A file that trips nothing, used as the negative case for every rule below. */
const INERT = { path: 'src/lib/inert.ts', source: 'export const x = 1\n' }

/** Drive `evaluate` over a handful of files with a contract that is the real one. */
function run(files: { path: string; source: string }[], retained: string[] = []) {
  return evaluate({ files, contract, retained: new Set(retained) })
}

/*
 * Every fixture run below carries the contract's real `positions` table, which contains
 * globs for files these fixtures do not include — so `classification-matches-nothing` fires
 * on all of them. That finding is about the contract, not about the fixture, and asserting
 * around it in thirty places would bury the rule each test is actually about.
 */
const ignoringGlobs = (r: { findings: { code: string }[] }) =>
  r.findings.filter((f) => f.code !== 'classification-matches-nothing')
const ruleCodes = (r: { findings: { code: string }[] }) => ignoringGlobs(r).map((f) => f.code)

// ─────────────────────────────────────────────────────────────────────────────
describe('the contract parses, and parses to something', () => {
  /*
   * The guard on the guard, and the first thing to check.
   *
   * Every rule in this file keys on a list parsed out of a Markdown document. A parse that
   * silently yields `[]` makes each of them vacuously satisfied: the scanner runs, reports
   * a clean tree, and checks nothing. That is not a hypothetical failure here — it is the
   * single most repeated defect in this repository's history, and it is why `section()`
   * throws rather than returning empty.
   */
  it('finds every section, each with rows in it', () => {
    expect(contract.identifiers.length).toBeGreaterThanOrEqual(10)
    expect(contract.positions.length).toBeGreaterThanOrEqual(10)
    expect(contract.packages.length).toBeGreaterThanOrEqual(5)
    expect(contract.routesApproved.length).toBeGreaterThanOrEqual(10)
    expect(contract.routesForbidden.length).toBeGreaterThanOrEqual(10)
    expect(contract.contentForbidden.length).toBeGreaterThanOrEqual(8)
    expect(contract.owners.length).toBeGreaterThanOrEqual(5)
    expect(register.length).toBeGreaterThanOrEqual(20)
  })

  it('throws on a missing section rather than enforcing an empty rule', () => {
    expect(() => section('# nothing here', 'identifiers')).toThrow(/no `identifiers` section/)
  })

  it('every identifier declares a scope the rules understand', () => {
    for (const ident of contract.identifiers) {
      expect(['value', 'absolute', 'staged'], `${ident.id}: unknown scope`).toContain(ident.scope)
      expect(ident.why.length, `${ident.id}: no reason given`).toBeGreaterThan(20)
    }
  })

  it('every position glob declares a class the rules understand', () => {
    for (const p of contract.positions) {
      expect(CLASSES, `${p.glob}: unknown class \`${p.klass}\``).toContain(p.klass)
      expect(p.why.length, `${p.glob}: no reason given`).toBeGreaterThan(10)
    }
  })

  it('every register row is a row rather than a gesture', () => {
    for (const row of register) {
      expect(row.path, 'a register row with no path').toBeTruthy()
      expect(row.identifiers.length, `${row.path}: names no identifier`).toBeGreaterThan(0)
      expect(row.system.length, `${row.path}: no owning system`).toBeGreaterThan(2)
      expect(row.trigger.length, `${row.path}: nothing says what makes it run`).toBeGreaterThan(5)
      expect(row.action.length, `${row.path}: no action`).toBeGreaterThan(5)
      expect(row.provenBy.length, `${row.path}: nothing proves the removal`).toBeGreaterThan(5)
    }
  })

  /*
   * "review" and "investigate" are how a register row becomes permanent. Neither names an
   * end state, so neither can ever be checked off, and a table of them reads as progress
   * for as long as anybody is willing to keep looking at it.
   */
  it('no action is a verb that cannot complete', () => {
    for (const row of register) {
      expect(row.action.toLowerCase(), `${row.path}: "${row.action}" names no end state`).toMatch(
        /\b(delete|remove|rewrite|rename|replace|retire|drop|keep)\b/
      )
    }
  })

  it('every register row names a workstream the contract owns', () => {
    const owners = new Set(contract.owners.map((o: { owner: string }) => o.owner))
    expect(owners.size).toBeGreaterThan(4)
    for (const row of register) {
      expect(owners, `${row.path}: workstream \`${row.workstream}\` is not an owner`).toContain(
        row.workstream
      )
    }
  })

  it('every identifier pattern is a regex that matches its own subject', () => {
    // A pattern that compiles but matches nothing is the quiet half of ADR 007: the scan
    // runs, the identifier is "covered", and the coverage is zero.
    const probes: Record<string, string> = {
      // Split, so the probe for the credential-value rule does not itself trip it. The
      // rule exempts nothing — not this class, not this file — which is exactly the
      // property being tested, and it caught this line the first time it was written.
      'credential-value': 'shpat_' + '0123456789abcdef0123456789abcdef',
      'payment-provider': 'const gateway = stripe',
      'cart-mutation': 'await cartCreate(input)',
      'checkout-handoff': 'return cart.checkoutUrl',
      'customer-identity': 'customerAccessTokenCreate(input)',
      'discount-machinery': 'discountCodeBasicCreate(x)',
      'draft-order': 'draftOrderCalculate()',
      'storefront-token-header': "headers['X-Shopify-Storefront-Access-Token'] = t",
      'admin-api-path': 'fetch("/admin/api/2026-07/shop.json")',
      'graphql-endpoint': 'const url = "/api/2026-07/graphql.json"',
      'inventory-check': 'if (variant.availableForSale) {}',
      'shopify-name': "import x from '@shopify/hydrogen'",
      'shopify-host': 'https://mock.myshopify.com',
      'shopify-env': 'process.env.SHOPIFY_WEBHOOK_SECRET',
    }
    for (const ident of contract.identifiers) {
      const probe = probes[ident.id]
      expect(probe, `${ident.id} has no probe in this test — add one`).toBeTruthy()
      expect(ident.pattern.test(probe), `${ident.id} does not match its own probe`).toBe(true)
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('positions: code, prose, and the line between them', () => {
  it('a line comment is prose and the code before it is code', () => {
    const { code, prose } = splitPositions("const a = 1 // shopify\n", 'c-style')
    expect(code[0]).toBe('const a = 1 ')
    expect(prose[0]).toBe('// shopify')
  })

  it('a block comment spanning lines is prose throughout', () => {
    const { code, prose } = splitPositions('/*\n shopify\n*/\nconst a = 1\n', 'c-style')
    expect(prose[1]).toContain('shopify')
    expect(code[1].trim()).toBe('')
    expect(code[3]).toBe('const a = 1')
  })

  it('a hash comment is prose in yaml', () => {
    const { code, prose } = splitPositions('key: value # shopify\n', 'hash')
    expect(code[0]).toBe('key: value ')
    expect(prose[0]).toBe('# shopify')
  })

  it('markdown is prose end to end', () => {
    const { code, prose } = splitPositions('Shopify is gone.\n', 'all-prose')
    expect(code[0]).toBe('')
    expect(prose[0]).toContain('Shopify')
  })

  it('json has no comments, so all of it is code', () => {
    const { code } = splitPositions('{"a": "shopify"}\n', 'none')
    expect(code[0]).toContain('shopify')
  })

  /*
   * The known limit, asserted rather than left to be discovered.
   *
   * This is a lexer: `//` inside a string literal ends the code half early. The direction
   * is safe — a token moves from `code` to `prose`, which weakens a finding rather than
   * inventing one — but "safe" is a claim, and an unstated limit reads as a clean bill of
   * health.
   */
  it('a slash-slash inside a string literal is mis-read as a comment, and that is recorded', () => {
    const { prose } = splitPositions('const u = "https://shop.myshopify.com"\n', 'c-style')
    expect(prose[0]).toContain('myshopify.com')
  })

  it('an unknown extension has no language', () => {
    expect(languageOf('public/logo.png')).toBe(null)
    expect(languageOf('src/app/page.tsx')).toBe('c-style')
    expect(languageOf('docs/x.md')).toBe('all-prose')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('the table parser', () => {
  it('reads several tables in one section and skips every header', () => {
    const rows = tableRows('| A | B |\n|---|---|\n| 1 | 2 |\n\nprose\n\n| A | B |\n|---|---|\n| 3 | 4 |\n')
    expect(rows).toEqual([
      ['1', '2'],
      ['3', '4'],
    ])
  })

  /*
   * The defect this exists for does not throw. A cell holding `\bcart(Create\|LinesAdd)\b`
   * split on the escaped pipe compiles to `\bcart(Create` — which is invalid — but a cell
   * holding `\b(stripe\|paypal)\b` splits to `\b(stripe` and *that* is a valid regex
   * matching nothing. The scanner would then run a silently narrower pattern than the
   * document displays, and report a clean tree.
   */
  it('keeps an escaped pipe inside one cell', () => {
    expect(tableRows('| A | B |\n|---|---|\n| `\\ba(x\\|y)` | two |\n')).toEqual([
      ['`\\ba(x|y)`', 'two'],
    ])
  })

  it('the real contract has a multi-alternation pattern that survived the parse', () => {
    const provider = contract.identifiers.find(
      (i: { id: string }) => i.id === 'payment-provider'
    ) as { pattern: RegExp } | undefined
    expect(provider, 'the payment-provider identifier is gone from the contract').toBeDefined()
    expect(provider!.pattern.test('paypal')).toBe(true)
    expect(provider!.pattern.test('klarna')).toBe(true)
    expect(provider!.pattern.test('stripe')).toBe(true)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('classification', () => {
  const positions = [
    { glob: 'docs/**', klass: 'historical', why: 'x' },
    { glob: 'docs/live.md', klass: 'executable', why: 'y' },
  ]

  it('last match wins, so an exception can be written below the rule it excepts', () => {
    expect(classify('docs/old.md', positions)).toBe('historical')
    expect(classify('docs/live.md', positions)).toBe('executable')
  })

  it('an unclassified path is executable, because unexamined is not a third state', () => {
    expect(classify('src/anything.ts', positions)).toBe('executable')
  })

  it('globs behave', () => {
    expect(globToRegExp('docs/**').test('docs/a/b.md')).toBe(true)
    expect(globToRegExp('docs/*.md').test('docs/a/b.md')).toBe(false)
    expect(globToRegExp('docs/*.md').test('docs/a.md')).toBe(true)
    expect(globToRegExp('a.b').test('axb')).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('each rule fires, and each rule declines to fire', () => {
  it('rule 1 — a credential value is a finding in any position and any class', () => {
    const value = 'shpat_' + 'a1b2c3d4e5f60718'
    for (const file of [
      { path: 'src/x.ts', source: `const t = '${value}'\n` },
      { path: 'docs/adr/001-two-webhook-secrets.md', source: `token: ${value}\n` },
      { path: 'CHANGELOG.md', source: `we rotated ${value}\n` },
    ]) {
      expect(ruleCodes(run([file])), file.path).toContain('credential-value-committed')
    }
  })

  it('rule 1 — a credential *name* is not a value', () => {
    const r = run([{ path: 'docs/adr/001-two-webhook-secrets.md', source: '`SHOPIFY_WEBHOOK_SECRET`\n' }])
    expect(ruleCodes(r)).not.toContain('credential-value-committed')
  })

  it('rule 2 — an absolute prohibition in running code is never retained', () => {
    const file = { path: 'src/lib/bag.ts', source: 'await cartCreate(input)\n' }
    expect(ruleCodes(run([file]))).toContain('absolute-prohibition-in-code')
    // …not even with a register row, which is the whole point of the scope.
    expect(ruleCodes(run([file], ['src/lib/bag.ts']))).toContain('absolute-prohibition-in-code')
  })

  it('rule 3 — a comment inside a code file is free', () => {
    const r = run([
      { path: 'src/app/api/x/route.ts', source: '// held back until the shopify webhooks go\nexport const GET = () => null\n' },
    ])
    expect(ruleCodes(r)).toEqual([])
  })

  it('rule 5 — a staged identifier in code needs a register row, and a row satisfies it', () => {
    const file = { path: 'src/config/thing.ts', source: "const d = process.env.SHOPIFY_STORE_DOMAIN\n" }
    expect(ruleCodes(run([file]))).toContain('unregistered-commerce-reference')
    expect(ruleCodes(run([file], ['src/config/thing.ts']))).toEqual([])
  })

  it('rule 5 — a new document describing Shopify as current is a finding', () => {
    const file = { path: 'docs/how-to-reconnect.md', source: 'Reconnect the Shopify storefront.\n' }
    expect(ruleCodes(run([file]))).toContain('undeclared-commerce-document')
    expect(ruleCodes(run([file], ['docs/how-to-reconnect.md']))).toEqual([])
  })

  it('rule 6 — a superseded document without its banner is a finding', () => {
    const positions = [...contract.positions, { glob: 'docs/old.md', klass: 'superseded', why: 'x' }]
    const withBanner = {
      path: 'docs/old.md',
      source: '# Old\n\n> **Superseded, 2026-09-21.**\n\nShopify things.\n',
    }
    const without = { path: 'docs/old.md', source: '# Old\n\nShopify things.\n' }
    const go = (f: { path: string; source: string }) =>
      evaluate({ files: [f], contract: { ...contract, positions }, retained: new Set() }).findings.map(
        (x: { code: string }) => x.code
      )
    expect(go(without)).toContain('superseded-without-banner')
    expect(go(withBanner)).not.toContain('superseded-without-banner')
  })

  it('rule 6 — the banner must carry a date, not just the word', () => {
    expect(SUPERSESSION_BANNER.test('> Superseded.')).toBe(false)
    expect(SUPERSESSION_BANNER.test('> **Superseded, 2026-09-21 — kept as a record.**')).toBe(true)
    expect(SUPERSESSION_BANNER.test('> ⚠ Historical. Compiled 2026-08-12.')).toBe(true)
  })

  it('rule 6 — the banner must be near the top, where a reader meets it', () => {
    const positions = [...contract.positions, { glob: 'docs/old.md', klass: 'superseded', why: 'x' }]
    const buried =
      '# Old\n\nShopify things.\n' +
      'filler\n'.repeat(BANNER_HEAD_LINES + 5) +
      '> **Superseded, 2026-09-21.**\n'
    const findings = evaluate({
      files: [{ path: 'docs/old.md', source: buried }],
      contract: { ...contract, positions },
      retained: new Set(),
    }).findings.map((x: { code: string }) => x.code)
    expect(findings).toContain('superseded-without-banner')
  })

  it('rule 7a — a specification nothing reads is documentation', () => {
    const positions = [...contract.positions, { glob: 'SPEC.md', klass: 'specification', why: 'x' }]
    const spec = { path: 'SPEC.md', source: 'forbidden: shopify\n' }
    const reader = { path: 'scripts/check.mjs', source: "readFileSync('SPEC.md')\n" }
    const go = (files: { path: string; source: string }[]) =>
      evaluate({ files, contract: { ...contract, positions }, retained: new Set() }).findings.map(
        (x: { code: string }) => x.code
      )
    expect(go([spec])).toContain('specification-nothing-reads')
    expect(go([spec, reader])).not.toContain('specification-nothing-reads')
  })

  it('rule 7a — a mention in a comment is a citation, not a read', () => {
    const positions = [...contract.positions, { glob: 'SPEC.md', klass: 'specification', why: 'x' }]
    const spec = { path: 'SPEC.md', source: 'forbidden: shopify\n' }
    const citer = { path: 'scripts/check.mjs', source: '// see SPEC.md for the rules\n' }
    const findings = evaluate({
      files: [spec, citer],
      contract: { ...contract, positions },
      retained: new Set(),
    }).findings.map((x: { code: string }) => x.code)
    expect(findings).toContain('specification-nothing-reads')
  })

  it('rule 7b — a negative control that asserts nothing loses the exemption', () => {
    const positions = [
      ...contract.positions,
      { glob: 'src/tests/unit/fake.test.ts', klass: 'negative-control', why: 'x' },
    ]
    const go = (source: string) =>
      evaluate({
        files: [{ path: 'src/tests/unit/fake.test.ts', source }],
        contract: { ...contract, positions },
        retained: new Set(),
      }).findings.map((x: { code: string }) => x.code)
    expect(go('const forbidden = /shopify/\n')).toContain('negative-control-asserts-nothing')
    expect(go('expect(src).not.toMatch(/shopify/)\n')).not.toContain(
      'negative-control-asserts-nothing'
    )
    expect(ASSERTION_EVIDENCE.test('findings.push({ code: "x" })')).toBe(true)
  })

  it('rule 8 — a register row for a file the scan never saw is a phantom', () => {
    expect(ruleCodes(run([INERT], ['src/deleted-last-week.ts']))).toContain(
      'register-names-missing-file'
    )
  })

  it('rule 8 — a register row for a file that no longer matches is spent', () => {
    expect(ruleCodes(run([INERT], [INERT.path]))).toContain('register-row-is-spent')
  })

  it('rule 9 — a classification glob matching nothing is a finding', () => {
    const positions = [{ glob: 'src/typo/**', klass: 'historical', why: 'x' }]
    const findings = evaluate({
      files: [INERT],
      contract: { ...contract, positions },
      retained: new Set(),
    }).findings
    expect(findings.map((f: { code: string }) => f.code)).toContain('classification-matches-nothing')
  })

  it('an unreadable extension is reported rather than guessed at', () => {
    expect(ruleCodes(run([{ path: 'src/thing.weird', source: 'shopify\n' }]))).toContain(
      'unknown-language'
    )
  })

  it('occurrences names the line, because a finding at line 0 is one nobody can act on', () => {
    const hits = occurrences(
      { path: 'src/x.ts', source: 'const a = 1\nconst b = process.env.SHOPIFY_X\n' },
      contract
    )
    expect(hits.some((h: { line: number }) => h.line === 2)).toBe(true)
    expect(hits.every((h: { line: number }) => h.line !== 1)).toBe(true)
  })

  it('every emitted code is in BLOCKING — this checker has no advisory tier', () => {
    const emitted = [
      'credential-value-committed',
      'absolute-prohibition-in-code',
      'unregistered-commerce-reference',
      'undeclared-commerce-document',
      'superseded-without-banner',
      'negative-control-asserts-nothing',
      'specification-nothing-reads',
      'register-names-missing-file',
      'register-row-is-spent',
      'classification-matches-nothing',
      'prohibited-package',
      'prohibited-transitive-package',
      'unknown-language',
    ]
    for (const code of emitted) expect(BLOCKING, code).toContain(code)
    expect(BLOCKING.size).toBe(emitted.length)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('package prohibition', () => {
  const lockfile = read('pnpm-lock.yaml')

  /*
   * The lockfile parser is the part most likely to rot: pnpm changes its lockfile shape
   * between majors, and a parser that stops matching would report a clean lockfile forever.
   * So it is asserted against packages this project is *known* to depend on, rather than
   * only against the absence of the ones it must not.
   */
  it('the lockfile parser still parses this lockfile', () => {
    const names = lockfilePackages(lockfile)
    expect(names.size, 'the lockfile parser found no packages at all').toBeGreaterThan(100)
    for (const known of ['next', 'react', 'zod', 'typescript', '@upstash/redis']) {
      expect(names, `the parser cannot see ${known}, which is certainly in there`).toContain(known)
    }
  })

  it('a declared commerce SDK is a finding', () => {
    const findings = auditPackages(
      { manifest: { dependencies: { '@shopify/hydrogen-react': '^1.0.0' } }, lockfile: '' },
      contract
    )
    expect(findings.map((f: { code: string }) => f.code)).toContain('prohibited-package')
  })

  it('a transitive commerce SDK is a finding', () => {
    const findings = auditPackages(
      { manifest: {}, lockfile: '  @shopify/storefront-api-client@1.0.0:\n    resolution: {}\n' },
      contract
    )
    expect(findings.map((f: { code: string }) => f.code)).toContain('prohibited-transitive-package')
  })

  it('an innocent package is not a finding', () => {
    const findings = auditPackages(
      { manifest: { dependencies: { next: '^16.0.0', clsx: '^2.0.0' } }, lockfile: '  next@16.3.4:\n' },
      contract
    )
    expect(findings).toEqual([])
  })

  it('this repository declares and locks no commerce package', () => {
    const findings = auditPackages(
      { manifest: JSON.parse(read('package.json')), lockfile },
      contract
    )
    expect(findings.map((f: { path: string; detail: string }) => `${f.path}: ${f.detail}`)).toEqual([])
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('the boundary holds, here, now', () => {
  /*
   * The gate. Everything above proves the scanner works; this proves the repository passes
   * it. Run over the same tracked-file set the driver uses, so a green run here and a green
   * `pnpm verify:commerce-contract` cannot mean different things.
   */
  const files = execFileSync('git', ['ls-files', '-z'], { cwd: ROOT, maxBuffer: 64 * 1024 * 1024 })
    .toString('utf8')
    .split('\0')
    .filter(Boolean)
    .map((p) => {
      try {
        const buf = readFileSync(path.join(ROOT, p))
        return buf.includes(0) ? null : { path: p, source: buf.toString('utf8') }
      } catch {
        return null
      }
    })
    .filter((f): f is { path: string; source: string } => f !== null)

  const result = evaluate({ files, contract, retained: retainedPaths(register) })

  it('scans a real tree rather than an empty one', () => {
    // Without this the assertion below passes on a broken `git ls-files`, which is the
    // vacuous-green shape every reconciliation in this repository guards against.
    expect(files.length, 'no tracked text files were read').toBeGreaterThan(200)
    expect(result.classCounts.executable).toBeGreaterThan(100)
  })

  it('every position class in the contract classifies at least one real file', () => {
    for (const klass of CLASSES) {
      expect(result.classCounts[klass], `nothing is classified \`${klass}\``).toBeGreaterThan(0)
    }
  })

  it('has no blocking findings', () => {
    const blocking = result.findings.filter((f: { code: string }) => BLOCKING.has(f.code))
    expect(
      blocking.map(
        (f: { code: string; path: string; line: number; detail: string }) =>
          `${f.code} — ${f.path}${f.line ? `:${f.line}` : ''}\n    ${f.detail}`
      ),
      'run `pnpm verify:commerce-contract` for the full report'
    ).toEqual([])
  })

  it('the register is exactly the set of files that need one', () => {
    // Both directions in one assertion: `evaluate` emits `unregistered-*` for a file with
    // no row and `register-row-is-spent` for a row with no file, and the gate above
    // requires both to be empty. This states the consequence, because a reader of this
    // file should not have to derive it.
    const registered = retainedPaths(register)
    expect(registered.size).toBe(register.length)
    for (const row of register) {
      expect(files.some((f) => f.path === row.path), `${row.path} is not tracked`).toBe(true)
    }
  })
})
