/**
 * Invariants whose tests must be able to fail, and the minimal mutation that proves it.
 *
 * ## Why a list of mutations rather than a coverage number
 *
 * `e2e/contact.spec.ts` asserted a `{ success: true }` contract that PR #32 had deleted
 * 17 days earlier. It kept passing, for the wrong reason, so the contact form's real
 * success path had zero coverage for that window — invisible, because the test looked
 * green. Coverage tools would have counted those lines as covered the whole time: the
 * spec executed them. What it did not do was *distinguish* a working success path from a
 * broken one.
 *
 * That is the only question worth asking of a test, and it cannot be answered by reading
 * source: **if the thing this protects broke, would anything go red?** It is ADR 006's
 * own test — *"if the setup step never happens, does anything go red?"* — asked of an
 * assertion instead of a control, and asked by a machine instead of by whoever happens to
 * be reading.
 *
 * Each entry below breaks one invariant on purpose and names the tests that must notice.
 * A sentinel whose mutation leaves the suite green is a **dead assertion**: the code is
 * exercised and nothing depends on the result.
 *
 * ## Why these, and not a sample
 *
 * Every one is somewhere this repository has actually been burned, so the set is a
 * regression list rather than a sample. Adding another is cheap; the value is in
 * each one being a real scar.
 *
 * Five were added on 2026-09-18 with the defects review, and they are the five whose
 * invariants had **no test at all** when that review began: a rate limiter that threw into
 * the request path, a byte budget measured in UTF-16 code units, a cart reconciliation
 * that could empty a bag, a checkout handed off on a URL from a previous page load, and an
 * OAuth nonce that was generated and never compared.
 *
 * ## Two runners
 *
 * A mutation is only meaningful against the layer that would catch it. `runner: 'vitest'`
 * mutations run in seconds. `runner: 'playwright'` mutations need a production build
 * first — E2E runs against `pnpm build && pnpm start`, never `pnpm dev`, because that is
 * what Vercel serves — so they are opt-in via `--with-e2e` and run on the weekly schedule
 * rather than in the merge gate.
 *
 * See docs/adr/020-a-test-that-cannot-fail-is-documentation.md.
 */

/**
 * @typedef {object} Sentinel
 * @property {string} id
 * @property {'vitest' | 'playwright'} runner
 * @property {string} file           Path to mutate, relative to the repo root.
 * @property {string} find           Exact text to replace. Must occur exactly once.
 * @property {string} replace        The mutation.
 * @property {string[]} specs        Test paths that must fail once the mutation is applied.
 * @property {string} invariant      What the mutation breaks, in one line.
 * @property {string} scar           Where this repository already paid for it.
 */

/** @type {Sentinel[]} */
export const SENTINELS = [
  {
    id: 'contrast-floor',
    runner: 'vitest',
    file: 'src/app/globals.css',
    find: '--titanium-text: #59636B;',
    replace: '--titanium-text: #9DA7AF;',
    specs: ['src/tests/unit/design-tokens-contrast.test.ts'],
    invariant: 'accent-toned text on a light surface clears the WCAG AA 4.5:1 floor',
    scar: '--titanium shipped as 10-12px body copy at 2.25:1 in eight places; axe caught two of them, 25 minutes into an E2E run, after it had reached production.',
  },
  {
    id: 'font-weight-resolution',
    runner: 'vitest',
    file: 'src/app/layout.tsx',
    find: "weight: ['400', '500']",
    replace: "weight: ['400']",
    specs: ['src/tests/unit/typography-weights.test.ts'],
    invariant: 'every weight a component asks for has a downloaded face',
    scar: 'Eleven headings asked Barlow Condensed for 700 or 600 and got a synthesised faux bold. The same <h1> rendered at four different effective weights across the site.',
  },
  {
    id: 'sitemap-completeness',
    runner: 'vitest',
    file: 'src/lib/seo/sitemapPages.ts',
    find: "  { loc: '/about', changefreq: 'monthly', priority: '0.6' },\n",
    replace: '',
    specs: ['src/tests/unit/sitemap-completeness.test.ts'],
    invariant: 'every route is published in the sitemap or excluded with a reason',
    scar: '/contact was absent from the hand-maintained page list, beside three routes that were absent correctly, with nothing distinguishing them.',
  },
  {
    id: 'collection-handle-contract',
    runner: 'vitest',
    // Was `src/lib/data/hj-data.ts`, mutating a collection record's own handle. Collections
    // moved to `src/content/catalog/collections/*.json` in WS-4b, and the schema is now
    // where the vocabulary is declared.
    //
    // The mutation moved with it rather than following the data, and that is the more
    // faithful target: editing a JSON record's handle to 'charm' would fail
    // `collectionSchema`'s `z.enum` before the contract test ran, so the probe would prove
    // the schema works rather than proving this invariant is still watched. Adding a
    // *valid-looking sixth handle* to the vocabulary is the real drift — a handle a record
    // may declare and the router will not serve.
    file: 'src/lib/catalog/schema.ts',
    find: "  'charms',\n] as const",
    replace: "  'charms',\n  'pendants',\n] as const",
    specs: ['src/tests/unit/collection-handle-contract.test.ts'],
    invariant: 'every collection a product maps into is one the router will serve',
    scar: '/shop/[collection] sets dynamicParams = false, so a drifted handle is a hard 404 reached from a link the site renders itself, on a page that looks healthy.',
  },
  {
    /*
     * `fallback-catalogue-discrimination` was here, mutating `FALLBACK_ONLY_HANDLES` in
     * `scripts/verify-production.mjs` so that the live smoke run could no longer tell the
     * bundled catalogue from Shopify's. Its scar: a Storefront token in the Admin slot made
     * every fetcher fall back silently, the site served "Dome Ring" to customers, and
     * checkout refused on placeholder variant IDs.
     *
     * Both the script and the invariant are gone. There is one catalogue, so there is
     * nothing to discriminate — the premise inverted rather than weakened (ADR 034).
     *
     * What replaces it is the invariant that took its place in the same workflow: the live
     * check must stay ungated. `Live store and storefront` gated on `storefrontReady`, so
     * emptying five secrets silenced it and the smoke tier reported success while checking
     * nothing (ADR 033, issue #81). Its replacement needs no credential — and the only
     * thing standing between that and a repeat is one `if:` line, which is exactly the
     * kind of single point a mutation sentinel exists to guard.
     */
    id: 'live-check-is-ungated',
    runner: 'vitest',
    file: 'scripts/probe-smoke-liveness.mjs',
    find: "export const REQUIRED_STEPS = ['Browse-only catalogue']",
    replace: "export const REQUIRED_STEPS = ['Set up job']",
    specs: ['src/tests/unit/smoke-liveness.test.ts'],
    invariant:
      'the dead-man\'s switch keys on a step that needs no credential, so no console action can silence it',
    scar: 'Five secrets were emptied on production-readonly between run #154 and #155 on 2026-09-19; the live step skipped, the run reported success, and from outside a skipped step is indistinguishable from a passing one.',
  },
  {
    id: 'required-check-names',
    runner: 'vitest',
    file: '.github/workflows/ci.yml',
    find: '    name: E2E tests (Playwright)',
    replace: '    name: E2E tests (Playwright, sharded)',
    specs: ['src/tests/unit/required-checks-contract.test.ts'],
    invariant: 'the strings the documents tell a human to require are the ones GitHub publishes',
    scar: 'Five documents said `verify` and `e2e`. Requiring a context nothing publishes blocks every pull request forever, silently — the repair that bricks the repository.',
  },
  {
    id: 'workflow-pipefail',
    runner: 'vitest',
    file: '.github/workflows/production-smoke.yml',
    find: 'defaults:\n  run:\n    shell: bash',
    replace: 'defaults:\n  run:\n    working-directory: .',
    specs: ['src/tests/unit/workflow-shell-contract.test.ts'],
    invariant: 'every workflow runs its steps under pipefail',
    scar: 'Both real checks in production-smoke were piped through tee, so neither could fail. Run 31600442658 published "Webhook signing secret | success" for a script that exited 2.',
  },
  {
    id: 'contact-honest-failure',
    runner: 'vitest',
    file: 'src/app/api/contact/route.ts',
    find: "      { error: 'Failed to send message. Please email us directly.' },\n      { status: 503 }",
    replace: '      { success: true },\n      { status: 200 }',
    specs: ['src/tests/unit/api-contact-route.test.ts'],
    invariant: 'an unconfigured mailer reports failure instead of fabricating success',
    scar: 'This is the exact line PR #32 fixed, and the contract e2e/contact.spec.ts asserted for 17 days after it was gone — passing the whole time, for the wrong reason.',
  },
  {
    id: 'webhook-signature-rejection',
    runner: 'vitest',
    file: 'scripts/lib/webhook-signature.mjs',
    find: "createHmac('sha256', secret).update(Buffer.from(rawBody)).digest('base64')",
    replace: "createHmac('sha256', 'not-the-secret').update(Buffer.from(rawBody)).digest('base64')",
    // Deliberately NOT webhook-signature-contract.test.ts, and the first run of this
    // probe is why. That file's only HMAC assertion compares the header against
    // `signWebhookBody(body, 's')` — both sides calling the same function, so a
    // signWebhookBody that ignored the secret entirely would satisfy it. Its other
    // assertion accepts `expect.any(String)`. It is a module-boundary and request-shape
    // test, which is what it is for, and it protects this invariant not at all.
    //
    // webhook-signature-script.test.ts does, because it uses the **real route handler as
    // the oracle** instead of re-deriving the expected value: the script builds the
    // request, the route decides, and a wrong secret comes back 401. That is the
    // difference between a test that agrees with itself and one that can be wrong.
    specs: ['src/tests/unit/webhook-signature-script.test.ts'],
    invariant: 'a payload signed with the wrong secret is rejected by the deployed route',
    scar: 'The old verification procedure was to place a real order and read Vercel logs — one-shot, costly, and leaving no repeatable artifact.',
  },

  // ── Added 2026-09-18 with the defects review. Each is an invariant that had no
  //    test at all when this review started, so every one is a scar this repository
  //    had already taken and not yet noticed.
  {
    id: 'rate-limit-failure-posture',
    runner: 'vitest',
    file: 'src/lib/utils/rateLimit.ts',
    find: "        return policy.onError === 'deny'",
    replace: '        throw err',
    specs: ['src/tests/unit/rateLimit.test.ts', 'src/tests/unit/api-health-route.test.ts'],
    invariant: 'a limiter that cannot be consulted resolves to its declared posture and never throws into the request path',
    scar: "`upstash.limit()` rejects on any Redis failure and nothing caught it, so a rate-limiter outage became a 500 on every cart mutation site-wide — while /api/health reported, in as many words, 'Rate limits are failing open.' They were failing 500, at the till.",
  },
  {
    id: 'body-budget-in-bytes',
    runner: 'vitest',
    file: 'src/lib/http/readBoundedBody.ts',
    find: '      bytes += value.byteLength',
    replace: '      bytes += 0',
    specs: ['src/tests/unit/readBoundedBody.test.ts', 'src/tests/unit/webhook-body-bounds.test.ts'],
    invariant: 'a budget named in bytes is measured in bytes, and counted while the body is still arriving',
    scar: "Two routes declared MAX_BODY_BYTES and compared it against String.prototype.length — UTF-16 code units — so the effective budget was up to 3x its stated value on the multi-byte input a VND storefront receives as a matter of course. And the check ran after `await request.text()` had already materialised the whole body.",
  },
  {
    id: 'commerce-boundary',
    runner: 'vitest',
    file: 'COMMERCE-ELIMINATION-CONTRACT.md',
    find: '| `src/tests/unit/browse-only-copy.test.tsx` | negative-control |',
    replace: '| `src/tests/unit/browse-only-copy.test.tsx` | superseded |',
    specs: ['src/tests/unit/commerce-contract.test.ts'],
    invariant:
      'a commerce identifier in running code is a build failure unless the contract classifies the file or the register owns it',
    scar: "The decommission's output is an *absence*, and an absence is the one thing nobody notices returning. /terms listed three card-and-wallet brands as accepted methods for eleven days after Add to Bag was deleted, and nothing went red: prose has no type checker. This mutation downgrades the one class allowed to name those brands — the check that forbids them — so the contract stops covering the file that was the original defect. (Written without naming them, because the contract's `payment-provider` rule is absolute in code position and this registry is code: the scanner failed this very entry on its first run, which is the shortest possible demonstration that the scope has no escape hatch.)",
  },

  // ── Added 2026-09-26 with masterplan v2: one per control it registered ──
  {
    id: 'contact-provider-error-honesty',
    runner: 'vitest',
    file: 'src/app/api/contact/route.ts',
    find: '    const { data, error } = await resend.emails.send({',
    replace: '    const { data, error } = { data: { id: \'sentinel\' }, error: null }; await resend.emails.send({',
    specs: ['src/tests/unit/api-contact-route.test.ts'],
    invariant: 'a send the mail provider refused is reported as a failure, not as success',
    scar: 'resend@6 returns { data: null, error } instead of throwing, and the route ignored the return value: an unverified domain, a revoked key or a 429 all answered { success: true } while the message went nowhere. The test mock resolved { id } at the top level, so the suite could not see it.',
  },
  {
    id: 'rate-limit-ip-pseudonymisation',
    runner: 'vitest',
    file: 'src/lib/utils/rateLimit.ts',
    find: '        const { success } = await upstash.limit(derivation.key(ip))',
    replace: '        const { success } = await upstash.limit(ip)',
    specs: ['src/tests/unit/rateLimit.test.ts'],
    invariant: 'the raw client IP never becomes a rate-limit store key',
    scar: 'The privacy page said the IP was "hashed and short-lived" while upstash.limit(ip) wrote the raw address into a Redis key.',
  },
  {
    id: 'analytics-sink-allowlist',
    runner: 'vitest',
    file: 'src/app/api/analytics/route.ts',
    find: '  return parsed.success ? parsed.data : null',
    replace: '  return parsed.success ? parsed.data : (body as AnalyticsEvent)',
    specs: ['src/tests/unit/api-analytics-route.test.ts'],
    invariant: 'an analytics payload outside its event\'s strict schema is dropped whole, so no field or value the catalogue did not publish reaches the log line',
    scar: 'After the purchase events were deleted, the sink still copied value, currency, quantity, itemCount and reason into its log; and until 2026-09-27 its allowlist was the union of every event\'s fields, so a forged product_viewed carrying a search query logged "customer@example.com order 10001".',
  },
  {
    id: 'consent-withdrawal',
    runner: 'vitest',
    file: 'src/components/layout/ConsentBanner.tsx',
    find: '      setReopened(true)',
    replace: '      setReopened(false)',
    specs: ['src/tests/unit/analytics.test.ts'],
    invariant: 'an answered consent prompt reopens from "Measurement preferences", so withdrawal is as easy as consent was',
    scar: 'Until 2026-09-27 the banner appeared once and the only way to take an Allow back was clearing this site\'s data in the browser settings — the privacy page said so, and called it the way to change the answer.',
  },
  {
    id: 'claim-withdrawal-bound',
    runner: 'vitest',
    file: 'src/app/layout.tsx',
    find: 'export const revalidate = 3600',
    replace: 'export const revalidate = 86400',
    specs: ['src/tests/unit/claim-expiry.test.ts'],
    invariant: 'every claim-bearing segment re-renders within CLAIM_WITHDRAWAL_BOUND_SECONDS, so an expired approval leaves served pages without a redeploy',
    scar: 'Built at 228fdaf with an approval expiring that day and served two days later, the expired positioning claim was still in the homepage hero, its meta description and every Footer on 8 cache HITs out of 8 — all 37 prerendered routes had no revalidation at all.',
  },
  {
    id: 'retired-action-gone',
    runner: 'vitest',
    file: 'src/lib/http/goneResponse.ts',
    find: '    POST: gone,',
    replace: '    POST: redirect,',
    specs: ['src/tests/unit/commerce-route-inventory.test.ts'],
    invariant: 'a stale POST to a retired 308 path answers the 410 page there, never a redirect that repeats the POST at the successor',
    scar: 'Until 2026-09-27 the 308s were config redirects: an old multipart product form re-POSTed to /shop and a visitor in Chromium was left on a bare "Server action not found." — while the spec pinned that table as expected.',
  },
  {
    id: 'bounded-response-read',
    runner: 'vitest',
    file: 'scripts/lib/bounded-read.mjs',
    find: "        reason = 'byte-cap'",
    replace: "        reason = 'complete'",
    specs: ['src/tests/unit/bounded-read.test.ts'],
    invariant: 'a body longer than the cap is reported truncated, so an absence found in a prefix is never reported as clean',
    scar: 'The live-surface probe called response.text() and sliced it: the whole body was downloaded first, and a page longer than two megabytes read as if it had been inspected in full.',
  },
  {
    id: 'live-surface-identity-before-cause',
    runner: 'vitest',
    file: 'scripts/lib/live-surface.mjs',
    find: "  if (observation.agreement === 'disagree') {",
    replace: "  if (observation.agreement === 'disagree' && edgeCommerce.length === 0) {",
    specs: ['src/tests/unit/live-surface.test.ts'],
    invariant: 'when the edge and the deployment serve different builds that both carry commerce, the verdict is multiple-causes, never the source chain alone',
    scar: 'The first classifier went from "edge and deployment both show commerce" straight to "the build carries it" without asking whether they were the same build, which would have sent someone to fix half of two problems.',
  },
  {
    id: 'live-surface-ack-standing',
    runner: 'vitest',
    file: 'scripts/lib/live-surface-issue.mjs',
    find: "export const ACK_ASSOCIATIONS = /** @type {const} */ (['OWNER', 'MEMBER', 'COLLABORATOR'])",
    replace: "export const ACK_ASSOCIATIONS = /** @type {const} */ (['OWNER', 'MEMBER', 'COLLABORATOR', 'NONE'])",
    specs: ['src/tests/unit/live-surface-issue.test.ts'],
    invariant: 'only an owner, member or collaborator can acknowledge a live-surface finding, so a drive-by comment cannot silence its escalation',
    scar: 'Until 2026-09-27 a non-clean live-surface classification became a job summary and a 30-day artifact and was read by nobody; the acknowledgement that replaces that is only a control if not just anyone can give it.',
  },
  {
    id: 'commerce-register-exact-set',
    runner: 'vitest',
    file: 'scripts/lib/commerce-contract.mjs',
    find: '    const undeclared = minus(observed.keys(), declared)',
    replace: '    const undeclared = []',
    specs: ['src/tests/unit/commerce-contract.test.ts'],
    invariant: 'a register row declares exactly the identifiers its file carries where the rules look, no more and no fewer',
    scar: 'The register was reconciled by path: every row reduced to a Set of paths, the Identifiers column parsed and never read. Two rows had drifted by the time anybody compared them (ADR 037).',
  },
  {
    id: 'commerce-lexer-strings',
    runner: 'vitest',
    file: 'scripts/lib/commerce-contract.mjs',
    find: '    if (c === \'"\' || c === "\'") {',
    replace: '    if (false) {',
    specs: ['src/tests/unit/commerce-lexer-differential.test.ts', 'src/tests/unit/commerce-contract.test.ts'],
    invariant: 'a comment marker inside a string literal opens no comment',
    scar: 'A glob in a string opened a block comment that swallowed the next thirty lines of vitest.config.ts; 661 lines in 67 files were misread as comments, one misread hid an absolute finding, and the limit had been documented as the safe direction.',
  },
  {
    id: 'commerce-phase-state',
    runner: 'vitest',
    file: 'scripts/lib/commerce-contract.mjs',
    find: '  if (phase === \'active\' && register.length === 0) {',
    replace: '  if (phase === \'active\' && register.length < 0) {',
    specs: ['src/tests/unit/commerce-contract.test.ts'],
    invariant: 'an active decommission with an empty register is an undeclared completion, not a pass',
    scar: 'The register was guarded by a floor of twenty rows, which encoded the opposite of the completion condition and would have failed, and been lowered, on the day the work finished (ADR 035).',
  },
  {
    id: 'protection-strict-mode',
    runner: 'vitest',
    file: 'scripts/probe-branch-protection.mjs',
    find: '  const strict = layers.some((l) => l.strict)',
    replace: '  const strict = true',
    specs: ['src/tests/unit/probe-branch-protection.test.ts'],
    invariant: 'a gate that does not require the branch to be up to date is reported, not read as enforced',
    scar: 'The protection probe compared contexts only; a gate with the right three checks, no strict mode and an admin bypass read as enforced, and a ruleset-only gate read as absent.',
  },
  {
    id: 'merge-denial-attribution',
    runner: 'vitest',
    file: 'scripts/lib/merge-denial.mjs',
    find: '  if (mergeableState === \'blocked\') {',
    replace: '  if (mergeableState === \'blocked\' || mergeable) {',
    specs: ['src/tests/unit/probe-merge-denial.test.ts'],
    invariant: 'a pull request GitHub would merge while a required check failed is NOT-DENIED, never denied',
    scar: 'The proposed exit test was to press merge on a known-bad pull request; a misconfigured rule would have deployed it to production.',
  },
  {
    id: 'merge-denial-read-only',
    runner: 'vitest',
    file: 'scripts/probe-merge-denial.mjs',
    find: '\'User-Agent\': \'healthy-jewelry-merge-denial-probe\',',
    replace: '\'User-Agent\': \'healthy-jewelry-merge-denial-probe\', method: \'PUT\',',
    specs: ['src/tests/unit/probe-merge-denial.test.ts'],
    invariant: 'the merge-denial probe cannot issue a writing request',
    scar: 'Its whole value is that it proves a refusal without attempting the merge that would deploy a bad commit.',
  },
  {
    id: 'visible-price-finding',
    runner: 'vitest',
    file: 'scripts/lib/browse-only.mjs',
    find: '    const prices = observation.body ? detectVisiblePrice(observation.body) : []',
    replace: '    const prices = []',
    specs: ['src/tests/unit/browse-only-smoke.test.ts'],
    invariant: 'a price rendered in visible text is a blocking browse-only finding',
    scar: 'The live site showed "Dome Ring · 112.00" (STATE.md, 2026-08-05); the browse-only probe matched only JSON-LD keys and test ids and would have called that page clean.',
  },
  {
    id: 'checkout-host-premise',
    runner: 'vitest',
    file: 'scripts/lib/premise-checks.mjs',
    find: '  const vendor = targets.filter(isVendorHost)',
    replace: '  const vendor = targets',
    specs: ['src/tests/unit/premise-checks.test.ts'],
    invariant: 'the checkout hostname\'s premise drifts when its alias leaves the vendor',
    scar: 'When the API-version premise went with its subject, the premise detectors held zero premises and would have reported "all premises hold" forever (ADR 035).',
  },
  {
    id: 'premise-unevaluable-withholds',
    runner: 'vitest',
    file: 'scripts/lib/premise-checks.mjs',
    find: '  if (premises.some((p) => p.evaluable === false)) return null',
    replace: '  if (premises.some((p) => p.evaluable === false)) return []',
    specs: ['src/tests/unit/premise-checks.test.ts'],
    invariant: 'a premise that could not be asked never produces the empty drift file that closes an open issue',
    scar: 'An empty premise-drift.json closes the drift issue as "all premises hold again"; a DNS timeout must not be able to say that (ADR 010).',
  },
  {
    id: 'live-surface-source-rule',
    runner: 'vitest',
    file: 'scripts/lib/live-surface.mjs',
    find: '  if (edgeCommerce.length > 0 && deployment?.commerce) {',
    replace: '  if (false) {',
    specs: ['src/tests/unit/live-surface.test.ts'],
    invariant: 'commerce served by both the edge and the deployment is attributed to the source/build chain',
    scar: 'A page retrieval showed purchase-era material the repository was assumed not to produce, with no way to tell a bad build from a stale alias; measured, much of it was in the current source.',
  },
  {
    id: 'safety-denylist-parity',
    runner: 'vitest',
    file: 'docs/safety.md',
    find: 'next.config.ts\nvercel.json\n```',
    replace: 'next.config.ts\n```',
    specs: ['src/tests/unit/safety-denylist-parity.test.ts'],
    invariant: 'the prose denylist names every path gate.yaml denies',
    scar: 'docs/safety.md omitted vercel.json for a month after it was added to gate.yaml, and nothing compared the two lists.',
  },
  {
    id: 'claims-pending-renders-fallback',
    runner: 'vitest',
    file: 'src/lib/catalog/claims.ts',
    find: '    case \'pending\':\n      return fallback(\'pending\')',
    replace: '    case \'pending\':\n      return { rendered: \'wording\', text: claim.wording, reason: \'approved\' }',
    specs: ['src/tests/unit/claims-registry.test.ts'],
    invariant: 'a claim with no approved decision renders its neutral fallback, never its proposed wording',
    scar: '·IMPLANT GRADE· ·HYPOALLERGENIC· ·MRI SAFE· rendered on all 17 product pages, niobium and 316L included, with no document behind any of them, until 2026-09-26.',
  },
  {
    id: 'claim-lexicon',
    runner: 'vitest',
    file: 'src/components/home/CampaignBand.tsx',
    find: 'Read the science',
    replace: 'Read the science. Nickel-free.',
    specs: ['src/tests/unit/claim-lexicon.test.tsx'],
    invariant: 'no claim renders outside an approved claim\'s exact wording',
    scar: 'A 316L disc charm was described as nickel-free, and 316L is nickel-bearing by specification; twelve other claims shipped as copy that no reviewer or document ever saw.',
  },
  {
    id: 'legal-review-inventory',
    runner: 'vitest',
    file: 'src/app/shipping/page.tsx',
    find: 'Free shipping on all orders — no minimum.',
    replace: 'Free shipping on all orders — no minimum. Refunds within 14 days.',
    specs: ['src/tests/unit/legal-review-inventory.test.tsx'],
    invariant: 'commercial terms on a held page change only with a WS-H decision',
    scar: '/shipping, /terms and /stores advertised free worldwide shipping, thirty-day returns and a lifetime corrosion warranty in their search snippets, on a site that takes no orders, until 2026-09-26.',
  },
  {
    id: 'build-artifact-blocking',
    runner: 'vitest',
    file: 'scripts/lib/artifact-scan.mjs',
    find: '        blocking: true,\n        marker: `[redacted ${detector.rule}',
    replace: '        blocking: false,\n        marker: `[redacted ${detector.rule}',
    specs: ['src/tests/unit/artifact-scan.test.ts'],
    invariant: 'a forbidden identifier, host or credential shape in the build output is a blocking finding',
    scar: 'The build inlined the storefront hostname into the client bundle on purpose, and no check read what the build emitted: the boundary was enforced against the tree and never against the artifact visitors download.',
  },
  {
    id: 'csp-connect-self',
    runner: 'vitest',
    file: 'next.config.ts',
    find: '  \'connect-src\': ["\'self\'"],',
    replace: '  \'connect-src\': ["\'self\'", \'https:\'],',
    specs: ['src/tests/unit/csp-contract.test.ts'],
    invariant: 'the browser may open connections to this origin and to nothing else',
    scar: 'The site shipped with no Content-Security-Policy at all, so the plan to strip former commerce origins from connect-src had nothing to act on.',
  },

  // ── Playwright: need a production build, so opt-in via --with-e2e ──
  {
    id: 'hero-card-bound',
    runner: 'playwright',
    file: 'src/app/globals.css',
    find: '--hj-hero-card-max-ratio: 0.60;',
    replace: '--hj-hero-card-max-ratio: 0.98;',
    specs: ['e2e/hero-legibility.spec.ts'],
    invariant: 'the hero copy card never covers more than 60% of the photograph',
    scar: 'Every guardrail on the hero was satisfied better the larger the card grew, so the codified pressure pointed one way and the end state is a photograph behind a floating memo — ADR 013.',
  },
  {
    id: 'product-tile-bound',
    runner: 'playwright',
    file: 'src/app/globals.css',
    find: '    max-width: var(--hj-product-tile-max);',
    replace: '    min-height: 480px;',
    specs: ['e2e/product-image-fit.spec.ts'],
    invariant: 'the product tile is square, capped, and contained at every viewport',
    scar: 'min-height plus aspect-ratio is a contradiction, not a floor with a ratio: a 480px box rendered at every width and hung 184px past a 320px viewport, invisibly, because overflow-x is hidden — ADR 017.',
  },
]
