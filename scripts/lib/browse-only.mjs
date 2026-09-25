// Healthy Jewelry — does the deployed site serve the catalogue, and only the catalogue?
//
// ## What this replaces, and why it is not the same questions with Shopify crossed out
//
// `verify-production.mjs` asks seventeen questions about a headless storefront: does the
// Storefront token read, is every product published to the headless channel, does
// `cartCreate` return a `checkoutUrl`, does a webhook revalidate a cached page. After the
// decommission none of those has a subject. The store is gone, so "is the store healthy" is
// not a question that can be false.
//
// The browse-only site has different failure modes, and they are *quieter*. A catalogue
// served from JSON in the repository cannot 500 because a token expired; it fails by
// serving a page that is subtly not what the repository says it should be — a handle that
// 404s because a record was renamed and the sitemap was not, an unknown handle answered
// with a soft 200, a Shopify CDN URL still inlined in a bundle months after the credential
// was revoked. Every one of those renders fine.
//
// ## Why the decision is here and the network is not
//
// ADR 030, and the same reasoning as `canonical-domain.mjs`: `escalation.mjs` exists
// because 110 lines of decision logic lived in a YAML string, could not be imported, and
// was broken three ways for its entire life without once being observed. Everything below
// is pure. `scripts/verify-browse-only.mjs` does the I/O, so every branch here is reachable
// from a fixture rather than from the weather (ADR 024).

/**
 * The verdicts. Three, and the third is load-bearing.
 *
 * `unevaluable` is kept rigidly apart from `findings` for the reason ADR 010 gives: an
 * inability to measure, laundered into a measurement, is the failure this family of tools
 * exists to prevent. A runner with no egress must not report that the catalogue is broken,
 * and a scheduled check that goes red for its own network is one people mute inside a week
 * (ADR 011).
 */
export const BROWSE_ONLY_VERDICTS = ['clean', 'findings', 'unevaluable']

/**
 * A response this probe could not attribute to the site.
 *
 * Same guard `probe-canonical-domain.mjs` needed, for the same reason: a sandbox or a
 * corporate middlebox answers a blocked host with a bare 403 of its own, and read naively
 * that is "the site returned 403 for every product" — seventeen confident findings about a
 * site never reached. An inability to measure, laundered into a measurement, which is
 * [ADR 010](../../docs/adr/010-a-control-that-cannot-fail.md)'s failure with the sign
 * flipped.
 *
 * **The first version of this function got it wrong while citing that exact failure.** It
 * accepted "carries a `server` header *or any body at all*", and the interception this
 * repository actually runs behind is a 78-byte `text/plain` denial — a body, so attributable,
 * so a finding. Written, reasoned about, and still wrong until it was run. Which is the
 * argument for `verify-browse-only.mjs` being importable and this being a pure function:
 * the bug was found by pointing the tool at a known answer (ADR 024), not by review.
 *
 * So attribution needs evidence of a *web application*, not evidence of bytes:
 *
 *   - a `server` header — a genuine Vercel Deployment Protection 403 sends `server: Vercel`
 *     and is therefore still judged, which is right: that is a real misconfiguration;
 *   - or an HTML body, which a middlebox denial is not.
 *
 * Attribution rather than proxy-detection, deliberately. Special-casing one middlebox
 * leaves the next one to rediscover this.
 */
export function isAttributable(observation) {
  if (observation.transport !== 'ok') return false
  if (observation.status !== 403 && observation.status !== 407) return true
  if (observation.server) return true
  return /<!doctype html|<html[\s>]/i.test(observation.body ?? '')
}

/**
 * Hosts that must not appear in anything the site serves.
 *
 * `cdn.shopify.com` is the one most likely to survive a decommission, because
 * `next.config.ts` allowlists it for `next/image` and an allowlist entry outlives the code
 * that needed it. A product image still loading from Shopify's CDN is a live dependency on
 * an account we intend to close, and it renders perfectly right up until it does not.
 */
export const FORBIDDEN_HOST_PATTERN = /\b[\w.-]*\.?(?:myshopify\.com|shopify\.com|shopifycdn\.(?:com|net))\b/gi

/**
 * Commerce markers that must not survive in a served page.
 *
 * Deliberately narrow and structural. Matching the word "cart" anywhere would fire on the
 * word "descartes" and on a legal page explaining that carts no longer exist, and a check
 * that cries wolf is a check that gets deleted. These are the attributes and JSON-LD keys a
 * commerce page emits, not prose.
 */
export const COMMERCE_MARKERS = [
  { id: 'offer-jsonld', pattern: /"@type"\s*:\s*"Offer"/i, what: 'an Offer block in JSON-LD' },
  { id: 'price-jsonld', pattern: /"price(?:Currency)?"\s*:/i, what: 'a price field in JSON-LD' },
  {
    id: 'availability-jsonld',
    pattern: /schema\.org\/(?:InStock|OutOfStock|PreOrder)/i,
    what: 'a schema.org availability claim',
  },
  { id: 'add-to-bag', pattern: /data-testid="add-to-bag"/i, what: 'an Add to Bag control' },
  { id: 'checkout-control', pattern: /data-testid="checkout-button"/i, what: 'a checkout control' },
]

/**
 * Every finding code this module can emit.
 *
 * Composed rather than hand-listed for the commerce half, because those are derived from
 * {@link COMMERCE_MARKERS} and a hand-copy would be a second list to keep in step.
 *
 * ADR 019, and the precedent next door: `CANONICAL_FINDINGS` in `canonical-domain.mjs` was
 * exported, documented as the list ADR 019 reconciles against prose, and referenced by
 * **nothing** — not by the function that emits the codes, not by a test, not by
 * `docs/failure-modes.md`. An enumeration nobody compares to anything is a comment with a
 * type annotation. `browse-only-smoke.test.ts` reconciles this one in both directions: a
 * code the function emits but this does not name is an unnamed failure mode, and a code
 * named here that nothing can emit is a failure mode that was removed and left in the
 * documentation.
 *
 * Deliberately findings only. `assessBrowseOnly` also returns a `reason` on an
 * `unevaluable` verdict (`no-expected-handles`, `no-attributable-responses`); those answer
 * "why could nothing be measured", which is a different question from "what is wrong with
 * the site", and collapsing them is the distinction ADR 010 exists to keep.
 */
export const BROWSE_ONLY_FINDINGS = /** @type {const} */ ([
  'canonical-host-redirects',
  'canonical-host-redirects-off-site',
  'product-not-served',
  'collection-not-served',
  'unknown-not-404',
  'shopify-host-referenced',
  'sitemap-unreadable',
  'sitemap-omits-product',
  'sitemap-lists-unknown-product',
  ...COMMERCE_MARKERS.map((m) => `commerce-${m.id}`),
])

/**
 * The registrable domain, as the last two labels.
 *
 * Deliberately not a public-suffix lookup. This repository owns exactly one name and the
 * only comparison it ever makes is apex-versus-`www` of that name; a PSL would be a
 * dependency and a data file to keep current in a dependency-free `.mjs`, bought to answer
 * a question that cannot arise here. The cost of being wrong is bounded and stated: on a
 * multi-label suffix like `co.uk` this returns `co.uk` and would call two unrelated sites
 * the same site. Nothing here ever sees one, and if that changes this is the function to
 * replace rather than the call sites.
 *
 * @param {string} host
 * @returns {string}
 */
export function registrableDomain(host) {
  const labels = String(host).toLowerCase().split('.').filter(Boolean)
  return labels.slice(-2).join('.')
}

/**
 * Do two hostnames belong to the same site?
 *
 * @param {string} a
 * @param {string} b
 */
export function sameSite(a, b) {
  const left = registrableDomain(a)
  return left !== '' && left === registrableDomain(b)
}

/**
 * Is *everything* a redirect to one place?
 *
 * **This function exists because the probe it belongs to reported twenty-five findings
 * about a healthy site.** On 2026-09-20 the apex began answering 307 for every path, and
 * the sweep dutifully filed `product-not-served` seventeen times, `collection-not-served`
 * six times, `unknown-not-404` once and `sitemap-unreadable` once — twenty-five rows with
 * one cause between them, none of which named the destination, because {@link observe}
 * did not capture `location` and there was nothing to name it with.
 *
 * Two failures in one, and the second is the worse:
 *
 *   · **Volume.** A reader given twenty-five findings looks for twenty-five problems. The
 *     same reader given one finding reading "the host hands every path to www" goes to the
 *     Vercel domain settings, which is where the fix is. Same data; only one of them is
 *     acted on, which is the argument `production-smoke.yml` already makes about printing
 *     a sentence before a table.
 *   · **Direction.** Every one of those rows asserted something false. The products *were*
 *     served — by `www.healthyjewellery.com`, on the right commit, the whole time. A
 *     monitor that reports a correct deployment as a broken catalogue is the ADR 011
 *     failure with the sign flipped: not a control that cannot fail, but one whose failures
 *     cannot be believed, which gets muted just as fast.
 *
 * Uniformity is the test, not a threshold. A *single* product redirecting is a finding
 * about that product and must keep its own row; every attributable response redirecting to
 * one host is a fact about the host. There is no middle case worth guessing at — a partial
 * redirect keeps its per-path rows and the `location` now printed beside each.
 *
 * @param {Array<object>} observations
 * @returns {{ to: string, toOrigin: string, status: number, count: number } | null}
 */
export function uniformRedirect(observations) {
  const attributable = observations.filter(isAttributable)
  if (attributable.length === 0) return null

  /** @type {Set<string>} */
  const targets = new Set()
  let toOrigin = ''
  let status = 0

  for (const o of attributable) {
    if (!(o.status >= 300 && o.status < 400)) return null
    if (!o.location) return null
    let target
    try {
      // `o.url` is the full request URL when `observe` recorded one. The fallback covers a
      // caller that supplied only a host and a path, which is enough to resolve a relative
      // `Location` and is how the fixtures in the unit tests are written.
      target = new URL(o.location, o.url ?? `https://${o.host ?? 'invalid.invalid'}${o.path ?? '/'}`)
    } catch {
      return null
    }
    targets.add(target.hostname)
    toOrigin = target.origin
    status = o.status
  }

  if (targets.size !== 1) return null
  return { to: [...targets][0], toOrigin, status, count: attributable.length }
}

/**
 * Turn observations into a verdict.
 *
 * @param {object} input
 * @param {string[]} input.expectedHandles Every product handle the repository holds.
 * @param {Array<object>} input.observations One per fetched URL.
 * @param {string[] | null} input.sitemapHandles Handles the live sitemap lists, or null when
 *   the sitemap could not be read — which is a finding about the sitemap, not about them.
 * @param {{ from: string, to: string, fromOrigin?: string, toOrigin?: string,
 *            status: number, followed: boolean } | null}
 *   [input.redirect] What the anchor probe found at the base URL, when it found a redirect.
 *   `from` and `to` are hostnames, because `sameSite` asks a question about labels. The
 *   optional origins are what the prose prints, since a port- or scheme-only redirect has
 *   one hostname at both ends. `followed` says whether the sweep below was re-pointed at
 *   `to` — see `verify-browse-only.mjs`, which will only ever follow one hop and only
 *   within the same registrable domain.
 */
export function assessBrowseOnly({ expectedHandles, observations, sitemapHandles, redirect = null }) {
  const findings = []

  // Nothing to compare against is a broken probe, not a healthy site. A sweep whose input
  // list is silently empty passes every assertion below — the shape this repository has now
  // recorded seven times.
  if (expectedHandles.length === 0) {
    return {
      verdict: 'unevaluable',
      reason: 'no-expected-handles',
      findings: [],
      summary:
        'No product handles were found in src/content/catalog/products/. That is a ' +
        'failure of this probe or of the checkout it ran against, not a statement about ' +
        'the live site — a comparison against an empty list would pass trivially.',
    }
  }

  const attributable = observations.filter(isAttributable)
  if (attributable.length === 0) {
    const firstDetail = observations.find((o) => o.detail)?.detail
    return {
      verdict: 'unevaluable',
      reason: 'no-attributable-responses',
      findings: [],
      summary:
        `None of the ${observations.length} request(s) reached something identifiable as ` +
        `the site. This says nothing about the catalogue.` +
        (firstDetail ? ` First transport detail: ${firstDetail}` : ''),
    }
  }

  // ── The base URL handed its traffic somewhere else ──────────────────────────────────
  //
  // Reported before anything else and, when the sweep could not be re-pointed, *instead*
  // of everything else. See `uniformRedirect` for why: twenty-five rows asserting that a
  // correctly-served catalogue was missing, none of them naming the destination.
  if (redirect) {
    // **Origins in the prose, hostnames in the comparison.** `sameSite` asks whether two
    // names belong to one site, which is a question about labels. The sentence a person
    // reads has to distinguish the two ends, and hostnames alone cannot: a redirect from
    // `localhost:3001` to `localhost:3000` renders as "localhost hands every path to
    // localhost", which is how this read the first time it was run against a real HTTP
    // redirect. Same for a scheme-only redirect.
    const from = redirect.fromOrigin ?? redirect.from
    const to = redirect.toOrigin ?? redirect.to

    findings.push(
      sameSite(redirect.from, redirect.to)
        ? {
            code: 'canonical-host-redirects',
            detail:
              `${from} answers ${redirect.status} and hands every path to ${to}. The ` +
              `catalogue may be served perfectly there and this is still wrong: ` +
              `src/config/site.ts names ${from} as the canonical origin, so every ` +
              `absolute URL this application emits — JSON-LD, the OG card, the sitemap, ` +
              `the canonical link — points at a host that serves nothing but a redirect. ` +
              `Vercel -> Project -> Settings -> Domains: clear the redirect on ${from} ` +
              `first, then put one on ${to} pointing back at it, permanent (308) rather ` +
              `than ${redirect.status}. Doing only the second half makes a loop.` +
              (redirect.followed
                ? ` The findings below were measured against ${to}, one hop on, and ` +
                  `describe that origin rather than ${from}.`
                : ''),
          }
        : {
            code: 'canonical-host-redirects-off-site',
            detail:
              `${from} answers ${redirect.status} and hands every path to ${to}, which is ` +
              `a different site. Not followed, deliberately: a probe that chases a ` +
              `redirect off the brand's own domain reports some other origin's health as ` +
              `ours. Nothing below was measured.`,
          }
    )
  }

  // The same shape arriving through the sweep rather than the anchor — a base URL supplied
  // by `PRODUCTION_SITE_URL` that redirects, or a redirect that appeared mid-sweep. One
  // cause, one row, and the per-path rows suppressed rather than printed twenty-five times.
  const swept = uniformRedirect(observations)
  if (swept) {
    if (!redirect) {
      const to = swept.toOrigin || swept.to
      findings.push({
        code: 'canonical-host-redirects',
        detail:
          `Every one of the ${swept.count} attributable responses was a ${swept.status} to ` +
          `${to}. That is one fact about the host, not ${swept.count} facts about the ` +
          `catalogue — the pages may be served correctly at ${to}.`,
      })
    }
    return {
      verdict: 'findings',
      findings,
      checked: attributable.length,
      expectedHandles: expectedHandles.length,
      summary:
        `${findings.length} finding(s). Every response redirected, so nothing about the ` +
        `catalogue was measured at this origin.`,
    }
  }

  /**
   * Where a redirect went, for a finding that would otherwise only say a number.
   *
   * A 3xx's whole diagnostic content is its `Location`: the body is empty and the status
   * says only "elsewhere". Printing `returned 307` and stopping is what left a run's worth
   * of findings unattributable to any cause.
   */
  const destination = (o) => (o.location ? ` -> ${o.location}` : '')

  for (const observation of observations) {
    if (!isAttributable(observation)) continue

    if (observation.kind === 'product' && observation.status !== 200) {
      findings.push({
        code: 'product-not-served',
        detail:
          `${observation.path} returned ${observation.status}${destination(observation)}. ` +
          `The repository holds a record for this handle, so a customer following a link, ` +
          `a search result or a sitemap entry lands on nothing.`,
      })
    }

    if (observation.kind === 'collection' && observation.status !== 200) {
      findings.push({
        code: 'collection-not-served',
        detail: `${observation.path} returned ${observation.status}${destination(observation)}.`,
      })
    }

    // A true 404, not a page that says "not found" with a 200. `toBeVisible()` and a
    // rendered word are not a status code — the same distinction ADR 016 draws for reach.
    if (observation.kind === 'unknown-product' && observation.status !== 404) {
      findings.push({
        code: 'unknown-not-404',
        detail:
          `${observation.path} returned ${observation.status}${destination(observation)} ` +
          `rather than 404. A handle the catalogue does not contain must not resolve: a ` +
          `soft 200 is an indexable page for a product that does not exist.`,
      })
    }

    const hosts = observation.body ? [...new Set(observation.body.match(FORBIDDEN_HOST_PATTERN) ?? [])] : []
    if (hosts.length > 0) {
      findings.push({
        code: 'shopify-host-referenced',
        detail:
          `${observation.path} references ${hosts.join(', ')}. A browse-only site must not ` +
          `reach a Shopify host — an allowlisted CDN outlives the code that needed it, and ` +
          `an image still loading from it is a live dependency on an account being closed.`,
      })
    }

    for (const marker of COMMERCE_MARKERS) {
      if (observation.body && marker.pattern.test(observation.body)) {
        findings.push({
          code: `commerce-${marker.id}`,
          detail: `${observation.path} still serves ${marker.what}.`,
        })
      }
    }
  }

  if (sitemapHandles === null) {
    findings.push({
      code: 'sitemap-unreadable',
      detail:
        'The sitemap could not be read or parsed. Every catalogue page may be correct and ' +
        'still be undiscoverable.',
    })
  } else {
    const missing = expectedHandles.filter((h) => !sitemapHandles.includes(h))
    if (missing.length > 0) {
      findings.push({
        code: 'sitemap-omits-product',
        detail:
          `${missing.length} handle(s) absent from the sitemap: ${missing.join(', ')}. ` +
          `The page may serve perfectly and still never be crawled.`,
      })
    }

    const surplus = sitemapHandles.filter((h) => !expectedHandles.includes(h))
    if (surplus.length > 0) {
      findings.push({
        code: 'sitemap-lists-unknown-product',
        detail:
          `${surplus.length} handle(s) in the sitemap that the repository does not hold: ` +
          `${surplus.join(', ')}. Either the deployment is behind the repository, or the ` +
          `sitemap is built from a source the catalogue no longer agrees with.`,
      })
    }
  }

  return {
    verdict: findings.length > 0 ? 'findings' : 'clean',
    findings,
    checked: attributable.length,
    expectedHandles: expectedHandles.length,
    summary:
      findings.length > 0
        ? `${findings.length} finding(s) across ${attributable.length} attributable response(s).`
        : `${attributable.length} response(s) checked against ${expectedHandles.length} ` +
          `catalogue handle(s). Every product and collection served, unknown handles 404, ` +
          `no Shopify host referenced, no commerce semantics in any page.`,
  }
}
