#!/usr/bin/env node
/**
 * The Commerce Elimination Contract, enforced against this working tree.
 *
 * Reads `COMMERCE-ELIMINATION-CONTRACT.md` and `docs/commerce-dependency-register.md`,
 * scans every tracked text file, and exits non-zero on any blocking finding. Runs in the
 * merge gate, and locally as `pnpm verify:commerce-contract`.
 *
 *     node scripts/verify-commerce-contract.mjs            the gate
 *     node scripts/verify-commerce-contract.mjs --summary  the gate, plus every burn-down number
 *     node scripts/verify-commerce-contract.mjs --json     the same numbers, for a machine
 *     node scripts/verify-commerce-contract.mjs --draft    the register rows this tree needs
 *
 * ## Why the driver is this thin
 *
 * Everything that decides anything lives in `scripts/lib/commerce-contract.mjs`, which
 * touches no filesystem and takes its input as arguments. This file supplies the tree.
 * That split is not tidiness: a checker fused to its own input can only be tested against
 * whatever tree it happens to run in, which is the one input nobody chose, and the two
 * probes this repository wrote that way were both wrong the first time they met real data
 * ([ADR 024](../docs/adr/024-a-tool-never-pointed-at-a-known-answer.md),
 * [ADR 028](../docs/adr/028-a-fixture-is-the-input-you-thought-of.md)).
 *
 * ## Why `git ls-files` and not a directory walk
 *
 * A walk sees `node_modules`, `.next` and every untracked scratch file, and the difference
 * between "this repository contains a Shopify reference" and "this checkout does" is the
 * entire question. Tracked files are what a clean clone gets, which is what condition 1 of
 * the contract is about.
 */

import { execFileSync } from 'node:child_process'
import { readFileSync, realpathSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  BLOCKING,
  assessPhase,
  auditPackages,
  evaluate,
  parseContract,
  parseRegister,
  summarise,
} from './lib/commerce-contract.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const CONTRACT = 'COMMERCE-ELIMINATION-CONTRACT.md'
const REGISTER = 'docs/commerce-dependency-register.md'

const read = (rel) => readFileSync(path.join(ROOT, rel), 'utf8')

/**
 * Findings `--draft` still fails on.
 *
 * A drafting run exists to print rows for the *registrable* surface, so it ignores what a
 * row would fix. It must not ignore what no row can fix. Its first version returned 0
 * unconditionally — including over a committed credential value — which made the one mode
 * somebody runs while assembling a register the one mode that could not report a leak.
 */
export const DRAFT_FATAL = new Set(['credential-value-committed', 'absolute-prohibition-in-code'])

/**
 * Every tracked file, with its bytes.
 *
 * Binary files are dropped by a NUL-byte test rather than by an extension list, because an
 * extension list is a second inventory to keep in step with the contract's `excluded`
 * globs. A file that is unreadable as UTF-8 is not a file this scanner has an opinion
 * about, and the `excluded` globs still have to justify themselves independently.
 */
export function trackedFiles() {
  const out = execFileSync('git', ['ls-files', '-z'], { cwd: ROOT, maxBuffer: 64 * 1024 * 1024 })
  const names = out.toString('utf8').split('\0').filter(Boolean)
  const files = []
  for (const name of names) {
    let buf
    try {
      buf = readFileSync(path.join(ROOT, name))
    } catch {
      continue // a submodule or a deleted-but-tracked path
    }
    if (buf.includes(0)) continue
    files.push({ path: name, source: buf.toString('utf8') })
  }
  return files
}

/** Format one finding as the two lines every mode prints. */
const describe = (f) => [
  `   ${f.path}${f.line ? `:${f.line}` : ''}${f.id ? `  [${f.id}]` : ''}`,
  `     ${f.detail}`,
]

/** The `--summary` block: every number a burn-down document would otherwise hand-type. */
export function formatSummary(s) {
  const out = []
  const kv = (o) =>
    Object.entries(o)
      .filter(([, n]) => n > 0)
      .map(([k, n]) => `${k} ${n}`)
      .join(' · ')
  out.push(`Summary — phase \`${s.phase}\``)
  out.push(`  tracked text files: ${s.scanned.trackedTextFiles}`)
  out.push(`    by class:    ${kv(s.scanned.byClass)}`)
  out.push(`    by language: ${kv(s.scanned.byLanguage)}`)
  out.push(
    `  packages: ${s.packages.manifest} declared or forced by package.json · ` +
      `${s.packages.lockfile} locked in pnpm-lock.yaml · ${s.packages.rules} prohibition rules`
  )
  out.push(
    `  register: ${s.register.rows} rows · ${s.register.identifierDeclarations} identifier ` +
      `declarations · ${kv(s.register.byWorkstream)}`
  )
  out.push('  identifiers observed, by scope:')
  for (const [scope, v] of Object.entries(s.identifiers)) {
    out.push(`    ${scope}: ${v.occurrences} occurrence(s) in ${v.files} file(s) — ${kv(v.byDisposition) || 'none'}`)
    for (const [id, n] of Object.entries(v.ids)) out.push(`      ${id} ${n}`)
  }
  out.push('  whole-file exemptions (declared Carries = observed):')
  for (const e of s.exemptions) {
    const agree = e.declared.slice().sort().join(' ') === e.observed.join(' ')
    out.push(`    ${agree ? 'ok  ' : 'DIFF'} ${e.glob} (${e.klass}): ${e.observed.join(' ') || '—'}`)
  }
  out.push(`  blocking findings: ${s.findings.blocking}${s.findings.blocking ? ` — ${kv(s.findings.byCode)}` : ''}`)
  return out
}

/**
 * The five inputs, read from this working tree.
 *
 * Separate from `main()` so a test can hand `main()` a tree it chose — a credential value,
 * an absolute prohibition — and assert the exit code, rather than only ever asserting what
 * this repository happens to contain today.
 */
export function loadTree() {
  return {
    contract: parseContract(read(CONTRACT)),
    register: parseRegister(read(REGISTER)),
    files: trackedFiles(),
    manifest: JSON.parse(read('package.json')),
    lockfile: read('pnpm-lock.yaml'),
  }
}

/**
 * @param {object} [options]
 * @param {(line: string) => unknown} [options.log]
 * @param {string[]} [options.argv]
 * @param {() => object} [options.load]  a tree to judge instead of this one; see `loadTree()`
 * @returns {number} the exit code
 */
export function main({ log = console.log, argv = process.argv, load = loadTree } = {}) {
  const { contract, register, files, manifest, lockfile } = load()

  /*
   * `--draft` evaluates against an *empty* register on purpose.
   *
   * The first version asked "what is unregistered right now", which made the tool useless
   * the moment it had been used once: a populated register left nothing to print, so
   * regenerating the document silently produced two rows instead of fifty-eight. A drafting
   * tool has to answer "what would a complete register contain", which is the same question
   * every time and is idempotent — the property that makes the output safe to regenerate.
   */
  const drafting = argv.includes('--draft')
  const result = evaluate({ files, contract, register: drafting ? [] : register })
  const { findings, scannedCount, classCounts } = result

  findings.push(...auditPackages({ manifest, lockfile }, contract))
  if (!drafting) findings.push(...assessPhase({ contract, register }))

  const blocking = findings.filter((f) => BLOCKING.has(f.code))

  /*
   * `--draft` prints the register rows this tree would need, one per path, identifiers
   * sorted — read straight from the scan's `eligible` map, which is the exact set the
   * reconciliation will later hold each row to. A drafted row is therefore already exact:
   * pasting it back in cannot produce `register-identifiers-*`.
   *
   * It exists because the alternative is a person transcribing 600 findings into a table by
   * hand, and a register assembled that way is wrong in the direction nobody checks: it
   * omits. The six remaining columns are deliberately left as `TODO` markers rather than
   * guessed — an owner, a trigger and a rollback dependency are judgements, and a tool that
   * fills them in with plausible text produces a register that reads as reviewed and is not.
   */
  if (drafting) {
    for (const [p, ids] of [...result.eligible].sort(([a], [b]) => a.localeCompare(b))) {
      log(
        `| \`${p}\` | ${[...ids.keys()].sort().join(' ')} | TODO | TODO | TODO | TODO | TODO | TODO |`
      )
    }
    const fatal = findings.filter((f) => DRAFT_FATAL.has(f.code))
    if (fatal.length === 0) return 0
    log('')
    log(`${fatal.length} finding(s) no register row can excuse — drafting does not waive them:\n`)
    for (const f of fatal) {
      log(`── ${f.code}`)
      for (const line of describe(f)) log(line)
    }
    return 1
  }

  if (argv.includes('--json')) {
    const summary = summarise({ files, contract, register, result, manifest, lockfile, findings })
    log(
      JSON.stringify(
        {
          ...summary,
          blocking: blocking.map(({ code, path: p, line, id }) => ({ code, path: p, line, id: id ?? null })),
        },
        null,
        2
      )
    )
    return blocking.length === 0 ? 0 : 1
  }

  log(`Commerce Elimination Contract — ${scannedCount} tracked text files scanned`)
  log(
    `  classes: ` +
      Object.entries(classCounts)
        .filter(([, n]) => n > 0)
        .map(([k, n]) => `${k} ${n}`)
        .join(' · ')
  )
  log(`  register rows: ${register.length}`)
  log(`  identifiers: ${contract.identifiers.length} · package rules: ${contract.packages.length}`)
  log('')

  if (argv.includes('--summary')) {
    const summary = summarise({ files, contract, register, result, manifest, lockfile, findings })
    for (const line of formatSummary(summary)) log(line)
    log('')
  }

  if (blocking.length === 0) {
    log('No blocking findings. The boundary holds.')
    return 0
  }

  const byCode = new Map()
  for (const f of blocking) {
    if (!byCode.has(f.code)) byCode.set(f.code, [])
    byCode.get(f.code).push(f)
  }

  log(`${blocking.length} blocking finding(s):\n`)
  for (const [code, group] of [...byCode].sort((a, b) => b[1].length - a[1].length)) {
    log(`── ${code} (${group.length})`)
    for (const f of group.slice(0, 40)) for (const line of describe(f)) log(line)
    if (group.length > 40) log(`   … and ${group.length - 40} more`)
    log('')
  }
  return 1
}

/**
 * Whether this module is the process's entry point.
 *
 * The comparison it replaces — `import.meta.url === \`file://${process.argv[1]}\`` — is
 * false whenever the two spellings of one file differ: a path with a space (the URL has
 * `%20`, argv has the space), a symlinked checkout (argv has the link, the URL has the
 * target), a relative invocation on some runtimes. False means the gate *silently does
 * nothing and exits 0*, which in CI reads exactly like a clean tree. Both sides are
 * therefore reduced to one real, absolute filesystem path before they are compared.
 */
export function isEntryPoint(metaUrl, argv1) {
  if (!argv1) return false
  const canonical = (p) => {
    const abs = path.resolve(p)
    try {
      return realpathSync(abs)
    } catch {
      return abs
    }
  }
  return canonical(fileURLToPath(metaUrl)) === canonical(argv1)
}

/*
 * Only when run as a command.
 *
 * Without the guard, importing this module to point it at a known answer would scan the
 * tree, print a report and call `process.exit` inside the test runner — which is why
 * `probe-canonical-domain.mjs` and `verify-browse-only.mjs` both carry a guard too. The
 * registry rule behind it is ADR 024: a verification tool that cannot be driven against a
 * fixture has never been driven against one, and every probe defect this repository has
 * found was found exactly there.
 */
if (isEntryPoint(import.meta.url, process.argv[1])) {
  process.exit(main())
}
