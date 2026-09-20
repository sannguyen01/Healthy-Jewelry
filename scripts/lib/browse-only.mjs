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
 * Turn observations into a verdict.
 *
 * @param {object} input
 * @param {string[]} input.expectedHandles Every product handle the repository holds.
 * @param {Array<object>} input.observations One per fetched URL.
 * @param {string[] | null} input.sitemapHandles Handles the live sitemap lists, or null when
 *   the sitemap could not be read — which is a finding about the sitemap, not about them.
 */
export function assessBrowseOnly({ expectedHandles, observations, sitemapHandles }) {
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

  for (const observation of observations) {
    if (!isAttributable(observation)) continue

    if (observation.kind === 'product' && observation.status !== 200) {
      findings.push({
        code: 'product-not-served',
        detail:
          `${observation.path} returned ${observation.status}. The repository holds a ` +
          `record for this handle, so a customer following a link, a search result or a ` +
          `sitemap entry lands on nothing.`,
      })
    }

    if (observation.kind === 'collection' && observation.status !== 200) {
      findings.push({
        code: 'collection-not-served',
        detail: `${observation.path} returned ${observation.status}.`,
      })
    }

    // A true 404, not a page that says "not found" with a 200. `toBeVisible()` and a
    // rendered word are not a status code — the same distinction ADR 016 draws for reach.
    if (observation.kind === 'unknown-product' && observation.status !== 404) {
      findings.push({
        code: 'unknown-not-404',
        detail:
          `${observation.path} returned ${observation.status} rather than 404. A handle ` +
          `the catalogue does not contain must not resolve: a soft 200 is an indexable ` +
          `page for a product that does not exist.`,
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
