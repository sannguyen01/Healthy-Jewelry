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
 * ## Why these twelve
 *
 * Every one is somewhere this repository has actually been burned, so the set is a
 * regression list rather than a sample. Adding a thirteenth is cheap; the value is in
 * each one being a real scar.
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
    file: 'src/lib/data/hj-data.ts',
    find: "    handle: 'charms',",
    replace: "    handle: 'charm',",
    specs: ['src/tests/unit/collection-handle-contract.test.ts'],
    invariant: 'every collection a product maps into is one the router will serve',
    scar: '/shop/[collection] sets dynamicParams = false, so a drifted handle is a hard 404 reached from a link the site renders itself, on a page that looks healthy.',
  },
  {
    id: 'fallback-catalogue-discrimination',
    runner: 'vitest',
    file: 'scripts/verify-production.mjs',
    find: 'export const FALLBACK_ONLY_HANDLES = [',
    replace: 'export const FALLBACK_ONLY_HANDLES = [].concat([',
    specs: ['src/tests/unit/production-smoke-handles.test.ts'],
    invariant: 'the live smoke run can still tell the static fallback from the real catalogue',
    scar: 'A Storefront token in the Admin slot made every fetcher fall back silently; the site served "Dome Ring" to customers and checkout refused on placeholder variant IDs.',
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
    id: 'cart-variant-identity',
    runner: 'vitest',
    file: 'src/store/cart.tsx',
    find: "const existing = state.items.find((item) => item.variantId === resolvedVariantId)",
    replace: "const existing = state.items.find((item) => item.product.id === product.id)",
    specs: ['src/tests/unit/cart.test.ts'],
    invariant: 'cart lines are keyed by variant, so two sizes of one ring are two lines',
    scar: 'Keying by product merged them, so adding a second size silently changed the first.',
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
