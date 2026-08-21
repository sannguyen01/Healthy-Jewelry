// Healthy Jewelry is a titanium/biocompatible-metal brand, not a
// crystal-healing brand — CLAUDE.md's PROHIBITED section bans stones, gems,
// crystals, chakras, and healing/mystical copy outright. Until now that ban
// was only machine-checked against the static catalog (hj-data.test.ts) —
// nothing stopped the words from entering page copy, alt text, or component
// strings anywhere else in src/. This closes that gap for the same word list.
const PROHIBITED_PATTERN = /\b(stones?|crystals?|gemstones?|chakras?|healing|mystical|spiritual)\b/i

// The brand's own positioning copy says the prohibited words on purpose, to
// reject them: "No stones. No gemstones. No healing crystals. No chakras."
// (CLAUDE.md, Brand Identity). A clause that *leads* with "No" is asserting
// the brand does not do this, which is the opposite of the thing this rule
// exists to catch — so each clause is checked for that lead-in before the
// word list is applied to it.
function findUnnegatedMatch(text) {
  for (const clause of text.split(/[.,!?]+/)) {
    const trimmed = clause.trim()
    if (/^no\b/i.test(trimmed)) continue
    const match = trimmed.match(PROHIBITED_PATTERN)
    if (match) return match[0]
  }
  return null
}

/** @type {import('eslint').Rule.RuleModule} */
const noProhibitedBrandLanguage = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow stone/crystal/healing/mystical language anywhere in app source (CLAUDE.md PROHIBITED)',
    },
    schema: [],
  },
  create(context) {
    const filename = context.filename ?? context.getFilename()
    const normalized = filename.replace(/\\/g, '/')
    if (normalized.endsWith('.test.ts') || normalized.endsWith('.test.tsx')) return {}
    if (normalized.includes('/tests/')) return {}
    if (normalized.includes('/e2e/')) return {}

    const report = (node, raw) => {
      const word = findUnnegatedMatch(raw)
      if (!word) return
      context.report({
        node,
        message:
          `Prohibited brand language "${word}" — this is a titanium/biocompatible-metal ` +
          'brand, not a crystal-healing brand. See CLAUDE.md PROHIBITED.',
      })
    }

    return {
      JSXText(node) {
        report(node, node.value)
      },
      Literal(node) {
        if (typeof node.value === 'string') report(node, node.value)
      },
      TemplateElement(node) {
        report(node, node.value.raw)
      },
    }
  },
}

export default noProhibitedBrandLanguage
