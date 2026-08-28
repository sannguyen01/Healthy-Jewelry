// Flags any `clamp(min, preferred, max)` whose preferred value cannot vary — a clamp
// that resolves to the same length at every viewport, while reading as fluid.
//
// `HorizontalScroll.tsx` carried `width: clamp(220px, 260px, 280px)`. The middle argument
// is what a clamp interpolates; a constant there pins the result at 260px forever, so the
// bounds either side are decoration. A comment thirty lines below already knew — "a fixed
// 260px, not a fluid grid cell" — which is the tell that matters: the knowledge existed
// and the code did not act on it, so the next reader gets the comment or the declaration
// depending on which they reach first.
//
// This is the ADR 013 shape in miniature. A degenerate clamp cannot fail any check: it
// produces a valid length, the page renders, and every viewport gets a card sized for
// none of them. Only reading the three arguments together reveals it, and nothing was
// reading them together.
//
// A clamp is fluid when its preferred value depends on something that changes — viewport
// units, percentages, container query units, or an arithmetic expression over them. Any
// of those, and this stays quiet.

const FLUID = /\d*\.?\d+\s*(vw|vh|dvw|dvh|svw|svh|lvw|lvh|vmin|vmax|cqw|cqh|cqi|cqb|cqmin|cqmax|%)|\bvar\(|\bcalc\(|\bmin\(|\bmax\(/

/** Splits clamp()'s three arguments, respecting nested parentheses. */
function splitArguments(inner) {
  const args = []
  let depth = 0
  let current = ''
  for (const character of inner) {
    if (character === '(') depth++
    if (character === ')') depth--
    if (character === ',' && depth === 0) {
      args.push(current.trim())
      current = ''
      continue
    }
    current += character
  }
  args.push(current.trim())
  return args
}

/** Every `clamp(...)` in a string, as its argument list. */
export function degenerateClamps(text) {
  const found = []
  for (let index = text.indexOf('clamp('); index !== -1; index = text.indexOf('clamp(', index + 1)) {
    let depth = 0
    let end = index + 'clamp'.length
    for (; end < text.length; end++) {
      if (text[end] === '(') depth++
      else if (text[end] === ')') {
        depth--
        if (depth === 0) break
      }
    }
    const inner = text.slice(index + 'clamp('.length, end)
    const args = splitArguments(inner)
    if (args.length !== 3) continue
    if (!FLUID.test(args[1])) found.push({ args, source: `clamp(${inner})` })
  }
  return found
}

/** @type {import('eslint').Rule.RuleModule} */
const noDegenerateClamp = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow clamp() whose preferred value is a constant, which resolves to a fixed length at every viewport',
    },
    schema: [],
    messages: {
      degenerate:
        '`{{source}}` is not fluid: its preferred value `{{preferred}}` has no viewport, ' +
        'percentage or container unit, so this resolves to `{{preferred}}` at every width ' +
        'and the bounds either side never apply. Either make the middle argument depend on ' +
        'the viewport (e.g. `{{suggestion}}`), or write the fixed length plainly so it says ' +
        'what it does. See docs/adr/021-a-metric-with-only-one-direction.md.',
    },
  },
  create(context) {
    const check = (node, text) => {
      for (const { args, source } of degenerateClamps(text)) {
        context.report({
          node,
          messageId: 'degenerate',
          data: { source, preferred: args[1], suggestion: `clamp(${args[0]}, 22vw, ${args[2]})` },
        })
      }
    }

    return {
      Literal(node) {
        if (typeof node.value === 'string' && node.value.includes('clamp(')) {
          check(node, node.value)
        }
      },
      TemplateElement(node) {
        const text = node.value?.cooked ?? node.value?.raw ?? ''
        if (text.includes('clamp(')) check(node, text)
      },
    }
  },
}

export default noDegenerateClamp
