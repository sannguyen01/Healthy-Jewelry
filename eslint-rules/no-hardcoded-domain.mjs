// Flags any string literal containing this brand's own domain/social handle
// outside of src/config/site.ts, forcing consumers to import SITE_URL,
// CONTACT_EMAIL, SOCIAL_LINKS, etc. instead of retyping them.
//
// This exists because the domain was hardcoded — and once even misspelled
// ("healthyjewelry.com", single-L, a domain this brand does not own) — in
// roughly 20 files before a single source of truth was enforced.
const DOMAIN_PATTERN = /healthyjewel(?:ry|lery)\b/i

/** @type {import('eslint').Rule.RuleModule} */
const noHardcodedDomain = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow hardcoding the site domain, email, or social handle outside src/config/site.ts',
    },
    schema: [],
  },
  create(context) {
    const filename = context.filename ?? context.getFilename()
    const normalized = filename.replace(/\\/g, '/')
    if (normalized.endsWith('src/config/site.ts')) return {}
    if (normalized.endsWith('.test.ts') || normalized.endsWith('.test.tsx')) return {}
    if (normalized.includes('/tests/')) return {}
    if (normalized.includes('/e2e/')) return {}

    return {
      Literal(node) {
        if (typeof node.value === 'string' && DOMAIN_PATTERN.test(node.value)) {
          context.report({
            node,
            message:
              'Do not hardcode the site domain/email/social handle. Import SITE_URL, ' +
              'SITE_DOMAIN, CONTACT_EMAIL, SUPPORT_EMAIL, PRIVACY_EMAIL, LEGAL_EMAIL, or ' +
              'SOCIAL_LINKS from "@/config/site" instead.',
          })
        }
      },
      TemplateElement(node) {
        if (DOMAIN_PATTERN.test(node.value.raw)) {
          context.report({
            node,
            message:
              'Do not hardcode the site domain/email/social handle in a template literal. ' +
              'Import the relevant constant from "@/config/site" instead.',
          })
        }
      },
    }
  },
}

export default noHardcodedDomain
