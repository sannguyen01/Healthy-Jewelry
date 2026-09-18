import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    // Exclude Playwright E2E specs — those run via `pnpm e2e`, not Vitest.
    // Also exclude agent worktrees — they are session-isolated scratch dirs,
    // not part of this project's test suite.
    exclude: ['e2e/**', 'node_modules/**', '.next/**', '.claude/worktrees/**'],
    /**
     * The environment every unit run gets, local and CI alike.
     *
     * ## Why this is here and not only in the workflow
     *
     * These modules are mostly `process.env.X ?? fallback`, and **which side of
     * each of those branches runs is a property of the environment.** With the
     * values declared only in `ci.yml`, a contributor's `pnpm test:coverage`
     * measured a different set of branches from the merge gate — and with
     * `thresholds.perFile` on, that difference is the difference between green
     * and red.
     *
     * It is not hypothetical. On 2026-09-18 a branch passed locally with zero
     * coverage errors and failed CI three pushes running on exactly three files:
     *
     *     ERROR: Coverage for branches (70%)    … src/config/build-info.ts
     *     ERROR: Coverage for branches (50%)    … src/config/shopify-public.ts
     *     ERROR: Coverage for branches (66.66%) … src/config/shopify.ts
     *
     * The real fix was `config-env-branches.test.ts`, which stubs both arms of
     * every one of those reads so the number stops depending on the ambient
     * environment at all. This block is the second half: it makes the local
     * command and the gate ask the same question, so the next such difference
     * is visible before the push rather than after it.
     *
     * `vitest-env-contract.test.ts` holds these against `ci.yml` in both
     * directions, so the two cannot drift apart again.
     *
     * Every value is a mock. A unit run must never reach a real store, and a
     * credential that works has no business being reachable from a test.
     */
    env: {
      SHOPIFY_STORE_DOMAIN: 'mock.myshopify.com',
      SHOPIFY_STOREFRONT_ACCESS_TOKEN: 'mock_token',
      NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN: 'mock.myshopify.com',
      SHOPIFY_WEBHOOK_SECRET: 'mock_webhook_secret',
      SHOPIFY_REVALIDATION_SECRET: 'mock_revalidation_secret',
      // The unit suite asserts the production site constant
      // (src/tests/unit/config.test.ts), while the build and the E2E server need
      // localhost — the same name legitimately means different things per step,
      // which is why `ci.yml` sets it on each step rather than at workflow scope.
      NEXT_PUBLIC_SITE_URL: 'https://healthyjewellery.com',
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      // Scope to business-logic layer only — UI components are verified via E2E
      include: ['src/lib/**/*.ts', 'src/store/**/*.ts', 'src/store/**/*.tsx', 'src/config/**/*.ts'],
      exclude: [
        'src/lib/shopify/queries/**',
        'src/lib/shopify/mutations/**',
        'src/**/*.test.{ts,tsx}',
        'src/test/**',
      ],
      thresholds: {
        // **Per file, not per project.** A single aggregate says nothing about a
        // distribution: this project sat at 91% overall while six files sat below
        // the floor, including `shopify/customer/client.ts` at **0%** — the module
        // that decides who is signed in — and `customer/oauth.ts` at 35.9%, which
        // is where the OAuth nonce was being generated and never checked. The gate
        // was not broken; seventeen well-covered modules were paying for two that
        // were not, and the mean reported the average rather than the weakest link.
        //
        // There are deliberately **no per-glob exemptions**. Every file in the
        // included set clears every floor today, and an exemption list is the
        // mechanism by which a floor becomes advisory — the next file below the
        // line gets added to it rather than tested, and the list is where the
        // aggregate's blindness reappears under a different name.
        //
        // `coverage-gate-contract.test.ts` reads this object back out of the
        // config's AST, so turning `perFile` off silently is itself a test failure.
        perFile: true,
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
