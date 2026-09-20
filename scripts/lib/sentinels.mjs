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
 * ## Why these seventeen
 *
 * Every one is somewhere this repository has actually been burned, so the set is a
 * regression list rather than a sample. Adding an eighteenth is cheap; the value is in
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
