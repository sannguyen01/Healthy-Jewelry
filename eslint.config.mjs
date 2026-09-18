import { dirname } from 'path'
import { fileURLToPath } from 'url'
import { FlatCompat } from '@eslint/eslintrc'
import noHardcodedDomain from './eslint-rules/no-hardcoded-domain.mjs'
import requirePageHeader from './eslint-rules/require-pageheader.mjs'
import noProhibitedBrandLanguage from './eslint-rules/no-prohibited-brand-language.mjs'
import noDegenerateClamp from './eslint-rules/no-degenerate-clamp.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const compat = new FlatCompat({ baseDirectory: __dirname })

const eslintConfig = [
  /**
   * `next lint` supplied these; the bare ESLint CLI does not.
   *
   * Next 16 removed the `next lint` command, so `pnpm lint` became
   * `next <directory>` with "lint" read as a project path — the error is
   * "Invalid project directory provided, no such directory: .../lint". The
   * documented migration is to invoke ESLint directly, and the cost of doing so
   * is that the ignores `next lint` applied implicitly have to be stated.
   *
   * Without them the run walks `.next/` — minified build output, thousands of
   * generated files — and reports on code nobody wrote.
   */
  {
    ignores: [
      '.next/**',
      'out/**',
      'build/**',
      'coverage/**',
      'playwright-report/**',
      'test-results/**',
      'next-env.d.ts',
      '.claude/worktrees/**',
    ],
  },
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: {
      local: {
        rules: {
          'no-hardcoded-domain': noHardcodedDomain,
          'require-pageheader': requirePageHeader,
          'no-prohibited-brand-language': noProhibitedBrandLanguage,
          'no-degenerate-clamp': noDegenerateClamp,
        },
      },
    },
    rules: {
      'local/no-hardcoded-domain': 'error',
      'local/require-pageheader': 'error',
      'local/no-prohibited-brand-language': 'error',
      'local/no-degenerate-clamp': 'error',
    },
  },
]

export default eslintConfig
