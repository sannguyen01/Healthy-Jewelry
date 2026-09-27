/**
 * The Commerce Elimination Contract, enforced against what the build **emits** rather than
 * what the repository contains.
 *
 * ## Why the source scan is not enough
 *
 * `scripts/verify-commerce-contract.mjs` reads tracked files. A bundle is not a tracked
 * file, and three things reach one that no source scan can see:
 *
 * - **A value inlined at build time.** `process.env.NEXT_PUBLIC_*` is substituted as text,
 *   so a store hostname supplied by the build environment appears in the output while the
 *   source says only `process.env.X`. The source scanner sees a variable name; the visitor
 *   receives the value.
 * - **A dependency nobody imported by name.** A transitive package compiled into a chunk
 *   shows up as a module path (`node_modules/<name>/…`), and the lockfile audit sees it only
 *   if it was resolved through this project's own lockfile.
 * - **Code the tree-shaker kept.** The source scan judges a file; the bundle is the subset
 *   of files some route actually reaches, which is the question a visitor's browser asks.
 *
 * `docs/controls.json` recorded this as the boundary's second known limit — "the
 * bundle-level question belongs to a build-output scan, which does not exist yet". This is
 * that scan.
 *
 * ## The kind of an asset is decided by who receives it, not by which directory holds it
 *
 * Next writes prerendered pages to `.next/server/app/*.html` and their RSC payloads beside
 * them. The directory says `server`; the bytes are sent to every browser verbatim. Judging
 * them by directory would apply the server's staged allowance to a page a visitor reads, so
 * they are classified `client` here and held to zero tolerance.
 *
 * | Kind | Where | Who receives it | Judged against |
 * |---|---|---|---|
 * | `client` | `.next/static/**`; prerendered `.html` `.rsc` `.meta` `.body` under `.next/server/app` | every visitor | every rule, zero tolerance |
 * | `public` | `public/**` text files | every visitor | every rule, zero tolerance |
 * | `server` | `.next/server/**` otherwise; `.next/*` deploy manifests | the function runtime | `value` and `absolute` zero tolerance; `staged` only where a retained route owns it |
 * | `sourcemap` | `*.map`, judged as the side it maps | whoever can read that side | `names` as code, `sources` for packages, the whole file for credential values |
 * | `trace` | `*.nft.json` | the deploy step, which copies what it lists | packages and credential values only |
 *
 * ## Why source maps and traces get narrower rules, and not an exemption
 *
 * A source map's `sourcesContent` is the original file **including its comments**, and the
 * contract makes a comment in a code file free on purpose. Matching the vendor name there
 * would re-litigate that decision at a different layer and fail on the comment the contract
 * protects. So the map's `names` — the identifiers that were code — are judged as code, its
 * `sources` — the module paths — are judged for prohibited packages, and the whole file is
 * judged for credential values, because a credential in a comment is still a credential
 * (contract §3, `value` scope: "a finding in any position").
 *
 * A trace file is a list of paths the deployment copies into a function. A path is not
 * code, and each file it names is already judged by the source scan under its own class —
 * but a package that Next leaves external instead of bundling appears *only* here, as
 * `node_modules/<name>/…`, so traces are scanned for exactly that. (On the first build this
 * ran against, `products/[handle]/page.js.nft.json` listed the whole repository — 75 KB of
 * paths including every superseded runbook — because `opengraph-image.tsx` reads a font
 * through a path the tracer cannot bound. That is a deployment-size finding for the route's
 * owner, not a commerce one, and it is the reason traces are not matched for the vendor
 * name.)
 *
 * ## The staged allowance, derived rather than listed
 *
 * `staged` identifiers — the vendor's name, host and environment variables — are still
 * legitimately present in one place: `/api/webhooks/shopify`, retained by a WS-F register
 * row until the subscriptions are deleted in the vendor's console. The allowance for it is
 * computed from the register and from the build itself, never from a list of chunk names,
 * because chunk names are content hashes and a pinned hash is wrong on the next build:
 *
 * 1. **The route's own output.** Everything under `.next/server/app/<route>/`.
 * 2. **Chunks only that route loads.** A chunk every one of whose referrers lies inside the
 *    route's own directory. A chunk *shared* with another route is not allowed, because
 *    code in it is reachable from somewhere the register does not excuse.
 * 3. **The route's name.** Manifests list every route by path, so the text
 *    `api/webhooks/shopify` (or `api_webhooks_shopify`, as the bundler spells a module id)
 *    appears in files that carry no webhook code at all. An occurrence lying wholly inside
 *    the route's own name is allowed anywhere on the server side; the same identifier one
 *    character outside it is not.
 *
 * The allowance is reported in full on every run — which files it covered and how many
 * matches it absorbed — because an exemption nobody can see is how a scanner becomes quiet
 * for the wrong reason ([ADR 019](../../docs/adr/019-an-unclassified-entry-is-an-unverified-one.md)).
 * An allowance that matches no asset fails: a retained route with no output means either
 * the mapping broke or the route is gone and its register row should be too
 * ([ADR 035](../../docs/adr/035-a-control-outlives-its-subject.md)).
 *
 * ## Redaction
 *
 * **No matched text leaves this module.** A finding carries the rule, the identifier id,
 * the file, the byte offset and a fixed marker. For a vendor name that costs a reader one
 * lookup; for a credential it is the difference between a CI log that reports a leak and a
 * CI log that *is* one.
 *
 * Nothing here touches the filesystem; `scripts/scan-build-artifacts.mjs` supplies the
 * assets ([ADR 024](../../docs/adr/024-a-tool-never-pointed-at-a-known-answer.md)).
 */

import { forbiddenHostPattern, forbiddenRowFor } from './egress.mjs'

// ── Which assets, and what kind ────────────────────────────────────────────

/** The kinds this scanner judges, in the order the report prints them. */
export const KINDS = ['client', 'public', 'server', 'sourcemap', 'trace']

/**
 * Parts of `.next` that are neither served nor executed at request time, each with the
 * reason it is skipped. Skipped files are counted and printed, never silently dropped.
 */
const SKIPPED_PREFIXES = [
  ['.next/cache/', 'incremental build cache — never deployed, and restored from a previous build on CI'],
  ['.next/types/', 'type declarations for the compiler'],
  ['.next/diagnostics/', 'build diagnostics'],
  ['.next/build/', 'build-time tooling chunks (the compiled config and CSS pipeline)'],
  ['.next/node_modules/', 'links to externalised packages — their paths are judged in the trace files'],
  ['.next/trace', 'build telemetry'],
]

/** Prerendered outputs Next sends to the browser byte for byte. */
const PRERENDERED = /\.(html|rsc|meta|body)$/

/**
 * Classify one path, relative to the repository root.
 *
 * @returns {{ kind: string, side: 'client' | 'server' } | { skip: string }}
 */
export function classifyArtifact(relPath) {
  const p = relPath.replace(/\\/g, '/')
  if (p.startsWith('public/')) return { kind: 'public', side: 'client' }
  if (!p.startsWith('.next/')) return { skip: 'outside the build output' }
  for (const [prefix, reason] of SKIPPED_PREFIXES) {
    if (p.startsWith(prefix)) return { skip: reason }
  }
  if (p.endsWith('.map')) {
    return { kind: 'sourcemap', side: p.startsWith('.next/static/') ? 'client' : 'server' }
  }
  if (p.endsWith('.nft.json')) return { kind: 'trace', side: 'server' }
  if (p.startsWith('.next/static/')) return { kind: 'client', side: 'client' }
  if (p.startsWith('.next/server/')) {
    return PRERENDERED.test(p) ? { kind: 'client', side: 'client' } : { kind: 'server', side: 'server' }
  }
  // `.next/routes-manifest.json`, `required-server-files.json` and the rest: what the
  // deployment reads to route requests. Server-side, and where a CSP header value lands.
  if (!p.slice('.next/'.length).includes('/')) return { kind: 'server', side: 'server' }
  return { skip: 'not a directory this scanner knows how to judge' }
}

// ── Detectors ──────────────────────────────────────────────────────────────

/**
 * Credential shapes beyond the contract's own `value` row.
 *
 * The contract's `credential-value` identifier covers the vendor's token prefixes. These
 * cover the credentials a build machine is most likely to hold for *other* reasons, and each
 * requires the body of a secret, not merely its label — a PEM parser legitimately contains
 * the string `BEGIN PRIVATE KEY`, and a scanner that failed on library code would be muted.
 */
export const CREDENTIAL_SHAPES = [
  {
    id: 'private-key-block',
    source: '-----BEGIN [A-Z ]*PRIVATE KEY-----(?:\\s|\\\\n)+[A-Za-z0-9+/]{40,}',
  },
  { id: 'aws-access-key-id', source: '\\bAKIA[0-9A-Z]{16}\\b' },
  { id: 'github-token', source: '\\bgh[pousr]_[A-Za-z0-9]{36,}\\b' },
  { id: 'live-secret-key', source: '\\b[sr]k_live_[A-Za-z0-9]{16,}\\b' },
]

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Every detector, compiled from the contract.
 *
 * @param {object} contract   `parseContract()` output: §3 identifiers and §5 packages
 * @param {{ host: string }[]} forbiddenHosts  §13 rows, via `parseEgress()`
 * @param {{ name: string, value: string }[]} [secretValues]  values the build machine
 *   holds, judged as credentials wherever they appear. Never printed.
 */
export function compileDetectors(contract, forbiddenHosts, secretValues = []) {
  if (!contract?.identifiers?.length) throw new Error('no §3 identifiers to detect')
  if (!contract?.packages?.length) throw new Error('no §5 package rules to detect')
  if (!forbiddenHosts?.length) throw new Error('no §13 hosts to detect')

  const staged = contract.identifiers.filter((i) => i.scope === 'staged')
  const detectors = []

  for (const ident of contract.identifiers) {
    detectors.push({
      rule: ident.scope === 'value' ? 'credential-shape' : 'identifier',
      id: ident.id,
      scope: ident.scope,
      regex: new RegExp(ident.source, 'gi'),
    })
  }
  for (const shape of CREDENTIAL_SHAPES) {
    detectors.push({ rule: 'credential-shape', id: shape.id, scope: 'value', regex: new RegExp(shape.source, 'g') })
  }
  for (const secret of secretValues) {
    detectors.push({
      rule: 'secret-value',
      id: `env:${secret.name}`,
      scope: 'value',
      regex: new RegExp(escapeRegExp(secret.value), 'g'),
    })
  }

  // One detector for every §13 host, each match attributed to the most specific row that
  // names it (`cdn.<vendor>` rather than `<vendor>`) — both halves are egress.mjs's, so this
  // scan, the E2E fixture and the server harness cannot disagree about a host. A host
  // finding is `staged` when the host itself carries a staged identifier — the vendor's own
  // domains are on the same shrinking surface as its name — and `absolute` otherwise:
  // nothing excuses a payment or tax host anywhere.
  detectors.push({
    rule: 'forbidden-host',
    id: null,
    scope: null,
    regex: forbiddenHostPattern(forbiddenHosts),
    resolve: (text) => ({
      id: forbiddenRowFor(text, forbiddenHosts)?.host,
      scope: staged.some((s) => s.pattern.test(text)) ? 'staged' : 'absolute',
    }),
  })

  // §5, as the bundler writes it: a module path through `node_modules`. `.pnpm/<name>@v`
  // directories are skipped by the leading-character class; the `node_modules/<name>`
  // that follows them inside the store is what is matched.
  detectors.push({
    rule: 'package',
    id: null,
    scope: 'absolute',
    regex: /node_modules\/((?:@[a-z0-9][\w.-]*\/)?[a-z0-9][\w.-]*)/gi,
    resolve: (_text, m) => {
      const rule = contract.packages.find((p) => p.pattern.test(m[1]))
      return rule ? { id: rule.source, scope: 'absolute' } : null
    },
  })

  return detectors
}

/** Detectors that judge credential values, which run over every byte of every kind. */
const isValueDetector = (d) => d.scope === 'value'

// ── The staged allowance ───────────────────────────────────────────────────

/**
 * Workstreams whose register rows license staged identifiers in server output.
 *
 * WS-F alone. Its rows are retained for a reason outside this repository — the vendor must
 * stop delivering webhooks before the endpoint may go. Every other workstream's residue is
 * work this repository can do, and this scan is one of the things that says it is not done.
 */
export const RETAINING_WORKSTREAMS = ['WS-F']

/**
 * Derive the allowance from the register and the build.
 *
 * @param {{ path: string, workstream: string }[]} register
 * @param {{ path: string, kind: string, text: string }[]} assets
 */
export function stagedAllowance(register, assets) {
  const routes = register
    .filter((row) => RETAINING_WORKSTREAMS.includes(row.workstream))
    .map((row) => row.path.match(/^src\/app\/(.+)\/route\.[jt]sx?$/))
    .filter(Boolean)
    .map((m) => ({
      route: m[1],
      dir: `.next/server/app/${m[1]}/`,
      names: [m[1], m[1].replace(/\//g, '_')],
    }))

  // A chunk's referrers: server-side assets that name its `.next`-relative path, which is
  // how a route's loader asks the runtime for it (`R.c("server/chunks/…")`). Collected in
  // one pass per asset rather than one search per chunk. Traces are excluded — they list
  // what the deployment copies, not what code loads, and one of them on this build lists
  // the entire repository.
  const referrers = new Map()
  for (const asset of assets) {
    if (asset.kind !== 'server') continue
    for (const m of asset.text.matchAll(/server\/(?:edge\/)?chunks\/[^"'`\s),]+/g)) {
      const target = `.next/${m[0]}`
      if (target === asset.path) continue
      if (!referrers.has(target)) referrers.set(target, new Set())
      referrers.get(target).add(asset.path)
    }
  }
  const exclusive = new Map()
  for (const [chunk, from] of referrers) {
    for (const r of routes) {
      if ([...from].every((p) => p.startsWith(r.dir))) exclusive.set(chunk, r.route)
    }
  }

  const matched = routes.map((r) => ({
    ...r,
    ownFiles: assets.filter((a) => a.path.startsWith(r.dir)).map((a) => a.path),
    exclusiveChunks: [...exclusive].filter(([, route]) => route === r.route).map(([p]) => p),
  }))

  return {
    routes: matched,
    /** Why a staged match at `[start, end)` of this asset is allowed, or `null`. */
    permits(asset, start, end) {
      const base = asset.kind === 'sourcemap' ? asset.path.replace(/\.map$/, '') : asset.path
      for (const r of matched) {
        if (base.startsWith(r.dir)) return `retained-route-output:${r.route}`
        if (exclusive.get(base) === r.route) return `retained-route-chunk:${r.route}`
        for (const name of r.names) {
          // Every occurrence of the route's own name that could contain this match.
          let from = Math.max(0, start - name.length)
          for (;;) {
            const at = asset.text.indexOf(name, from)
            if (at === -1 || at > start) break
            if (at + name.length >= end) return `retained-route-name:${r.route}`
            from = at + 1
          }
        }
      }
      return null
    },
  }
}

// ── The scan ───────────────────────────────────────────────────────────────

/** UTF-8 byte offsets for ascending character indices, in one pass over the text. */
function byteOffsets(text, indices) {
  const out = new Map()
  let bytes = 0
  let at = 0
  for (const idx of [...new Set(indices)].sort((a, b) => a - b)) {
    bytes += Buffer.byteLength(text.slice(at, idx), 'utf8')
    at = idx
    out.set(idx, bytes)
  }
  return out
}

/**
 * The regions of one asset each detector is allowed to read.
 *
 * A source-map field is read as one region — its entries joined by newlines, which no
 * pattern here can match across — and a hit is mapped back to its entry afterwards. Reading
 * entry by entry would be one region per identifier per detector, and a production map
 * carries thousands of identifiers.
 */
function regionsOf(asset, detector, cache) {
  const whole = { text: asset.text, field: null }
  if (isValueDetector(detector)) return [whole]
  if (asset.kind === 'trace') return detector.rule === 'package' ? [whole] : []
  if (asset.kind !== 'sourcemap') return [whole]

  // Source maps: `names` as code, `sources` for packages; `sourcesContent` only above.
  const field = detector.rule === 'package' ? 'sources' : 'names'
  if (!cache.has(field)) {
    const list = Array.isArray(asset.map?.[field]) ? asset.map[field].map(String) : []
    const starts = []
    let at = 0
    for (const entry of list) {
      starts.push(at)
      at += entry.length + 1
    }
    cache.set(field, { text: list.join('\n'), field, list, starts })
  }
  return [cache.get(field)]
}

/**
 * Where a hit inside a region sits in the raw file, as a character index, or -1.
 *
 * For a source-map field the entry is located by its JSON-quoted form, which is exact for
 * the identifiers and module paths these fields hold. Computed only for hits, so the cost
 * is paid per finding rather than per entry.
 */
function locate(asset, region, index) {
  if (!region.list) return { start: index, field: null }
  let i = region.starts.length - 1
  while (i > 0 && region.starts[i] > index) i -= 1
  const at = asset.text.indexOf(JSON.stringify(region.list[i]))
  return { start: at === -1 ? -1 : at + 1 + (index - region.starts[i]), field: `${region.field}[${i}]` }
}

/**
 * Judge every asset.
 *
 * @param {object} input
 * @param {{ path: string, kind: string, side: string, text: string }[]} input.assets
 * @param {object} input.contract          `parseContract()` output
 * @param {{ host: string }[]} input.forbiddenHosts  §13, via `parseEgress()`
 * @param {{ path: string, workstream: string }[]} input.register  `parseRegister()` output
 * @param {{ name: string, value: string }[]} [input.secretValues]
 * @param {Record<string, { files: number, bytes: number }>} [input.skipped]  for the report
 */
export function scanArtifacts({ assets, contract, forbiddenHosts, register, secretValues = [], skipped = {} }) {
  const detectors = compileDetectors(contract, forbiddenHosts, secretValues)
  const allowance = stagedAllowance(register, assets)
  const findings = []
  const allowed = new Map()

  const coverage = Object.fromEntries(KINDS.map((k) => [k, { files: 0, bytes: 0 }]))

  for (const asset of assets) {
    coverage[asset.kind].files += 1
    coverage[asset.kind].bytes += Buffer.byteLength(asset.text, 'utf8')

    if (asset.kind === 'sourcemap') {
      try {
        asset.map = JSON.parse(asset.text)
      } catch {
        findings.push({
          rule: 'unreadable-sourcemap', id: null, scope: null, path: asset.path, kind: asset.kind,
          side: asset.side, offset: 0, field: null, blocking: true, marker: '[unreadable]',
        })
      }
    }

    const hits = []
    const cache = new Map()
    for (const detector of detectors) {
      for (const region of regionsOf(asset, detector, cache)) {
        detector.regex.lastIndex = 0
        for (const m of region.text.matchAll(detector.regex)) {
          const resolved = detector.resolve ? detector.resolve(m[0], m) : { id: detector.id, scope: detector.scope }
          if (!resolved) continue
          hits.push({ detector, resolved, ...locate(asset, region, m.index), length: m[0].length })
        }
      }
    }

    const offsets = byteOffsets(
      asset.text,
      hits.filter((h) => h.start >= 0).map((h) => h.start)
    )

    for (const hit of hits) {
      const { detector, resolved, start } = hit
      let reason = null
      if (resolved.scope === 'staged' && asset.side === 'server') {
        reason = allowance.permits(asset, start, start + hit.length)
      }
      if (reason) {
        allowed.set(reason, (allowed.get(reason) ?? 0) + 1)
        continue
      }
      findings.push({
        rule: detector.rule,
        id: resolved.id,
        scope: resolved.scope,
        path: asset.path,
        kind: asset.kind,
        side: asset.side,
        offset: start >= 0 ? offsets.get(start) : -1,
        field: hit.field,
        blocking: true,
        marker: `[redacted ${detector.rule}${resolved.id ? `:${resolved.id}` : ''}]`,
      })
    }
    delete asset.map
  }

  for (const r of allowance.routes) {
    if (r.ownFiles.length === 0) {
      findings.push({
        rule: 'allowance-matches-nothing', id: r.route, scope: null, path: r.dir, kind: null,
        side: 'server', offset: -1, field: null, blocking: true, marker: '[no output]',
      })
    }
  }

  return {
    findings,
    coverage,
    skipped,
    allowance: {
      routes: allowance.routes.map((r) => ({
        route: r.route,
        dir: r.dir,
        ownFiles: r.ownFiles.length,
        exclusiveChunks: r.exclusiveChunks,
      })),
      absorbed: Object.fromEntries(allowed),
    },
  }
}

/** The verdict, separated from the report so a test can assert it without parsing text. */
export function verdict(result) {
  const inspected = Object.values(result.coverage).reduce((n, c) => n + c.files, 0)
  const reasons = []
  if (inspected === 0) reasons.push('no assets were inspected — a scan of nothing is not a pass')
  if (inspected > 0 && result.coverage.client.files === 0)
    reasons.push('no client assets were inspected — this is not the output of a build')
  if (inspected > 0 && result.coverage.server.files === 0)
    reasons.push('no server assets were inspected — this is not the output of a build')
  const blocking = result.findings.filter((f) => f.blocking)
  if (blocking.length > 0) reasons.push(`${blocking.length} blocking finding(s)`)
  return { ok: reasons.length === 0, reasons, inspected, blocking: blocking.length }
}

const kb = (n) => `${(n / 1024).toFixed(1)} KB`

/**
 * The human report. Built only from finding fields — never from asset text — so there is no
 * path by which a matched value reaches the terminal.
 */
export function formatReport(result, { limit = 25 } = {}) {
  const v = verdict(result)
  const lines = ['Build artifact scan — contract §3, §5 and §13 against what the build emits', '']
  lines.push('  inspected:')
  for (const k of KINDS) {
    const c = result.coverage[k]
    lines.push(`    ${k.padEnd(10)} ${String(c.files).padStart(5)} files  ${kb(c.bytes).padStart(10)}`)
  }
  const skippedEntries = Object.entries(result.skipped ?? {})
  if (skippedEntries.length) {
    lines.push('  skipped, with the reason:')
    for (const [reason, c] of skippedEntries) lines.push(`    ${String(c.files).padStart(5)} files  ${kb(c.bytes).padStart(10)}  ${reason}`)
  }
  lines.push(`  staged allowance (derived from ${RETAINING_WORKSTREAMS.join(', ')} register rows and the build):`)
  if (result.allowance.routes.length === 0) lines.push('    none — no retained route')
  for (const r of result.allowance.routes) {
    lines.push(`    /${r.route}: ${r.ownFiles} own file(s) under ${r.dir}; ${r.exclusiveChunks.length} chunk(s) only it loads`)
    for (const c of r.exclusiveChunks) lines.push(`      ${c}`)
  }
  for (const [reason, n] of Object.entries(result.allowance.absorbed)) lines.push(`    absorbed ${n} match(es): ${reason}`)
  lines.push('')

  const blocking = result.findings.filter((f) => f.blocking)
  if (blocking.length === 0 && v.ok) {
    lines.push('No blocking findings. Nothing the contract forbids reached the build output.')
    return lines
  }

  const groups = new Map()
  for (const f of blocking) {
    const key = `${f.side} · ${f.rule}${f.id ? ` · ${f.id}` : ''}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(f)
  }
  lines.push(`${blocking.length} blocking finding(s). Matched text is never printed.`)
  for (const [key, group] of [...groups].sort((a, b) => b[1].length - a[1].length)) {
    lines.push(`── ${key} (${group.length})`)
    for (const f of group.slice(0, limit)) {
      lines.push(`   ${f.path}${f.offset >= 0 ? ` @${f.offset}` : ''}${f.field ? ` ${f.field}` : ''}  ${f.marker}`)
    }
    if (group.length > limit) lines.push(`   … and ${group.length - limit} more`)
  }
  for (const reason of v.reasons.filter((r) => !r.includes('blocking'))) lines.push(`!! ${reason}`)
  return lines
}
