#!/usr/bin/env node
/**
 * The Commerce Elimination Contract, enforced against this working tree.
 *
 * Reads `COMMERCE-ELIMINATION-CONTRACT.md` and `docs/commerce-dependency-register.md`,
 * scans every tracked text file, and exits non-zero on any blocking finding. Runs in the
 * merge gate, and locally as `pnpm verify:commerce-contract`.
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
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  BLOCKING,
  auditPackages,
  evaluate,
  parseContract,
  parseRegister,
  retainedPaths,
} from './lib/commerce-contract.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const CONTRACT = 'COMMERCE-ELIMINATION-CONTRACT.md'
const REGISTER = 'docs/commerce-dependency-register.md'

const read = (rel) => readFileSync(path.join(ROOT, rel), 'utf8')

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

export function main({ log = console.log } = {}) {
  const contract = parseContract(read(CONTRACT))
  const register = parseRegister(read(REGISTER))
  const files = trackedFiles()

  /*
   * `--draft` evaluates against an *empty* register on purpose.
   *
   * The first version asked "what is unregistered right now", which made the tool useless
   * the moment it had been used once: a populated register left nothing to print, so
   * regenerating the document silently produced two rows instead of fifty-eight. A drafting
   * tool has to answer "what would a complete register contain", which is the same question
   * every time and is idempotent — the property that makes the output safe to regenerate.
   */
  const drafting = process.argv.includes('--draft')
  const { findings, scannedCount, classCounts } = evaluate({
    files,
    contract,
    retained: drafting ? new Set() : retainedPaths(register),
  })

  findings.push(
    ...auditPackages(
      {
        manifest: JSON.parse(read('package.json')),
        lockfile: read('pnpm-lock.yaml'),
      },
      contract
    )
  )

  const blocking = findings.filter((f) => BLOCKING.has(f.code))

  /*
   * `--draft` prints the register rows this tree would need, one per path, identifiers
   * deduplicated and sorted.
   *
   * It exists because the alternative is a person transcribing 600 findings into a table by
   * hand, and a register assembled that way is wrong in the direction nobody checks: it
   * omits. The six remaining columns are deliberately left as `TODO` markers rather than
   * guessed — an owner, a trigger and a rollback dependency are judgements, and a tool that
   * fills them in with plausible text produces a register that reads as reviewed and is not.
   */
  if (drafting) {
    const byPath = new Map()
    for (const f of blocking) {
      if (f.code !== 'unregistered-commerce-reference' && f.code !== 'undeclared-commerce-document')
        continue
      if (!byPath.has(f.path)) byPath.set(f.path, new Set())
      if (f.id) byPath.get(f.path).add(f.id)
    }
    for (const [p, ids] of [...byPath].sort()) {
      log(
        `| \`${p}\` | ${[...ids].sort().join(' ')} | TODO | TODO | TODO | TODO | TODO | TODO |`
      )
    }
    return 0
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
    for (const f of group.slice(0, 40)) {
      log(`   ${f.path}${f.line ? `:${f.line}` : ''}${f.id ? `  [${f.id}]` : ''}`)
      log(`     ${f.detail}`)
    }
    if (group.length > 40) log(`   … and ${group.length - 40} more`)
    log('')
  }
  return 1
}

/*
 * Only when run as a command.
 *
 * Without the guard, importing this module to point it at a known answer would scan the
 * tree, print a report and call `process.exit` inside the test runner — which is why
 * `probe-canonical-domain.mjs` and `verify-browse-only.mjs` both carry the same line. The
 * registry rule behind it is ADR 024: a verification tool that cannot be driven against a
 * fixture has never been driven against one, and every probe defect this repository has
 * found was found exactly there.
 */
if (import.meta.url === `file://${process.argv[1]}`) {
  process.exit(main())
}
