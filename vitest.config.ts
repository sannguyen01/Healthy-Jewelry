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
