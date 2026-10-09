#!/usr/bin/env node
/**
 * **Reads every server function's trace from the build output and asks what it ships.**
 *
 * Runs in `ci.yml`'s `verify` job after "Production build", inside the existing required
 * context for the reason `scan-build-artifacts.mjs` gives: a new check name blocks nothing
 * until branch protection is told about it (ADR 015). The decision lives in
 * `scripts/lib/function-traces.mjs`; this file is the transport — find the traces, resolve
 * each listed path against the repository root, hand them over, print, exit.
 *
 * Dependency-free (`node:fs`, `node:path`), like the other probes.
 *
 * Usage:  node scripts/audit-function-traces.mjs [--json]
 * Exits 0 when clean, 1 on a finding, 2 when there was nothing to read.
 */

import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { judgeTraces, renderTraces } from './lib/function-traces.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/**
 * `{ 'app/faq/page': ['node_modules/…', '.next/…'] }` for every `.nft.json` under
 * `<root>/.next/server`, with each listed path made relative to `root` and `/`-separated.
 *
 * @param {string} root
 * @returns {Record<string, string[]>}
 */
export function collectTraces(root) {
  const server = path.join(root, '.next', 'server')
  /** @type {Record<string, string[]>} */
  const traces = {}
  const walk = (dir) => {
    let entries
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const abs = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(abs)
      else if (entry.isFile() && entry.name.endsWith('.nft.json')) {
        const { files = [] } = JSON.parse(readFileSync(abs, 'utf8'))
        const name = path.relative(server, abs).split(path.sep).join('/').replace(/\.js\.nft\.json$|\.nft\.json$/, '')
        traces[name] = files.map((f) =>
          path.relative(root, path.resolve(path.dirname(abs), f)).split(path.sep).join('/')
        )
      }
    }
  }
  walk(server)
  return traces
}

/** @param {ReturnType<typeof judgeTraces>} verdict */
export function exitCode(verdict) {
  return { ok: 0, failed: 1, unevaluable: 2 }[verdict.status]
}

export function main({ argv = process.argv.slice(2), log = console.log, root = ROOT } = {}) {
  const verdict = judgeTraces(collectTraces(root))
  if (argv.includes('--json')) log(JSON.stringify(verdict, null, 2))
  else log(renderTraces(verdict).join('\n'))
  return exitCode(verdict)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exit(main())
}
