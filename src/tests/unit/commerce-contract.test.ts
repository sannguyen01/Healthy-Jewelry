import { afterAll, describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const {
  ASSERTION_EVIDENCE,
  BANNER_HEAD_LINES,
  BLOCKING,
  CARRIES_REQUIRED,
  CLASSES,
  PHASES,
  SUPERSESSION_BANNER,
  assessPhase,
  auditPackages,
  classify,
  classifyIndex,
  credentialValues,
  disposition,
  evaluate,
  globToRegExp,
  hasAssertion,
  languageOf,
  lockfilePackages,
  manifestPackages,
  occurrences,
  packageNameOf,
  parseCarries,
  parseContract,
  parseRegister,
  retainedPaths,
  section,
  splitPositions,
  summarise,
  tableRows,
} = await import('../../../scripts/lib/commerce-contract.mjs')

const driver = await import('../../../scripts/verify-commerce-contract.mjs')

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

/**
 * The register's row count, pinned by **equality**.
 *
 * It replaces `register.length >= 20`, a floor on a burn-down list: the one assertion
 * guaranteed to fail on the day the work it tracks is finished, and to be lowered that day
 * ([ADR 035](../../../docs/adr/035-a-control-outlives-its-subject.md)). Equality is
 * [ADR 021](../../../docs/adr/021-a-metric-with-only-one-direction.md)'s answer to a metric
 * that only ever passes more easily in one direction: lowering this number means deleting
 * rows in the same diff, and raising it means adding one — both of which a reviewer sees.
 *
 * 53 on 2026-09-25 (WS-A 12 · WS-B 1 · WS-C 21 · WS-D 2 · WS-E 1 · WS-G 1 · WS-F 8 · WS-I 7);
 * 40 after WS-A merged (eleven WS-A rows, the WS-G analytics row and one WS-C test row closed);
 * 36 after WS-C3 (six WS-C rows closed with diagnose-deployment and the API-version premise, three
 * runbook rows opened in WS-D/E/F, and the WS-B handle-contract row closed with the exemption it
 * guarded); 34 on 2026-09-27, when a row-by-row audit found the only two a repository could
 * close before WS-F — the escalation caveat's vendor-specific cause and the Playwright web
 * server's commerce env, both WS-C. 35 on 2026-10-03, the first row *added* since the register
 * was compiled: `scripts/lib/sentinels.mjs` now names the retained webhook route, because its
 * signing secret left the project before the route did (incident PR-94) and the route's
 * fail-closed answer needed a sentinel. It is WS-F's, and leaves with the route. Recomputed by
 * the integrator after each change that closes or opens a row; `pnpm verify:commerce-contract
 * --summary` prints the live figure by workstream.
 */
const EXPECTED_REGISTER_ROWS = 35

/** A file that trips nothing, used as the negative case for every rule below. */
const INERT = { path: 'src/lib/inert.ts', source: 'export const x = 1\n' }

type Row = { path: string; identifiers: string[] }

/** A register row as `parseRegister` returns it, reduced to the two cells the rules read. */
const row = (p: string, ...identifiers: string[]): Row => ({ path: p, identifiers })

/** Drive `evaluate` over a handful of files with a contract that is the real one. */
function run(files: { path: string; source: string }[], rows: Row[] = []) {
  return evaluate({ files, contract, register: rows })
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
    // The register is deliberately absent: its size is a burn-down, pinned by equality and
    // by phase in the describe below, never by a floor.
  })

  it('declares a phase the rules understand', () => {
    expect(PHASES).toEqual(['active', 'complete'])
    expect(PHASES, 'the contract:state section declares an unknown phase').toContain(
      contract.state.decommission
    )
  })

  it('every negative-control and specification row declares Carries, and no other row does', () => {
    // Asserted here as well as by `evaluate` so a malformed table is named at parse time,
    // before a reader has to find it inside a tree-wide report.
    for (const p of contract.positions) {
      if (CARRIES_REQUIRED.has(p.klass)) {
        expect(p.carries.declared, `${p.glob}: a whole-file exemption with no Carries`).toBe(true)
      } else {
        expect(p.carries.ids, `${p.glob}: Carries on a \`${p.klass}\` row`).toEqual([])
      }
    }
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
   * The limit this used to record, inverted.
   *
   * Until 2026-09-25 this test asserted the opposite — that a `//` inside a string *was*
   * read as a comment — under a comment calling that direction "safe, because it weakens
   * a finding rather than inventing one". For a prohibition scanner that is the unsafe
   * direction: a comment is free, so a misread comment is a silent exemption, and the
   * misread was hiding an `absolute` finding in this repository when it was measured.
   */
  it('a slash-slash inside a string literal is code, not a comment', () => {
    const { code, prose } = splitPositions('const u = "https://shop.myshopify.com"\n', 'c-style')
    expect(code[0]).toContain('myshopify.com')
    expect(prose[0]).toBe('')
  })

  it('an unknown extension has no language', () => {
    expect(languageOf('public/logo.png')).toBe(null)
    expect(languageOf('src/app/page.tsx')).toBe('c-style-jsx')
    expect(languageOf('docs/x.md')).toBe('all-prose')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('the lexer: strings, templates, regexes and JSX are code', () => {
  /*
   * Each of these is an input the line-splitting predecessor got wrong, and the first one
   * is the one that mattered: a glob in a string opened a block comment and thirty lines of
   * `vitest.config.ts` — mock storefront environment and all — were read as a comment.
   * `commerce-lexer-differential.test.ts` checks the same lexer against the compiler over
   * the whole tree; these name the cases, so a regression says which rule broke.
   */
  const c = (src: string, lang = 'c-style') => splitPositions(src, lang)

  it('a `/*` inside a string opens nothing, and the next line is still code', () => {
    const { code, prose } = c("const g = 'e2e/**'\nconst d = process.env.SHOPIFY_X\n")
    expect(code[1]).toContain('SHOPIFY_X')
    expect(prose.join('')).toBe('')
  })

  it('a `//` inside a string is code, and a real comment after it is prose', () => {
    const { code, prose } = c("const u = 'https://example.com' // shopify\n")
    expect(code[0]).toBe("const u = 'https://example.com' ")
    expect(prose[0]).toBe('// shopify')
  })

  it('a template literal is code, `${}` re-enters code, and a comment inside `${}` is prose', () => {
    const src = 'const t = `a${\'/*\'}b //`\nconst v = `x${ /* note */ y }`\nconst w = 1\n'
    const { code, prose } = c(src)
    expect(code[0]).toBe(src.split('\n')[0])
    expect(prose[1]).toBe('/* note */')
    expect(code[2]).toBe('const w = 1')
  })

  it('templates nest through `${}` to any depth', () => {
    const { code, prose } = c('const t = `a${`b${`c // not`}`}` // yes\n')
    expect(code[0]).toContain('c // not')
    expect(prose[0]).toBe('// yes')
  })

  it('a regex literal is code — escaped slashes and a slash in a class do not end it', () => {
    const { code, prose } = c('const r = /\\/\\*/\nconst k = /[/]/g // tail\nconst s = 1\n')
    expect(code[0]).toBe('const r = /\\/\\*/')
    expect(code[1]).toBe('const k = /[/]/g ')
    expect(prose[1]).toBe('// tail')
    expect(code[2]).toBe('const s = 1')
  })

  it('a slash after an operand divides, and a slash after a keyword opens a regex', () => {
    expect(c('const a = b / c // note\n').prose[0]).toBe('// note')
    expect(c('const a = total! / count // note\n').prose[0]).toBe('// note')
    expect(c("return /'/.test(x) // note\n").prose[0]).toBe('// note')
  })

  it('a JSX comment is prose; JSX text is code even where it looks like a comment', () => {
    const src = "const a = <p>{/* shopify */}</p>\nconst b = <a>https://example.com</a>\nconst c = <p>Don't</p> // tail\n"
    const { code, prose } = c(src, 'c-style-jsx')
    expect(prose[0]).toBe('/* shopify */')
    expect(code[1]).toContain('https://example.com')
    expect(prose[1]).toBe('')
    expect(prose[2]).toBe('// tail')
  })

  it('a shebang is prose', () => {
    expect(c('#!/usr/bin/env node\nconst a = 1\n').prose[0]).toBe('#!/usr/bin/env node')
  })

  it('CSS: a comment is prose and a string holding `/*` is not', () => {
    const { code, prose } = c('a { content: "/*"; } /* c */\n.b { }\n', 'block-only')
    expect(code[0]).toBe('a { content: "/*"; } ')
    expect(prose[0]).toBe('/* c */')
    expect(code[1]).toBe('.b { }')
  })

  it('YAML and shell: a `#` inside quotes, or mid-word, is not a comment', () => {
    const h = (src: string) => splitPositions(src, 'hash')
    expect(h('run: echo "## Summary" >> out # note\n').prose[0]).toBe('# note')
    expect(h("key: 'a # b' # c\n").code[0]).toBe("key: 'a # b' ")
    expect(h('n=${#arr[@]}\n').prose[0]).toBe('')
    // A mid-scalar apostrophe opens no quote, so the comment after it is still a comment.
    expect(h("- don't deploy # shopify\n").prose[0]).toBe('# shopify')
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
    expect(ruleCodes(run([file], [row('src/lib/bag.ts', 'cart-mutation')]))).toContain(
      'absolute-prohibition-in-code'
    )
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
    expect(ruleCodes(run([file], [row('src/config/thing.ts', 'shopify-env', 'shopify-name')]))).toEqual([])
  })

  it('rule 5 — a new document describing Shopify as current is a finding', () => {
    const file = { path: 'docs/how-to-reconnect.md', source: 'Reconnect the Shopify storefront.\n' }
    expect(ruleCodes(run([file]))).toContain('undeclared-commerce-document')
    expect(ruleCodes(run([file], [row('docs/how-to-reconnect.md', 'shopify-name')]))).toEqual([])
  })

  it('rule 6 — a superseded document without its banner is a finding', () => {
    const positions = [...contract.positions, { glob: 'docs/old.md', klass: 'superseded', why: 'x' }]
    const withBanner = {
      path: 'docs/old.md',
      source: '# Old\n\n> **Superseded, 2026-09-21.**\n\nShopify things.\n',
    }
    const without = { path: 'docs/old.md', source: '# Old\n\nShopify things.\n' }
    const go = (f: { path: string; source: string }) =>
      evaluate({ files: [f], contract: { ...contract, positions }, register: [] }).findings.map(
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
      register: [],
    }).findings.map((x: { code: string }) => x.code)
    expect(findings).toContain('superseded-without-banner')
  })

  it('rule 7a — a specification nothing reads is documentation', () => {
    const positions = [...contract.positions, { glob: 'SPEC.md', klass: 'specification', why: 'x' }]
    const spec = { path: 'SPEC.md', source: 'forbidden: shopify\n' }
    const reader = { path: 'scripts/check.mjs', source: "readFileSync('SPEC.md')\n" }
    const go = (files: { path: string; source: string }[]) =>
      evaluate({ files, contract: { ...contract, positions }, register: [] }).findings.map(
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
      register: [],
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
        register: [],
      }).findings.map((x: { code: string }) => x.code)
    expect(go('const forbidden = /shopify/\n')).toContain('negative-control-asserts-nothing')
    expect(go('expect(src).not.toMatch(/shopify/)\n')).not.toContain(
      'negative-control-asserts-nothing'
    )
    expect(ASSERTION_EVIDENCE.test('findings.push({ code: "x" })')).toBe(true)
  })

  it('rule 7b — an assertion mentioned in a comment earns nothing', () => {
    // The earning condition used to be tested against the whole source, so the word
    // "expect" in a comment granted the contract's strongest exemption.
    const positions = [
      ...contract.positions,
      { glob: 'src/tests/unit/fake.test.ts', klass: 'negative-control', why: 'x', carries: parseCarries('—') },
    ]
    const go = (source: string) =>
      evaluate({
        files: [{ path: 'src/tests/unit/fake.test.ts', source }],
        contract: { ...contract, positions },
        register: [],
      }).findings.map((x: { code: string }) => x.code)
    expect(go('// we expect this to assert one day\nconst forbidden = 1\n')).toContain(
      'negative-control-asserts-nothing'
    )
    expect(go('/* assert(x) */ const forbidden = 1\n')).toContain('negative-control-asserts-nothing')
    expect(hasAssertion('// expect\n', 'c-style')).toBe(false)
    expect(hasAssertion('expect(1).toBe(1)\n', 'c-style')).toBe(true)
    expect(hasAssertion('expect(1)\n', 'all-prose')).toBe(false)
  })

  it('rule 8 — a register row for a file the scan never saw is a phantom', () => {
    expect(ruleCodes(run([INERT], [row('src/deleted-last-week.ts', 'shopify-name')]))).toContain(
      'register-names-missing-file'
    )
  })

  it('rule 8 — a register row for a file that no longer matches is spent', () => {
    expect(ruleCodes(run([INERT], [row(INERT.path, 'shopify-name')]))).toContain('register-row-is-spent')
  })

  it('rule 9 — a classification glob matching nothing is a finding', () => {
    const positions = [{ glob: 'src/typo/**', klass: 'historical', why: 'x' }]
    const findings = evaluate({
      files: [INERT],
      contract: { ...contract, positions },
      register: [],
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
      'register-identifiers-undeclared',
      'register-identifiers-overdeclared',
      'register-duplicate-path',
      'register-unknown-identifier',
      'exemption-carries-undeclared',
      'exemption-carries-overdeclared',
      'exemption-carries-malformed',
      'classification-matches-nothing',
      'contract-state-invalid',
      'phase-active-register-empty',
      'phase-complete-register-nonempty',
      'prohibited-package',
      'prohibited-transitive-package',
      'unknown-language',
    ]
    for (const code of emitted) expect(BLOCKING, code).toContain(code)
    expect(BLOCKING.size).toBe(emitted.length)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('rule 8 — the register reconciles as exact sets, not as paths', () => {
  /*
   * The defect this closes shipped in the first version and was invisible: rows were
   * reduced to a `Set` of paths, so `row.identifiers` was parsed, displayed, and never read.
   * Two rows had drifted by the time anybody compared them. Each mutation below is one way
   * a register goes wrong at the grain of the identifier, and each must be a finding.
   */
  const THING = 'src/config/thing.ts'
  const file = { path: THING, source: 'const d = process.env.SHOPIFY_STORE_DOMAIN\n' }
  const codes = (files: { path: string; source: string }[], rows: Row[]) => ruleCodes(run(files, rows))
  const find = (files: { path: string; source: string }[], rows: Row[], code: string) =>
    ignoringGlobs(run(files, rows)).filter((f: { code: string }) => f.code === code) as {
      code: string
      path: string
      id?: string
      line: number
    }[]

  it('an exact row is silent', () => {
    expect(codes([file], [row(THING, 'shopify-env', 'shopify-name')])).toEqual([])
  })

  it('mutation: an identifier added to a registered file is undeclared, named, with its line', () => {
    const grown = { path: THING, source: `${file.source}const h = 'mock.myshopify.com'\n` }
    const hits = find([grown], [row(THING, 'shopify-env', 'shopify-name')], 'register-identifiers-undeclared')
    expect(hits).toHaveLength(1)
    expect(hits[0].id).toBe('shopify-host')
    expect(hits[0].line).toBe(2)
    // …and no per-line `unregistered-*` noise: the row is what is wrong, so the row is named.
    expect(codes([grown], [row(THING, 'shopify-env', 'shopify-name')])).not.toContain(
      'unregistered-commerce-reference'
    )
  })

  it('mutation: an identifier removed while others remain is overdeclared', () => {
    const hits = find(
      [file],
      [row(THING, 'shopify-env', 'shopify-host', 'shopify-name')],
      'register-identifiers-overdeclared'
    )
    expect(hits.map((h) => h.id)).toEqual(['shopify-host'])
  })

  it('mutation: a deleted file leaves a row naming a missing file', () => {
    expect(codes([INERT], [row(THING, 'shopify-env', 'shopify-name')])).toContain(
      'register-names-missing-file'
    )
  })

  it('mutation: a renamed file is a missing file *and* an unregistered one', () => {
    const moved = { ...file, path: 'src/config/renamed.ts' }
    const found = codes([moved], [row(THING, 'shopify-env', 'shopify-name')])
    expect(found).toContain('register-names-missing-file')
    expect(found).toContain('unregistered-commerce-reference')
  })

  it('mutation: a duplicated row is a finding, not a silent merge', () => {
    const found = codes(
      [file],
      [row(THING, 'shopify-env', 'shopify-name'), row(THING, 'shopify-env', 'shopify-name')]
    )
    expect(found).toEqual(['register-duplicate-path'])
  })

  it('mutation: an identifier id §3 does not define is a finding', () => {
    const hits = find([file], [row(THING, 'shopify-env', 'shopify-nmae', 'shopify-name')], 'register-unknown-identifier')
    expect(hits.map((h) => h.id)).toEqual(['shopify-nmae'])
  })

  it('a comment carries nothing a row can declare — prose in a code file is free', () => {
    const commented = { path: THING, source: '// the shopify read went in 2026-09\nexport const x = 1\n' }
    expect(codes([commented], [row(THING, 'shopify-name')])).toEqual(['register-row-is-spent'])
  })

  it('in a Markdown file every hit is eligible, absolute scope included', () => {
    const doc = { path: 'docs/how-to.md', source: 'Read `checkoutUrl` from the Shopify cart.\n' }
    expect(codes([doc], [row('docs/how-to.md', 'shopify-name')])).toEqual(['register-identifiers-undeclared'])
    expect(codes([doc], [row('docs/how-to.md', 'checkout-handoff', 'shopify-name')])).toEqual([])
  })

  it('disposition() names what excuses each hit', () => {
    const hit = (scope: string, position: string) => ({ id: 'x', scope, position })
    expect(disposition(hit('staged', 'code'), 'executable', 'c-style')).toBe('register')
    expect(disposition(hit('staged', 'prose'), 'executable', 'c-style')).toBe('free')
    expect(disposition(hit('absolute', 'code'), 'executable', 'c-style')).toBe('absolute')
    expect(disposition(hit('absolute', 'code'), 'negative-control', 'c-style')).toBe('class')
    expect(disposition(hit('absolute', 'prose'), 'executable', 'all-prose')).toBe('register')
    expect(disposition(hit('staged', 'prose'), 'superseded', 'all-prose')).toBe('superseded')
    expect(disposition(hit('staged', 'prose'), 'historical', 'all-prose')).toBe('class')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('rule 10 — a whole-file exemption declares exactly what it carries', () => {
  /*
   * `negative-control` and `specification` let a file name any identifier anywhere, and
   * until the Carries column existed a regression inside one of those files was invisible
   * (`docs/controls.json` known limit 3). Each row now states the ids its exemption is
   * doing work for, and these are the ways that statement goes wrong.
   */
  const FAKE = 'src/tests/unit/fake.test.ts'
  const withRow = (carries: string, klass = 'negative-control', glob = FAKE) => ({
    ...contract,
    positions: [...contract.positions, { glob, klass, why: 'x', carries: parseCarries(carries) }],
  })
  const go = (c: object, files: { path: string; source: string }[]) =>
    evaluate({ files, contract: c, register: [] }).findings as { code: string; id?: string; detail: string }[]
  const control = { path: FAKE, source: 'expect(src).not.toMatch(/shopify/)\n' }

  it('an exact declaration is silent', () => {
    expect(ignoringGlobs({ findings: go(withRow('shopify-name'), [control]) })).toEqual([])
  })

  it('mutation: an identifier the exemption starts covering is undeclared', () => {
    const grown = { path: FAKE, source: `${control.source}await cartCreate(input)\n` }
    const hits = go(withRow('shopify-name'), [grown]).filter((f) => f.code === 'exemption-carries-undeclared')
    expect(hits.map((h) => h.id)).toEqual(['cart-mutation'])
    expect(hits[0].detail).toContain(FAKE)
  })

  it('mutation: an identifier the exemption stops covering is overdeclared', () => {
    const hits = go(withRow('shopify-host shopify-name'), [control]).filter(
      (f) => f.code === 'exemption-carries-overdeclared'
    )
    expect(hits.map((h) => h.id)).toEqual(['shopify-host'])
  })

  it('a comment in a negative control is not something its exemption covers', () => {
    const commented = { path: FAKE, source: '// shopify\nexpect(1).toBe(1)\n' }
    expect(ignoringGlobs({ findings: go(withRow('—'), [commented]) })).toEqual([])
    expect(go(withRow('shopify-name'), [commented]).map((f) => f.code)).toContain(
      'exemption-carries-overdeclared'
    )
  })

  it('a missing declaration, a declaration on the wrong class and an unknown id are malformed', () => {
    const malformed = (c: object) =>
      go(c, [control]).filter((f) => f.code === 'exemption-carries-malformed')
    expect(malformed(withRow(''))).toHaveLength(1)
    expect(malformed(withRow('shopify-name', 'historical'))).toHaveLength(1)
    expect(malformed(withRow('shopify-nmae'))).toHaveLength(1)
    expect(malformed(withRow('—', 'historical'))).toHaveLength(0)
  })

  it('a glob row is reconciled against the union of the files it decides', () => {
    const glob = 'src/tests/unit/fake-*.test.ts'
    const files = [
      { path: 'src/tests/unit/fake-a.test.ts', source: 'expect(x).not.toContain("shopify")\n' },
      { path: 'src/tests/unit/fake-b.test.ts', source: "expect(x).not.toContain('mock.myshopify.com')\n" },
    ]
    const ok = go(withRow('shopify-host shopify-name', 'negative-control', glob), files)
    expect(ok.filter((f) => f.code.startsWith('exemption-'))).toEqual([])
    const narrow = go(withRow('shopify-name', 'negative-control', glob), files)
    expect(narrow.filter((f) => f.code === 'exemption-carries-undeclared').map((f) => f.id)).toEqual([
      'shopify-host',
    ])
  })

  it('a file a later row reclassifies is that row\'s business, not the glob\'s', () => {
    const glob = 'src/tests/unit/fake-*.test.ts'
    const c = {
      ...contract,
      positions: [
        ...contract.positions,
        { glob, klass: 'negative-control', why: 'x', carries: parseCarries('shopify-name') },
        { glob: 'src/tests/unit/fake-b.test.ts', klass: 'historical', why: 'y', carries: parseCarries('') },
      ],
    }
    const files = [
      { path: 'src/tests/unit/fake-a.test.ts', source: 'expect(x).not.toContain("shopify")\n' },
      { path: 'src/tests/unit/fake-b.test.ts', source: "const h = 'mock.myshopify.com'\n" },
    ]
    expect(classifyIndex('src/tests/unit/fake-b.test.ts', c.positions)).toBe(c.positions.length - 1)
    expect(go(c, files).filter((f) => f.code.startsWith('exemption-'))).toEqual([])
  })

  it('the Carries cell parses its three states', () => {
    expect(parseCarries('')).toEqual({ declared: false, ids: [], raw: '' })
    expect(parseCarries('—')).toEqual({ declared: true, ids: [], raw: '—' })
    expect(parseCarries('`a` b, c').ids).toEqual(['a', 'b', 'c'])
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('rule 1 — a credential value is read in every tracked text file', () => {
  /*
   * `excluded` short-circuited before the credential rule, so the lockfile and both
   * extensionless dotfiles had never been read for a token — while the contract said the
   * `value` scope admits "no exemption of any kind". Built from fragments: this file is
   * scanned too, and the rule has no exemption for its own tests.
   */
  const value = ['shp', 'at_', 'a1b2c3d4', 'e5f60718'].join('')

  it.each(['pnpm-lock.yaml', '.gitignore', '.prettierrc', 'public/robots.txt', 'src/thing.weird'])(
    'mutation: a value in %s is a finding',
    (p) => {
      expect(ruleCodes(run([{ path: p, source: `x: ${value}\n` }]))).toContain('credential-value-committed')
    }
  )

  it('is reported once per line, not once per lexer half', () => {
    const hits = credentialValues({ path: 'src/x.ts', source: `const t = '${value}' // ${value}\n` }, contract)
    expect(hits).toHaveLength(1)
    const found = run([{ path: 'src/x.ts', source: `const t = '${value}'\n` }]).findings.filter(
      (f: { code: string }) => f.code === 'credential-value-committed'
    )
    expect(found).toHaveLength(1)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('the phase — a state machine the count cannot game', () => {
  /*
   * `active` with no rows fails and `complete` with rows fails, so for every register size
   * exactly one phase passes. That is the property that makes "flip the state to make the
   * count check pass" impossible: whichever way the flip goes, it lands on the failing side.
   */
  const phase = (decommission: string | undefined, rows: number) =>
    assessPhase({
      contract: { ...contract, state: decommission === undefined ? {} : { decommission } },
      register: Array.from({ length: rows }, (_, i) => row(`src/x${i}.ts`, 'shopify-name')),
    }).map((f: { code: string }) => f.code)

  it('active with rows passes; active with none fails and says to declare completion', () => {
    expect(phase('active', 1)).toEqual([])
    expect(phase('active', 0)).toEqual(['phase-active-register-empty'])
  })

  it('complete with none passes; complete with rows fails', () => {
    expect(phase('complete', 0)).toEqual([])
    expect(phase('complete', 1)).toEqual(['phase-complete-register-nonempty'])
  })

  it('for every register size exactly one phase passes', () => {
    for (const rows of [0, 1, 53]) {
      const passing = PHASES.filter((p: string) => phase(p, rows).length === 0)
      expect(passing, `${rows} rows`).toHaveLength(1)
    }
  })

  it('an unknown or missing phase is a finding, not a default', () => {
    expect(phase('done', 0)).toEqual(['contract-state-invalid'])
    expect(phase(undefined, 3)).toEqual(['contract-state-invalid'])
  })

  it('the state section is required — a contract without one does not parse', () => {
    const stripped = read(CONTRACT_PATH).replace('<!-- contract:state -->', '')
    expect(() => parseContract(stripped)).toThrow(/no `state` section/)
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

  /*
   * pnpm lists every package twice — under `packages:` and again under `snapshots:` — and
   * the first version reported a prohibited transitive once per listing. A report that says
   * everything twice teaches its reader to halve it.
   */
  it('a transitive listed under both packages: and snapshots: is reported once', () => {
    const twice =
      "packages:\n\n  '@shopify/storefront-api-client@1.0.0':\n    resolution: {}\n\n" +
      "snapshots:\n\n  '@shopify/storefront-api-client@1.0.0': {}\n"
    const findings = auditPackages({ manifest: {}, lockfile: twice }, contract)
    expect(findings.map((f: { code: string }) => f.code)).toEqual(['prohibited-transitive-package'])
  })

  /*
   * An override is an instruction to install, not a version preference: it can force a
   * prohibited package into the tree with no dependency map naming it. The audit read the
   * four maps and nothing else.
   */
  it('mutation: a prohibited package forced by pnpm.overrides, overrides or resolutions is a finding', () => {
    for (const manifest of [
      { pnpm: { overrides: { '@shopify/hydrogen-react': '1.0.0' } } },
      { pnpm: { overrides: { 'image-plugin>@shopify/hydrogen-react@^1': '1.0.0' } } },
      { overrides: { 'image-plugin': { stripe: '1.0.0' } } },
      { resolutions: { 'shopify-buy': '2.0.0' } },
      { pnpm: { overrides: { 'image-plugin': 'npm:@shopify/hydrogen-react@1.0.0' } } },
    ]) {
      const codes = auditPackages({ manifest, lockfile: '' }, contract).map((f: { code: string }) => f.code)
      expect(codes, JSON.stringify(manifest)).toEqual(['prohibited-package'])
    }
  })

  it('mutation: an npm: alias in a dependency map is read through to its target', () => {
    const findings = auditPackages(
      { manifest: { dependencies: { 'image-kit': 'npm:@shopify/hydrogen-react@1.0.0' } }, lockfile: '' },
      contract
    )
    expect(findings.map((f: { code: string }) => f.code)).toEqual(['prohibited-package'])
    expect(findings[0].detail).toContain('alias')
  })

  it("reads this repository's real overrides, and none of them is prohibited", () => {
    const manifest = JSON.parse(read('package.json'))
    const forced = manifestPackages(manifest).filter((p: { via: string }) => p.via === 'pnpm.overrides')
    expect(forced.map((p: { name: string }) => p.name).sort()).toEqual(
      Object.keys(manifest.pnpm?.overrides ?? {}).map(packageNameOf).sort()
    )
    expect(forced.length, 'package.json has pnpm.overrides; the parser saw none').toBeGreaterThan(0)
  })

  it('packageNameOf resolves selectors, versions, scopes and aliases', () => {
    expect(packageNameOf('postcss')).toBe('postcss')
    expect(packageNameOf('postcss@^8')).toBe('postcss')
    expect(packageNameOf('@scope/pkg@^2')).toBe('@scope/pkg')
    expect(packageNameOf('parent>@scope/pkg@1')).toBe('@scope/pkg')
    expect(packageNameOf('npm:@scope/pkg@1.0.0')).toBe('@scope/pkg')
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

  const result = evaluate({ files, contract, register })
  const phase = contract.state.decommission as 'active' | 'complete'

  it('scans a real tree rather than an empty one', () => {
    // Without this the assertion below passes on a broken `git ls-files`, which is the
    // vacuous-green shape every reconciliation in this repository guards against.
    expect(files.length, 'no tracked text files were read').toBeGreaterThan(200)
    expect(result.classCounts.executable).toBeGreaterThan(100)
  })

  /*
   * Phase-aware, because the old floor — "every class classifies at least one file" — is
   * wrong at completion: superseded runbooks are deleted as their subjects go, and the
   * negative controls that forbid Shopify by name may reasonably go with the last of it.
   * What must always hold is that the contract and register are still parsed
   * (`specification`), the record is still kept (`historical`), the binary exclusions still
   * match (`excluded`), the default class still carries the tree, and every class §4 still
   * *declares* still classifies something — the last being what catches a parse or glob
   * regression that empties a class silently.
   */
  it('every class the phase requires, and every class §4 declares, classifies a real file', () => {
    const always = ['excluded', 'historical', 'specification', 'executable']
    const required = new Set<string>(phase === 'active' ? [...always, 'negative-control'] : always)
    for (const p of contract.positions) required.add(p.klass)
    for (const klass of required) {
      expect(result.classCounts[klass], `nothing is classified \`${klass}\``).toBeGreaterThan(0)
    }
  })

  it('has no blocking findings', () => {
    const blocking = [...result.findings, ...assessPhase({ contract, register })].filter(
      (f: { code: string }) => BLOCKING.has(f.code)
    )
    expect(
      blocking.map(
        (f: { code: string; path: string; line: number; detail: string }) =>
          `${f.code} — ${f.path}${f.line ? `:${f.line}` : ''}\n    ${f.detail}`
      ),
      'run `pnpm verify:commerce-contract` for the full report'
    ).toEqual([])
  })

  it('the register holds exactly EXPECTED_REGISTER_ROWS rows, and the phase agrees', () => {
    expect(register.length, 'the register changed size: update EXPECTED_REGISTER_ROWS in the same diff').toBe(
      EXPECTED_REGISTER_ROWS
    )
    expect(assessPhase({ contract, register })).toEqual([])
    if (phase === 'complete') {
      expect(EXPECTED_REGISTER_ROWS).toBe(0)
      expect(result.findings).toEqual([])
    } else {
      expect(
        EXPECTED_REGISTER_ROWS,
        'an active decommission with no rows is a completion nobody declared'
      ).toBeGreaterThan(0)
    }
  })

  it('the register is exactly the set of files that need one — at the grain of the identifier', () => {
    // Both directions, stated rather than derived: every file with an eligible hit has a
    // row, every row has a file with an eligible hit, and each row's Identifiers cell equals
    // what the scan observed there.
    const registered = retainedPaths(register)
    expect(registered.size, 'a path appears in more than one row').toBe(register.length)
    const eligible = result.eligible as Map<string, Map<string, number>>
    expect([...eligible.keys()].sort()).toEqual([...registered].sort())
    for (const r of register) {
      expect([...r.identifiers].sort(), `${r.path}: Identifiers cell`).toEqual(
        [...(eligible.get(r.path)?.keys() ?? [])].sort()
      )
    }
  })

  it('every whole-file exemption carries exactly what it declares', () => {
    const exempted = result.exempted as Map<number, Map<string, Set<string>>>
    contract.positions.forEach(
      (p: { glob: string; klass: string; carries: { ids: string[] } }, i: number) => {
        if (!CARRIES_REQUIRED.has(p.klass)) return
        expect([...p.carries.ids].sort(), `${p.glob}: Carries`).toEqual(
          [...(exempted.get(i)?.keys() ?? [])].sort()
        )
      }
    )
  })

  it('the summary reports the numbers a burn-down document would otherwise hand-type', () => {
    const manifest = JSON.parse(read('package.json'))
    const lockfile = read('pnpm-lock.yaml')
    const s = summarise({ files, contract, register, result, manifest, lockfile, findings: result.findings })
    expect(s.phase).toBe(phase)
    expect(s.scanned.trackedTextFiles).toBe(files.length)
    expect(s.register.rows).toBe(register.length)
    expect(
      Object.values(s.register.byWorkstream as Record<string, number>).reduce((a, b) => a + b, 0)
    ).toBe(register.length)
    expect(s.packages.lockfile).toBe(lockfilePackages(lockfile).size)
    expect(s.packages.manifest).toBeGreaterThan(20)
    expect(Object.keys(s.identifiers)).toEqual(['absolute', 'staged', 'value'])
    expect(s.exemptions.length).toBe(
      contract.positions.filter((p: { klass: string }) => CARRIES_REQUIRED.has(p.klass)).length
    )
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('the driver, pointed at the answer it is meant to give', () => {
  /*
   * `scripts/verify-commerce-contract.mjs` is what CI runs, and until this existed it was
   * the one piece of the control nothing had ever executed under test. That is the exact
   * gap [ADR 024](../../../docs/adr/024-a-tool-never-pointed-at-a-known-answer.md) names:
   * of the three probes written in one week, the two with fixture tests shipped correct and
   * the one without produced two defects — a sentinel naming a spec that protected nothing,
   * and a missing browser binary read as proof that a mutation had been caught.
   *
   * The driver exits the process when run as a command, so it carries an entry-point guard
   * like `verify-browse-only.mjs` and `probe-canonical-domain.mjs`. Importing it here would
   * otherwise scan the tree, print a report and kill the runner.
   */
  const capture = (argv: string[], load?: () => object) => {
    const lines: string[] = []
    const code = driver.main({
      log: (line: string) => lines.push(line),
      argv: ['node', 'verify-commerce-contract.mjs', ...argv],
      ...(load ? { load } : {}),
    })
    return { code, report: lines.join('\n'), lines }
  }

  /** A synthetic tree with no globs to match, so only the rule under test can fire. */
  const synthetic =
    (files: { path: string; source: string }[], rows: Row[] = []) =>
    () => ({
      contract: { ...contract, positions: [] },
      register: rows.map((r) => ({ ...r, workstream: 'WS-C' })),
      files,
      manifest: {},
      lockfile: '',
    })
  const staged = { path: 'src/config/thing.ts', source: 'const d = process.env.SHOPIFY_STORE_DOMAIN\n' }

  it('reads the real tree rather than an empty one', () => {
    const tracked = driver.trackedFiles()
    expect(tracked.length, 'git ls-files returned nothing').toBeGreaterThan(200)
    expect(tracked.every((f: { source: string }) => typeof f.source === 'string')).toBe(true)
    // Binary files are dropped by a NUL test, not an extension list. If that ever inverted,
    // the scanner would be handed image bytes and report `unknown-language` noise.
    expect(tracked.some((f: { path: string }) => f.path.endsWith('.png'))).toBe(false)
  })

  it('exits 0 and says so, on a tree that passes', () => {
    const { code, report } = capture([])
    expect(code, `the driver exited non-zero:\n${report}`).toBe(0)
    expect(report).toContain('No blocking findings. The boundary holds.')
    // The counts are in the report because a checker that prints only a verdict gives a
    // reader no way to notice it has stopped looking at anything.
    expect(report).toMatch(/\d+ tracked text files scanned/)
    expect(report).toMatch(/register rows: \d+/)
  })

  it('exits 1 on a synthetic tree that fails, and 0 on one that passes', () => {
    expect(capture([], synthetic([staged], [row(staged.path, 'shopify-env', 'shopify-name')])).code).toBe(0)
    expect(capture([], synthetic([staged], [row(staged.path, 'shopify-name')])).code).toBe(1)
    // …and an active contract with an empty register is not a pass.
    expect(capture([], synthetic([INERT])).report).toContain('phase-active-register-empty')
  })

  it('draft mode is idempotent, and every drafted row is already exact', () => {
    /*
     * The bug this pins shipped once and was invisible: `--draft` originally evaluated
     * against the *current* register, so once the register was populated it printed almost
     * nothing, and regenerating the document produced two rows instead of fifty-eight. A
     * drafting tool has to give the same answer every time it is asked — and since the
     * register is now reconciled per identifier, a drafted row that is not already exact
     * would fail the moment it was pasted in.
     */
    const { lines } = capture(['--draft'])
    const rows = lines.filter((l) => l.startsWith('| `'))
    expect(rows.length, 'draft printed no rows — the scanner has stopped seeing anything').toBe(
      register.length
    )
    for (const r of rows) expect(r).toMatch(/\| TODO \|/)

    const drafted = parseRegister(
      '<!-- contract:register -->\n| Path | Identifiers | a | b | c | d | e | f |\n' +
        '|---|---|---|---|---|---|---|---|\n' +
        rows.join('\n') +
        '\n<!-- /contract:register -->'
    )
    const findings = evaluate({ files: driver.trackedFiles(), contract, register: drafted }).findings
    expect(
      findings
        .filter((f: { code: string }) => f.code.startsWith('register-'))
        .map((f: { code: string; path: string }) => `${f.code} ${f.path}`)
    ).toEqual([])
  })

  /*
   * `--draft` returned 0 whatever it found, credential values included — the one mode run
   * while assembling a register was the one mode that could not report a leak.
   */
  it('mutation: draft mode still exits 1 on a credential value or an absolute prohibition', () => {
    const value = ['shp', 'ca_', '0f1e2d3c', '4b5a6978'].join('')
    const leaked = { path: 'src/leak.ts', source: `const t = '${value}'\n` }
    const cart = { path: 'src/bag.ts', source: 'await cartCreate(input)\n' }
    for (const file of [leaked, cart]) {
      const { code, report } = capture(['--draft'], synthetic([file, staged]))
      expect(code, file.path).toBe(1)
      expect(report).toContain('drafting does not waive them')
    }
    const { code, lines } = capture(['--draft'], synthetic([staged]))
    expect(code).toBe(0)
    expect(lines).toContain(
      '| `src/config/thing.ts` | shopify-env shopify-name | TODO | TODO | TODO | TODO | TODO | TODO |'
    )
  })

  it('--json prints the summary and the blocking findings as one parseable object', () => {
    const { code, report } = capture(['--json'], synthetic([staged], [row(staged.path, 'shopify-name')]))
    expect(code).toBe(1)
    const parsed = JSON.parse(report)
    expect(parsed.phase).toBe(contract.state.decommission)
    expect(parsed.scanned.trackedTextFiles).toBe(1)
    expect(parsed.register.rows).toBe(1)
    expect(parsed.blocking).toEqual([
      { code: 'register-identifiers-undeclared', path: staged.path, line: 1, id: 'shopify-env' },
    ])
  })

  it('--summary keeps the default report and adds the burn-down block', () => {
    const { code, report } = capture(
      ['--summary'],
      synthetic([staged], [row(staged.path, 'shopify-env', 'shopify-name')])
    )
    expect(code).toBe(0)
    expect(report).toMatch(/1 tracked text files scanned/)
    expect(report).toContain('Summary — phase `active`')
    expect(report).toContain('register: 1 rows · 2 identifier declarations · WS-C 1')
    expect(report).toContain('No blocking findings. The boundary holds.')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('the entry-point guard runs the gate however it is invoked', () => {
  /*
   * `import.meta.url === \`file://${process.argv[1]}\`` is false for a path with a space
   * (the URL carries `%20`) and for a symlinked checkout (argv carries the link) — and
   * false means the gate silently does nothing and exits 0, which CI reads as a pass.
   */
  const dir = mkdtempSync(path.join(os.tmpdir(), 'commerce guard '))
  const target = path.join(dir, 'verify.mjs')
  const link = path.join(dir, 'linked.mjs')
  const other = path.join(dir, 'other.mjs')
  writeFileSync(target, '')
  writeFileSync(other, '')
  symlinkSync(target, link)
  afterAll(() => rmSync(dir, { recursive: true, force: true }))

  it('matches through a URL-encoded path', () => {
    const url = pathToFileURL(target).href
    expect(url).toContain('%20')
    expect(url === `file://${target}`, 'the comparison it replaced, for the record').toBe(false)
    expect(driver.isEntryPoint(url, target)).toBe(true)
  })

  it('matches through a symlink, and through a relative argv', () => {
    expect(driver.isEntryPoint(pathToFileURL(target).href, link)).toBe(true)
    expect(driver.isEntryPoint(pathToFileURL(target).href, path.relative(process.cwd(), target))).toBe(
      true
    )
  })

  it('does not match a different file, or no argv at all', () => {
    expect(driver.isEntryPoint(pathToFileURL(target).href, other)).toBe(false)
    expect(driver.isEntryPoint(pathToFileURL(target).href, undefined)).toBe(false)
  })
})
