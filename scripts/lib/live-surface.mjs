// Healthy Jewelry — what does the live site actually serve, on every host that answers for it?
//
// ## Why this exists
//
// The repository says nothing on this site can be bought, and its checks agree: no price in
// the source, no Offer in JSON-LD, no cart route. A retrieval of the live site reportedly
// showed prices anyway. Both can be true, and which explanation holds decides whose problem it
// is — so the question is not "is there commerce on the site" but **where in the chain it
// appears**:
//
//   · only an external retrieval shows it       → the retrieval, a crawler cache or an index
//   · the apex or www differs from the deployment the apex says it is serving
//                                               → an alias, DNS, or the CDN
//   · the apex and the deployment URL both serve it
//                                               → the source, the build, or the deploy chain
//   · HTTP is clean everywhere                  → clean over HTTP; browser-only residue
//                                                 (storage, a service worker) is the E2E
//                                                 suite's question, not this one
//
// Those are the owner's four diagnostic rules, encoded in {@link classifyDiscrepancy}. The
// probe that gathers the evidence is `scripts/probe-live-surface.mjs`; everything here is pure,
// so each rule is reachable from a fixture rather than from whatever production happens to be
// doing on the day (ADR 024, ADR 030).
//
// Nothing here keeps its own list. The retired routes are contract §7 and the forbidden hosts
// are §13, both handed in by the probe from the one parse the merge gate uses; the structural
// commerce markers and the price detector are `browse-only.mjs`'s. A hand-kept copy of §7 here
// had already lost the retired API endpoints and the pre-repositioning categories, and a
// four-domain host pattern could not see a payment host at all.

import { COMMERCE_MARKERS, UNKNOWN_HANDLE, detectVisiblePrice, sameSite, visibleText } from './browse-only.mjs'
import { wildcardPrefix } from './commerce-contract.mjs'

/** A product no catalogue will ever hold; must answer 404. */
export const UNKNOWN_PRODUCT_PATH = `/products/${UNKNOWN_HANDLE}`

/**
 * Commerce-era URLs to probe, one per contract §7 row: the route itself, or one path beneath
 * a `:path*` family. Any of them answering 2xx is commerce resurrected; a 3xx, 404 or 410 is
 * the retirement working. The *expected* status of each is asserted over real HTTP by
 * `e2e/retired-routes.spec.ts` — not here, because this probe asks a different question: not
 * "is the status exactly right" but "is anything live behind it".
 *
 * @param {ReadonlyArray<{ route: string }>} routesForbidden `parseContract(...).routesForbidden`
 */
export function retiredPaths(routesForbidden) {
  if (!routesForbidden?.length) throw new Error('§7 retires no route, so there is nothing to probe')
  return routesForbidden.map(({ route }) => {
    const prefix = wildcardPrefix(route)
    return prefix === null ? route : `${prefix}/test`
  })
}

/**
 * Every path to probe, in order.
 *
 * @param {string | null} firstHandle the first product handle in the catalogue, or null
 * @param {ReadonlyArray<{ route: string }>} routesForbidden contract §7
 * @returns {Array<{ path: string, kind: 'public' | 'unknown' | 'retired' }>}
 */
export function probePaths(firstHandle, routesForbidden) {
  return [
    { path: '/', kind: 'public' },
    { path: '/shop', kind: 'public' },
    { path: '/materials', kind: 'public' },
    ...(firstHandle ? [{ path: `/products/${firstHandle}`, kind: 'public' }] : []),
    { path: UNKNOWN_PRODUCT_PATH, kind: 'unknown' },
    ...retiredPaths(routesForbidden).map((path) => ({ path, kind: 'retired' })),
  ]
}

/** Response headers worth recording. Values are public by construction; no request header is. */
export const HEADER_SUBSET = /** @type {const} */ ([
  'server',
  'x-vercel-id',
  'x-vercel-cache',
  'age',
  'cache-control',
  'etag',
  'content-type',
  'x-robots-tag',
  'strict-transport-security',
])

/**
 * The recorded subset of a response's headers, plus whether a CSP is present at all.
 *
 * The CSP's *value* is not recorded: it is long, it changes with every allowlist edit, and the
 * question this evidence answers is only whether one is served.
 *
 * @param {(name: string) => string | null} get
 */
export function pickHeaders(get) {
  const headers = {}
  for (const name of HEADER_SUBSET) {
    const value = get(name)
    if (value !== null && value !== undefined) headers[name] = value
  }
  headers['content-security-policy-present'] = get('content-security-policy') !== null
  return headers
}

/** A redirect chain longer than this is a loop or a policy, not a destination. */
export const MAX_REDIRECTS = 3

/**
 * Whether to follow one redirect hop.
 *
 * Same registrable domain only. Apex to `www` is one site; a hop to `vercel.com/sso` (deployment
 * protection) or to anybody else is recorded and not followed, because a probe that chases a
 * redirect off the brand's domain reports some other origin's content as ours — the rule
 * `verify-browse-only.mjs` already keeps.
 *
 * @param {string} fromUrl
 * @param {number} status
 * @param {string | null} location
 * @param {number} hopsSoFar
 * @returns {{ follow: boolean, to: string | null, reason: string }}
 */
export function nextHop(fromUrl, status, location, hopsSoFar) {
  if (!(status >= 300 && status < 400) || !location) return { follow: false, to: null, reason: 'final' }
  let to
  try {
    to = new URL(location, fromUrl)
  } catch {
    return { follow: false, to: null, reason: 'unparseable-location' }
  }
  if (hopsSoFar >= MAX_REDIRECTS) return { follow: false, to: to.toString(), reason: 'too-many-redirects' }
  if (!sameSite(new URL(fromUrl).hostname, to.hostname)) {
    return { follow: false, to: to.toString(), reason: 'off-site' }
  }
  return { follow: true, to: to.toString(), reason: 'same-site' }
}

/**
 * Copy that belonged to the purchase era. **Observations, not findings.**
 *
 * `/shipping`, `/terms`, `/faq` and `/about` still carry some of this in source today, pending
 * legal review (WS-H) — so a hit here is the site accurately serving what the repository holds,
 * and a check that failed on it would be red for a reason nobody in CI can act on. It is
 * recorded so a reader comparing an external retrieval against the live site can see that
 * "free shipping" on a live page is present in source, not residue.
 */
export const PURCHASE_ERA_LEXICON = /** @type {const} */ ([
  { id: 'free-shipping', pattern: /\bfree\s+shipping\b/i },
  { id: 'returns', pattern: /\breturns?\b/i },
  { id: 'refund', pattern: /\brefunds?\b/i },
  { id: 'dispatch', pattern: /\bdispatch(?:ed|es)?\b/i },
  { id: 'warranty', pattern: /\bwarrant(?:y|ies)\b/i },
])

/**
 * A purchase control, judged structurally: the test ids the removed controls carried, a form
 * posting to a cart, or a button or link whose own text asks the visitor to buy. Prose saying
 * "there is no checkout" is not a control, which is why this does not match the bare word.
 */
const PURCHASE_CONTROLS = [
  { id: 'add-to-bag-testid', pattern: /data-testid=["']add-to-bag["']/i },
  { id: 'checkout-testid', pattern: /data-testid=["']checkout-button["']/i },
  { id: 'cart-form', pattern: /<form\b[^>]*action=["'][^"']*\/cart(?:\/add)?\b/i },
  {
    id: 'buy-control',
    pattern: /<(button|a)\b[^>]*>(?:(?!<\/\1>)[\s\S]){0,200}?\b(?:add\s+to\s+(?:bag|cart)|check\s?out|buy\s+now)\b/i,
  },
]

/**
 * Everything the detectors say about one body.
 *
 * `commerce` is true only for the blocking detectors — a visible price, a JSON-LD offer, a
 * forbidden host, a purchase control. The purchase-era lexicon never sets it.
 *
 * @param {string} body
 * @param {RegExp} forbiddenHosts every §13 host, as `egress.mjs`'s `forbiddenHostPattern` builds
 *   it — the payment and wallet hosts as well as the vendor's own
 */
export function detectBody(body, forbiddenHosts) {
  if (!(forbiddenHosts instanceof RegExp) || !forbiddenHosts.global) {
    throw new Error('detectBody needs the §13 host pattern (global), or it can see no host at all')
  }
  const text = String(body ?? '')
  const visiblePrice = detectVisiblePrice(text)
  const jsonLd = COMMERCE_MARKERS.filter((m) => m.id.endsWith('-jsonld') && m.pattern.test(text)).map((m) => m.id)
  const vendorHosts = [...new Set((text.match(forbiddenHosts) ?? []).map((h) => h.toLowerCase()))].sort()
  const purchaseControls = PURCHASE_CONTROLS.filter((c) => c.pattern.test(text)).map((c) => c.id)
  const readable = visibleText(text)
  const purchaseEraCopy = PURCHASE_ERA_LEXICON.filter((t) => t.pattern.test(readable)).map((t) => t.id)
  return {
    visiblePrice,
    jsonLd,
    vendorHosts,
    purchaseControls,
    purchaseEraCopy,
    commerce:
      visiblePrice.length > 0 || jsonLd.length > 0 || vendorHosts.length > 0 || purchaseControls.length > 0,
  }
}

/**
 * Whether one observed request is commerce, all things considered.
 *
 * A retired path answering 2xx is commerce by itself, whatever its body says: a cart URL that
 * serves a page is a cart URL that works. **Its own answer** — the first hop — not the end of
 * the chain: the probe follows same-site redirects, so `/cart` → 308 → `/shop` ends on
 * `/shop`'s 200, and judging that would call eleven of §7's rows commerce on a healthy site.
 * What `/shop` serves is `/shop`'s question, and the public probe of `/shop` asks it.
 *
 * @param {{ kind: string, status: number, chain?: { status: number }[], detectors?: { commerce: boolean } | null }} request
 */
export function requestShowsCommerce(request) {
  const own = request.chain?.[0]?.status ?? request.status
  if (request.kind === 'retired' && own >= 200 && own < 300) return true
  return request.detectors?.commerce === true
}

/**
 * @typedef {object} HostObservation
 * @property {'apex' | 'www' | 'deployment' | 'preview'} role
 * @property {string} host
 * @property {boolean} reachable   answered with something attributable to the site
 * @property {boolean} [protected] a Vercel deployment-protection 401
 * @property {string | null} commit build.commit from that host's /api/version
 * @property {boolean} commerce    any request on this host showed commerce
 * @property {Record<string, string>} digests       first-pass (cold) sha256 of each 200 body, by path
 * @property {Record<string, string>} [warmDigests] second-pass (warm) sha256 of each 200 body, by path
 * @property {string[]} [truncatedPaths]   paths whose body was longer than the probe read
 * @property {{ status: number, location: string | null } | null} [firstHop] what `/` answered first
 */

const isEdge = (h) => (h.role === 'apex' || h.role === 'www') && h.reachable

/**
 * **What the hosts are, before anything is said about why.**
 *
 * The first version of {@link classifyDiscrepancy} went straight from "the edge and the
 * deployment both show commerce" to "the source or the build carries it" — without asking
 * whether the edge and the deployment were serving the *same* thing. If they serve two
 * different builds that both carry commerce, there are two problems (an alias pointing at the
 * wrong build, and a build that is wrong), and naming one of them sends somebody to fix half.
 * So identity is observed first, as data, and attribution reads it:
 *
 * - `identityMismatch` — the edge hosts report different build commits from one another.
 * - `cacheVariance` — one host answered the same path with different bytes cold and warm.
 * - `agreement` — the edge against the deployment: `agree` only when established positively
 *   (the same non-null commit, or at least one path with identical bytes and nothing that
 *   differs), `disagree` on any measured difference, `unknown` when nothing could be compared,
 *   `deployment-unobserved` when the deployment URL never answered.
 * - `truncated` — paths whose body was longer than the probe read. An absence of commerce in a
 *   prefix is not an absence of commerce.
 * - `firstHops` — what `/` answered first on each host, so a redirect the wrong way round
 *   (apex → www on a site whose canonical host is the apex) is in the evidence, not lost in a
 *   followed chain. Whether that direction is *correct* is `probe-canonical-domain.mjs`'s
 *   question and its issue; here it is identity, recorded.
 *
 * @param {HostObservation[]} hosts
 */
export function observeHosts(hosts) {
  const edge = hosts.filter(isEdge)
  const deployment = hosts.find((h) => h.role === 'deployment' && h.reachable) ?? null

  const commits = Object.fromEntries(edge.filter((h) => h.commit).map((h) => [h.host, h.commit]))
  const identityMismatch = new Set(Object.values(commits)).size > 1 ? Object.entries(commits).map(([host, commit]) => ({ host, commit })) : []

  const cacheVariance = []
  for (const h of hosts.filter((x) => x.reachable)) {
    for (const [path, cold] of Object.entries(h.digests ?? {})) {
      const warm = h.warmDigests?.[path]
      if (warm && warm !== cold) cacheVariance.push({ host: h.host, path })
    }
  }

  const differences = []
  let compared = 0
  if (deployment) {
    for (const h of edge) {
      if (h.commit && deployment.commit) {
        compared += 1
        if (h.commit !== deployment.commit) differences.push({ host: h.host, kind: 'commit', edge: h.commit, deployment: deployment.commit })
      }
      for (const [path, digest] of Object.entries(h.digests ?? {})) {
        const other = deployment.digests?.[path]
        if (!other) continue
        compared += 1
        if (other !== digest) differences.push({ host: h.host, kind: 'digest', path })
      }
      if (h.commerce !== deployment.commerce) {
        differences.push({ host: h.host, kind: 'commerce', edge: h.commerce, deployment: deployment.commerce })
      }
    }
  }
  const agreement =
    edge.length === 0 ? 'no-edge'
      : !deployment ? 'deployment-unobserved'
        : differences.length > 0 ? 'disagree'
          : compared > 0 ? 'agree'
            : 'unknown'

  const truncated = hosts
    .filter((h) => h.reachable)
    .flatMap((h) => (h.truncatedPaths ?? []).map((path) => ({ host: h.host, path })))

  const firstHops = Object.fromEntries(hosts.filter((h) => h.firstHop).map((h) => [h.host, h.firstHop]))

  return {
    edgeObserved: edge.map((h) => h.host),
    deploymentObserved: deployment?.host ?? null,
    identityMismatch,
    cacheVariance,
    agreement,
    differences,
    truncated,
    firstHops,
  }
}

/**
 * **Where commerce on the live site comes from — attributed only after identity is settled.**
 *
 * Precedence, and every step is a rule rather than a heuristic:
 *
 *   1. `unevaluable/no-edge-host-observed` — neither the apex nor www answered as the site.
 *   2. `host-identity-mismatch` — the apex and www report different builds. Any attribution
 *      after this would be about one of two artifacts without saying which.
 *   3. `alias-dns-cdn/cold-warm-variance` — one host served one path two different ways.
 *   4. The edge differs from the deployment it names: `multiple-causes` when **both** serve
 *      commerce (a wrong alias *and* a wrong build — fix both, attribute neither alone), else
 *      `alias-dns-cdn/edge-differs-from-deployment`.
 *   5. Commerce on the edge: `source-build-deploy-chain` only when edge and deployment are
 *      positively established to `agree`; `unevaluable` when the deployment could not be seen
 *      or agreement could not be established.
 *   6. `unevaluable/truncated-response` — nothing was found, but some bytes were never read.
 *   7. `retrieval-or-indexing` — the site is clean over HTTP and an external retrieval was not.
 *   8. `clean`.
 *
 * The result keeps every field the summary and the issue read, and adds `observation`.
 *
 * @param {{ externalRetrievalShowsCommerce?: boolean, hosts: HostObservation[] }} input
 */
export function classifyDiscrepancy({ externalRetrievalShowsCommerce = false, hosts }) {
  const observation = observeHosts(hosts)
  const edge = hosts.filter(isEdge)
  const deployment = hosts.find((h) => h.role === 'deployment' && h.reachable) ?? null
  const edgeCommerce = edge.filter((h) => h.commerce).map((h) => h.host)
  const note =
    'HTTP only. Browser-only residue — localStorage, a service worker, Cache Storage — is not ' +
    'visible to a request and is asserted by the E2E fresh-session and egress checks.'

  const result = (classification, reason, detail, differences = observation.differences) => ({
    classification,
    reason,
    detail,
    differences,
    edgeCommerce,
    deploymentCommerce: deployment?.commerce ?? null,
    externalRetrievalShowsCommerce,
    observation,
    note,
  })

  if (edge.length === 0) {
    return result(
      'unevaluable',
      'no-edge-host-observed',
      'Neither the apex nor www answered with anything attributable to the site. Nothing about ' +
        'the live surface can be concluded.'
    )
  }

  if (observation.identityMismatch.length > 0) {
    return result(
      'host-identity-mismatch',
      'edge-hosts-serve-different-builds',
      `The edge hosts do not serve one build: ${observation.identityMismatch.map((i) => `${i.host} reports ${i.commit}`).join(', ')}. ` +
        `A visitor's answer depends on which name they typed, and nothing else here can be attributed ` +
        `until both names point at one deployment — check Vercel → Domains for each hostname.`
    )
  }

  if (observation.cacheVariance.length > 0) {
    return result(
      'alias-dns-cdn',
      'cold-warm-variance',
      `The same host served the same path two different ways a few seconds apart: ` +
        `${observation.cacheVariance.map((v) => `${v.host}${v.path}`).join(', ')}. A cache holding ` +
        `two variants, or a regeneration between the passes — compare x-vercel-cache and age.`
    )
  }

  if (observation.agreement === 'disagree') {
    const kinds = observation.differences
      .map((d) => (d.kind === 'digest' ? `${d.host} ${d.path} (body)` : `${d.host} (${d.kind})`))
      .join(', ')
    if (edgeCommerce.length > 0 && deployment?.commerce) {
      return result(
        'multiple-causes',
        'edge-and-deployment-diverge-both-serve-commerce',
        `The edge and the deployment serve different builds (${kinds}), and both carry commerce. ` +
          `That is two problems: the edge points at the wrong build, and the deployment it should ` +
          `point at is wrong too. Fix the alias and the build; attributing this to either alone ` +
          `would leave the other in place.`
      )
    }
    return result(
      'alias-dns-cdn',
      'edge-differs-from-deployment',
      `The edge does not serve what the deployment it names serves: ${kinds}. An alias pointing ` +
        `at another deployment, DNS pointing somewhere else, or a CDN serving a stale variant — ` +
        `check Vercel → Domains and the x-vercel-cache headers.`
    )
  }

  if (edgeCommerce.length > 0) {
    if (!deployment) {
      return result(
        'unevaluable',
        'edge-commerce-deployment-unobserved',
        `${edgeCommerce.join(' and ')} serve commerce, and the deployment URL could not be ` +
          `observed (protected or unreachable), so a bad build and a bad alias cannot be told apart.`
      )
    }
    if (observation.agreement !== 'agree') {
      return result(
        'unevaluable',
        'agreement-unestablished',
        `${edgeCommerce.join(' and ')} and the deployment URL ${deployment.host} serve commerce, but ` +
          `no commit or body could be compared between them, so whether they are one build is ` +
          `unknown. The deployment's own commerce is recorded in the observation.`
      )
    }
    return result(
      'source-build-deploy-chain',
      'edge-and-deployment-serve-commerce',
      `${edgeCommerce.join(' and ')} and the deployment URL ${deployment.host} serve the same build ` +
        `(${deployment.commit ?? 'matching bodies'}), and it carries commerce. No alias or cache explains ` +
        `this: the deployed commit carries it, or the build that produced it did. Check that ` +
        `commit's source, then whether the build reused a cache.`
    )
  }

  if (observation.truncated.length > 0) {
    return result(
      'unevaluable',
      'truncated-response',
      `No commerce was found, but ${observation.truncated.map((t) => `${t.host}${t.path}`).join(', ')} ` +
        `answered with more than the probe reads, so part of each was never inspected. An absence ` +
        `found in a prefix is not an absence.`
    )
  }

  if (externalRetrievalShowsCommerce) {
    return result(
      'retrieval-or-indexing',
      'only-external-retrieval-shows-commerce',
      'Every host observed over HTTP is clean, so the commerce an external retrieval showed did ' +
        'not come from the site as served now: a crawler cache, a search index or the ' +
        'retrieval tool itself. Request re-indexing; nothing in the repository needs to change.'
    )
  }

  return result('clean', 'no-commerce-observed', 'No host observed serves commerce over HTTP.')
}

/**
 * Markdown for the job summary. Short on purpose: the JSON artifact carries every request.
 *
 * @param {{ generatedAt: string, classification: ReturnType<typeof classifyDiscrepancy>, hosts: HostObservation[], requests: Array<object>, observations: Record<string, string[]> }} evidence
 */
export function renderSummary(evidence) {
  const c = evidence.classification
  const lines = [
    '### Live surface',
    '',
    `**${c.classification}** — ${c.detail}`,
    '',
    '| Host | Role | Reachable | Commit | Commerce |',
    '|---|---|---|---|---|',
    ...evidence.hosts.map(
      (h) =>
        `| \`${h.host}\` | ${h.role} | ${h.reachable ? 'yes' : h.protected ? 'protected (401)' : 'no'} | ` +
        `${h.commit ? h.commit.slice(0, 7) : '—'} | ${h.reachable ? (h.commerce ? '**yes**' : 'no') : '—'} |`
    ),
    '',
  ]
  const o = c.observation
  if (o) {
    lines.push(
      `Edge vs deployment: **${o.agreement}**` +
        (o.identityMismatch.length ? ` · edge hosts disagree: ${o.identityMismatch.map((i) => `${i.host} ${i.commit.slice(0, 7)}`).join(', ')}` : '') +
        (o.cacheVariance.length ? ` · cold/warm variance: ${o.cacheVariance.map((v) => `${v.host}${v.path}`).join(', ')}` : '') +
        (o.truncated.length ? ` · truncated: ${o.truncated.map((t) => `${t.host}${t.path}`).join(', ')}` : ''),
      ''
    )
    const hops = Object.entries(o.firstHops ?? {})
    if (hops.length > 0) {
      lines.push(`First answer for \`/\`: ${hops.map(([h, f]) => `\`${h}\` ${f.status}${f.location ? ` → ${f.location}` : ''}`).join(' · ')}`, '')
    }
  }
  const commerceRequests = evidence.requests.filter((r) => requestShowsCommerce(r))
  if (commerceRequests.length > 0) {
    lines.push('Requests showing commerce:', '')
    for (const r of commerceRequests.slice(0, 20)) lines.push(`- \`${r.host}${r.path}\` pass ${r.pass}: ${r.status}`)
    lines.push('')
  }
  const observed = Object.entries(evidence.observations ?? {})
  if (observed.length > 0) {
    lines.push(
      'Purchase-era copy observed (not a finding — present in source pending legal review):',
      '',
      ...observed.map(([term, paths]) => `- ${term}: ${paths.join(', ')}`),
      ''
    )
  }
  lines.push(`_${c.note}_`, '', `Generated ${evidence.generatedAt}.`)
  return lines.join('\n')
}
