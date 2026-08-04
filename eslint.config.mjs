import { dirname } from 'path'
import { fileURLToPath } from 'url'
import { FlatCompat } from '@eslint/eslintrc'
import noHardcodedDomain from './eslint-rules/no-hardcoded-domain.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const compat = new FlatCompat({ baseDirectory: __dirname })

const eslintConfig = [
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: {
      local: { rules: { 'no-hardcoded-domain': noHardcodedDomain } },
    },
    rules: {
      'local/no-hardcoded-domain': 'error',
    },
  },
]

export default eslintConfig
