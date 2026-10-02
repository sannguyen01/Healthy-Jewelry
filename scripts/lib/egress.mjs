/**
 * Where this deployment may send bytes, as a pure judgement over a list of URLs.
 *
 * ## Why this is a module and not two copies
 *
 * The same question is asked on two sides of the network, by two different harnesses:
 *
 * | Side | Asked by | What it sees |
 * |---|---|---|
 * | `browser` | `e2e/support/test.ts`, an automatic Playwright fixture | every request any page in the test's browser context makes |
 * | `server` | `src/tests/unit/server-egress.test.ts`, a stubbed `fetch` | every outbound call a route handler makes |
 *
 * Contract §12 answers it once and §13 answers the prohibition once. Two harnesses holding
 * their own host lists is how the lists come to disagree, and the disagreement is always
 * discovered by somebody asking why a check passed. So both parse the contract through
 * this file, and a third reader — the CSP test — asks it whether a directive names a
 * forbidden host.
 *
 * ## Why §13 outranks §12
 *
 * A host that is both approved and forbidden is forbidden. The allowlist is the answer to
 * "what may this site talk to"; the denylist is the answer to "what may it never talk to
 * again", and the second is the one the decommission exists to keep true. A future row
 * approving a broad pattern — `https://*.example.com` for a vendor that happens to share a
 * parent domain with a payment host — must not be able to re-open a closed door by being
 * wider than the door. Evaluated in that order, it cannot.
 *
 * ## What this does not know
 *
 * It judges URLs it is handed. A request nothing recorded is a request this never sees:
 * the browser fixture records through `context.on('request')`, which a request blocked by
 * the Content-Security-Policy never reaches — which is why the fixture listens for CSP
 * violations as well, and why a missing CSP header would weaken this check rather than
 * break it. The server harness sees only `globalThis.fetch`; a route that opened a raw
 * socket would be invisible to it. Both limits are stated in `docs/controls.json` rather
 * than left to be found.
 *
 * Nothing here touches the filesystem or the network, for the reason every decision module
 * in `scripts/lib` gives: a judge fused to its input can only be tested against the input
 * it happens to be run in ([ADR 024](../../docs/adr/024-a-tool-never-pointed-at-a-known-answer.md)).
 */

import { section, tableRows, unticked } from './commerce-contract.mjs'

/** The two places a request can come from. Anything else in the `Side` column is a typo. */
export const SIDES = ['browser', 'server']

/**
 * Schemes that name something other than a network peer.
 *
 * `data:` and `blob:` are bytes the page already holds; `about:` is the empty document
 * every frame starts as. None of them leaves the machine, so none of them can be egress —
 * but each is still *approved by a row*, not by this list, so the contract remains the
 * only place that says what is allowed. This list exists only so a row naming one of them
 * parses as a scheme rather than as a malformed origin.
 */
const NON_NETWORK_SCHEMES = new Set(['data:', 'blob:', 'about:'])

/** A DNS name, lower-case, at least two labels. Deliberately strict: a pattern is a key. */
const HOSTNAME = /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z][a-z0-9-]*[a-z0-9]$/

/**
 * One §12 origin pattern, compiled.
 *
 * Four shapes and no others, because a pattern language nobody can enumerate is a pattern
 * language nobody can review:
 *
 * - `self` — the site's own origin, whatever it is in the run being judged. Written as a
 *   keyword rather than a URL because the E2E server is `http://localhost:3000` and
 *   production is not, and a contract that named either would be wrong about the other.
 * - `data:` / `blob:` / `about:` — a scheme, matched on the URL's protocol alone.
 * - `https://host` — exactly that scheme and host, on the default port.
 * - `https://*.host` — that scheme, and any host *beneath* `host`. Not `host` itself: a
 *   per-database subdomain is what the rate limiter's vendor issues, and approving the
 *   apex as well would be approving something nobody asked for.
 */
export function compileOriginPattern(pattern) {
  const raw = pattern.trim()
  if (raw === 'self') return { kind: 'self', pattern: raw }
  if (NON_NETWORK_SCHEMES.has(raw)) return { kind: 'scheme', pattern: raw, scheme: raw }

  const m = raw.match(/^(https?):\/\/(\*\.)?([^/:*]+)$/)
  if (!m) {
    throw new Error(
      `§12 origin pattern \`${pattern}\` is not one of the four shapes this parser accepts ` +
        `(\`self\`, a non-network scheme, \`https://host\`, \`https://*.host\`). A pattern the ` +
        `judge cannot read would otherwise match nothing, and an allowlist entry that matches ` +
        `nothing is an approval nobody can see is inert.`
    )
  }
  const host = m[3].toLowerCase()
  if (!HOSTNAME.test(host)) {
    throw new Error(`§12 origin pattern \`${pattern}\` names \`${host}\`, which is not a hostname.`)
  }
  return {
    kind: m[2] ? 'subdomains' : 'exact',
    pattern: raw,
    scheme: `${m[1]}:`,
    host,
  }
}

/**
 * Contract §12 and §13, parsed and validated.
 *
 * Throws on an empty table, an unknown side, or a malformed pattern — never returns an
 * empty list, for the reason `section()` throws on a missing anchor: a rule enforced
 * against nothing passes and checks nothing
 * ([ADR 020](../../docs/adr/020-a-test-that-cannot-fail-is-documentation.md)).
 */
export function parseEgress(markdown) {
  const allowed = tableRows(section(markdown, 'egress-allowed')).map((cells) => {
    const side = (cells[1] ?? '').trim()
    if (!SIDES.includes(side)) {
      throw new Error(
        `§12 row \`${cells[0]}\` declares side \`${side}\`; expected one of ${SIDES.join(', ')}.`
      )
    }
    return { ...compileOriginPattern(unticked(cells[0])), side, why: cells[2] ?? '' }
  })

  const forbidden = tableRows(section(markdown, 'egress-forbidden')).map((cells) => {
    const host = unticked(cells[0]).trim().toLowerCase()
    if (!HOSTNAME.test(host)) {
      throw new Error(
        `§13 host pattern \`${cells[0]}\` is not a bare hostname. A §13 row matches that ` +
          `host and every host beneath it, so it is written without a scheme or a wildcard.`
      )
    }
    return { host, why: cells[1] ?? '' }
  })

  for (const side of SIDES) {
    if (!allowed.some((row) => row.side === side)) {
      throw new Error(
        `§12 approves nothing on the ${side} side. An empty allowlist would make every ` +
          `request on that side a finding, which reads as a broken check and gets muted.`
      )
    }
  }
  if (forbidden.length === 0) throw new Error('§13 forbids no host.')

  return { allowed, forbidden }
}

/**
 * The §13 row a hostname falls under, or `null`.
 *
 * A row matches its host and every host beneath it, on a **label boundary**: `cdn.` in
 * front of a forbidden host is the same vendor, but a forbidden host with letters glued
 * to its front is somebody else's domain. `evil-<host>` is not forbidden by this; it is
 * simply not approved, which §12 already refuses.
 *
 * **The most specific row wins**, whatever the table order. §13 lists a vendor's apex
 * above its subdomains, so first-match would attribute every subdomain to the apex row and
 * the subdomain rows could never be named — and the three harnesses that call this (the
 * E2E fixture, the server harness, the artifact scan) would each have to re-sort to get a
 * useful answer, which is how one of them came to carry its own copy of this rule.
 */
export function forbiddenRowFor(hostname, forbidden) {
  const host = String(hostname).toLowerCase().replace(/\.$/, '')
  if (!host) return null
  let best = null
  for (const row of forbidden) {
    if ((host === row.host || host.endsWith(`.${row.host}`)) && row.host.length > (best?.host.length ?? -1)) {
      best = row
    }
  }
  return best
}

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Every §13 host, and every host beneath one, as a pattern for finding them in text — a
 * built asset, a served page. Global, so a caller collects every match; attribute each
 * match to its row with `forbiddenRowFor`.
 *
 * Bounded on both sides by a character that cannot continue a hostname, which is the
 * label-boundary rule `forbiddenRowFor` states, applied to free text: a forbidden host with
 * letters glued to its front is somebody else's domain.
 */
export function forbiddenHostPattern(forbidden) {
  if (!forbidden?.length) throw new Error('no §13 hosts to build a pattern from')
  const hosts = forbidden.map((r) => r.host).sort((a, b) => b.length - a.length)
  return new RegExp(
    `(?<![a-z0-9-])(?:[a-z0-9-]+\\.)*(?:${hosts.map(escapeRegExp).join('|')})(?![a-z0-9-])`,
    'gi'
  )
}

/** The §12 row a URL falls under on one side, or `null`. */
export function allowedRowFor(url, { siteOrigin, allowed, side }) {
  for (const row of allowed) {
    if (row.side !== side) continue
    if (row.kind === 'self' && siteOrigin && url.origin === new URL(siteOrigin).origin) return row
    if (row.kind === 'scheme' && url.protocol === row.scheme) return row
    if (row.kind === 'exact' && url.protocol === row.scheme && url.hostname === row.host && !url.port)
      return row
    if (
      row.kind === 'subdomains' &&
      url.protocol === row.scheme &&
      url.hostname.endsWith(`.${row.host}`) &&
      !url.port
    )
      return row
  }
  return null
}

/**
 * Judge every URL a harness recorded.
 *
 * @param {Iterable<string>} requestUrls  what was requested, in order, duplicates allowed
 * @param {object} policy
 * @param {string} [policy.siteOrigin]    the origin `self` means in this run
 * @param {ReturnType<typeof parseEgress>['allowed']} policy.allowed
 * @param {ReturnType<typeof parseEgress>['forbidden']} policy.forbidden
 * @param {'browser' | 'server'} [policy.side]
 * @returns {{ code: 'forbidden-origin' | 'unapproved-origin' | 'unparseable-url', origin: string, count: number, example: string, rule?: string }[]}
 *
 * One finding per distinct origin, with a count, rather than one per request: a page that
 * polls a forbidden host forty times has one defect, and a report with forty identical
 * lines is a report people scroll past. The first URL seen is kept as the example because
 * the path is usually what tells a reader *which* code made the call.
 */
export function judgeEgress(requestUrls, { siteOrigin, allowed, forbidden, side = 'browser' }) {
  if (!SIDES.includes(side)) throw new Error(`unknown side \`${side}\``)
  if (side === 'browser' && !siteOrigin) {
    // Without it `self` matches nothing and every same-origin request becomes a finding —
    // a check that fails on everything is a check that gets switched off.
    throw new Error('judgeEgress needs the site origin to judge the browser side')
  }

  const byOrigin = new Map()
  const note = (code, origin, example, rule) => {
    const key = `${code}\0${origin}`
    const existing = byOrigin.get(key)
    if (existing) existing.count += 1
    else byOrigin.set(key, { code, origin, count: 1, example, ...(rule ? { rule } : {}) })
  }

  for (const raw of requestUrls) {
    let url
    try {
      url = new URL(raw)
    } catch {
      // Fail closed. A string the URL parser refuses is not something to wave through on
      // the grounds that it probably went nowhere.
      note('unparseable-url', String(raw), String(raw))
      continue
    }

    const origin = url.origin === 'null' ? url.protocol : url.origin
    const hit = forbiddenRowFor(url.hostname, forbidden)
    if (hit) {
      note('forbidden-origin', origin, raw, hit.host)
      continue
    }
    if (allowedRowFor(url, { siteOrigin, allowed, side })) continue
    note('unapproved-origin', origin, raw)
  }

  return [...byOrigin.values()]
}

/**
 * The host a CSP source expression names, or `null` for a keyword or scheme source.
 *
 * `'self'`, `'none'`, `'unsafe-inline'`, `data:` and `blob:` name no host. Everything else
 * — `https://x.example`, `*.example`, `x.example:443`, `wss://x.example/path` — is reduced
 * to its hostname with any leading wildcard label removed, so `*.<forbidden host>` in a
 * directive is judged exactly as the host itself would be.
 */
export function hostOfCspSource(token) {
  const t = String(token).trim()
  if (!t || t.startsWith("'") || /^[a-z][a-z0-9+.-]*:$/i.test(t)) return null
  const withoutScheme = t.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '')
  const host = withoutScheme.split(/[/:]/)[0].replace(/^\*\./, '').toLowerCase()
  return host || null
}

/** One finding, as a sentence. Never prints anything but URLs. */
export function describeEgressFinding(f, side) {
  const what =
    f.code === 'forbidden-origin'
      ? `forbidden by §13 (${f.rule})`
      : f.code === 'unapproved-origin'
        ? `not approved by §12 for the ${side} side`
        : 'not a URL the parser accepts'
  return `${f.origin} — ${what}; ${f.count} request(s), e.g. ${f.example}`
}

/** Human-readable lines for a set of findings, one per finding, indented for a report. */
export function formatEgressFindings(findings, side) {
  return findings.map((f) => `  ${describeEgressFinding(f, side)}`)
}
