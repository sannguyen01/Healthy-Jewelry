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
