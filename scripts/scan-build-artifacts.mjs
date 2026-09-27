#!/usr/bin/env node
/**
 * The build-output half of the Commerce Elimination Contract.
 *
 * Walks `.next/` and `public/`, hands every text asset to `scripts/lib/artifact-scan.mjs`,
 * and exits 1 on any blocking finding — or on a scan that inspected nothing, because a
 * scanner pointed at a directory that does not exist reports zero findings, and zero
 * findings is what success looks like ([ADR 020](../docs/adr/020-a-test-that-cannot-fail-is-documentation.md)).
 *
 * Runs in `ci.yml`'s `verify` job directly after "Production build", inside the existing
 * required context rather than as a new job: a new check name has to be registered in branch
 * protection before it blocks anything, and until it is, it is a red X nobody is required to
 * look at (ADR 015). Invoked by path, like the contract check, because `control-registry`
 * proves a probe is wired in by finding its path in the workflow that claims to run it.
 *
 * Usage:
 *   node scripts/scan-build-artifacts.mjs           human report
 *   node scripts/scan-build-artifacts.mjs --json    machine report; still redacted
 *
 * ## Why this reads the build machine's secrets
 *
 * The contract's `value` row knows the vendor's token prefixes. It does not know the values
 * this machine actually holds, and those are the ones that can be inlined by accident — a
 * `NEXT_PUBLIC_` prefix added to the wrong variable is a one-word diff. So every environment
 * variable whose *name* marks it as a credential is also searched for by *value*, anywhere
 * in the output. The values are compiled into patterns in memory and never printed; a
 * finding names the variable, not what it holds.
 */

import { lstatSync, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { parseContract, parseRegister } from './lib/commerce-contract.mjs'
import { parseEgress } from './lib/egress.mjs'
import { classifyArtifact, formatReport, scanArtifacts, verdict } from './lib/artifact-scan.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/**
 * Environment variables worth searching for by value.
 *
 * A name ending in a credential word, not public by construction, and a value long enough
 * that finding it is not a coincidence. Twelve characters is the floor: below that, a mock
 * like `mock_token` or a word like `production` would match unrelated text and the check
 * would be muted within a week (ADR 011).
 */
export function secretValuesFrom(env) {
  return Object.entries(env)
    .filter(([name, value]) =>
      /(SECRET|TOKEN|PASSWORD|PRIVATE_KEY|API_KEY)$/i.test(name) &&
      !name.startsWith('NEXT_PUBLIC_') &&
      typeof value === 'string' &&
      value.length >= 12
    )
    .map(([name, value]) => ({ name, value }))
}

/**
 * Every file under the build output and `public/`, classified.
 *
 * Symbolic links are counted and not followed: `.next/node_modules` links into the package
 * store, and following it would scan every dependency on disk rather than what was built.
 * Binary files are dropped by a NUL-byte test, as the source scanner does, and counted.
 */
export function collectAssets(root, dirs = ['.next', 'public']) {
  const assets = []
  const skipped = {}
  const skip = (reason, bytes) => {
    skipped[reason] ??= { files: 0, bytes: 0 }
    skipped[reason].files += 1
    skipped[reason].bytes += bytes
  }

  const walk = (rel) => {
    let entries
    try {
      entries = readdirSync(path.join(root, rel), { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const child = `${rel}/${entry.name}`
      if (entry.isSymbolicLink()) {
        skip('symbolic link — not followed', 0)
        continue
      }
      if (entry.isDirectory()) {
        const probe = classifyArtifact(`${child}/`)
        // Skip a whole directory in one step when the classifier would skip its contents.
        if ('skip' in probe && probe.skip !== 'not a directory this scanner knows how to judge') {
          const size = dirSize(path.join(root, child))
          skipped[probe.skip] ??= { files: 0, bytes: 0 }
          skipped[probe.skip].files += size.files
          skipped[probe.skip].bytes += size.bytes
          continue
        }
        walk(child)
        continue
      }
      const kind = classifyArtifact(child)
      const buf = readFileSync(path.join(root, child))
      if ('skip' in kind) {
        skip(kind.skip, buf.length)
        continue
      }
      if (buf.includes(0)) {
        skip('binary — fonts, images, wasm', buf.length)
        continue
      }
      assets.push({ path: child, kind: kind.kind, side: kind.side, text: buf.toString('utf8') })
    }
  }

  for (const dir of dirs) walk(dir)
  return { assets, skipped }
}

function dirSize(abs) {
  let files = 0
  let bytes = 0
  const stack = [abs]
  while (stack.length) {
    const dir = stack.pop()
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name)
      if (entry.isDirectory()) stack.push(p)
      else if (entry.isFile()) {
        files += 1
        bytes += lstatSync(p).size
      }
    }
  }
  return { files, bytes }
}

export function main({ argv = process.argv.slice(2), env = process.env, log = console.log, root = ROOT } = {}) {
  const contractText = readFileSync(path.join(root, 'COMMERCE-ELIMINATION-CONTRACT.md'), 'utf8')
  const contract = parseContract(contractText)
  const { forbidden } = parseEgress(contractText)
  const register = parseRegister(readFileSync(path.join(root, 'docs/commerce-dependency-register.md'), 'utf8'))

  const { assets, skipped } = collectAssets(root)
  const result = scanArtifacts({
    assets,
    contract,
    forbiddenHosts: forbidden,
    register,
    secretValues: secretValuesFrom(env),
    skipped,
  })
  const v = verdict(result)

  if (argv.includes('--json')) {
    log(JSON.stringify({ ok: v.ok, reasons: v.reasons, ...result }, null, 2))
  } else {
    for (const line of formatReport(result)) log(line)
  }
  return v.ok ? 0 : 1
}

/*
 * Only when run as a command, so a test can import `main` and point it at a fixture tree.
 * Compared as resolved paths rather than as a `file://` string: the string form silently
 * does nothing under a symlinked or percent-encoded path, which is a guard that fails open.
 */
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main())
}
