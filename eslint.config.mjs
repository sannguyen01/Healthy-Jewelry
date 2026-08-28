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
