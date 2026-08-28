import ts from 'typescript'
import { walk } from './tsAstScan'

/**
 * Every place this codebase gives an element a size, grouped per element.
 *
 * ## The shape this exists to find
 *
 * [ADR 013](../../../docs/adr/013-a-protection-that-can-only-grow.md) found that every
 * guardrail on the hero copy card was satisfied *better* the larger the card grew. The
 * codified pressure pointed in exactly one direction, and the end state that direction
 * leads to is a photograph behind a floating memo, with every check green the whole way.
 *
 * [ADR 017](../../../docs/adr/017-a-box-that-could-not-be-both.md) found the same
 * asymmetry a second time, in a sharper form: `min-height: 480px` and `aspect-ratio: 1/1`
 * on one element is not a floor plus a ratio, it is two competing authorities. The
 * min-height set the height and the ratio derived the width from it, so a 480px box
 * rendered at every viewport and hung 184px past a 320px screen — invisibly, because
 * `overflow-x: hidden` means no scrollbar and no symptom.
 *
 * Two instances found by inspection is where a defect becomes a category.
 *
 * ## Why this groups by element rather than listing declarations
 *
 * The interesting properties are relationships between declarations on the *same* box: a
 * floor with no ceiling, a ratio with nothing bounding the axis it derives from, a
 * min-height and an aspect-ratio contradicting each other. A flat list of sizes cannot
 * express any of them.
 */

/** The properties that give a box a dimension, in both spellings. */
const SIZE_PROPERTIES = new Set([
  'width',
  'height',
  'minWidth',
  'minHeight',
  'maxWidth',
  'maxHeight',
  'aspectRatio',
])

const CSS_SIZE_PROPERTIES = new Set([
  'width',
  'height',
  'min-width',
  'min-height',
  'max-width',
  'max-height',
  'aspect-ratio',
])

export interface SizedElement {
  /** Repo-relative file the element is declared in. */
  file: string
  /** For CSS, the selector; for inline styles, the enclosing JSX element or a line hint. */
  context: string
  /** Size declarations on this one element, keyed by property name. */
  sizes: Record<string, string>
}

/** Camel-cases a CSS property so inline and stylesheet declarations compare equal. */
export function normaliseProperty(name: string): string {
  return name.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase())
}

/**
 * Inline `style={{ … }}` objects carrying at least one size property.
 *
 * Every object literal is considered, not only ones lexically under a `style` attribute:
 * this codebase also builds style objects in variables and spreads them, and a scan that
 * only looked at the attribute would miss those silently.
 */
export function collectInlineSizes(sourceFile: ts.SourceFile, file: string): SizedElement[] {
  const elements: SizedElement[] = []

  walk(sourceFile, (node) => {
    if (!ts.isObjectLiteralExpression(node)) return

    const sizes: Record<string, string> = {}
    for (const property of node.properties) {
      if (!ts.isPropertyAssignment(property)) continue
      const name = property.name.getText(sourceFile).replace(/['"]/g, '')
      if (!SIZE_PROPERTIES.has(name)) continue
      sizes[name] = property.initializer.getText(sourceFile).replace(/^['"`]|['"`]$/g, '')
    }

    if (Object.keys(sizes).length === 0) return

    const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile))
    elements.push({ file, context: `inline style at line ${line + 1}`, sizes })
  })

  return elements
}

/**
 * CSS rule blocks carrying at least one size property.
 *
 * A brace-depth walk rather than a regex over declarations: `globals.css` nests rules
 * inside `@layer` and `@media`, and the property that matters — which declarations share
 * an element — is exactly the one a flat scan destroys.
 */
export function collectCssSizes(css: string, file: string): SizedElement[] {
  const elements: SizedElement[] = []
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '')

  const stack: string[] = []
  let buffer = ''

  const flush = (selector: string, body: string) => {
    const sizes: Record<string, string> = {}
    for (const declaration of body.split(';')) {
      const [rawName, ...rest] = declaration.split(':')
      if (rest.length === 0) continue
      const name = rawName.trim()
      if (!CSS_SIZE_PROPERTIES.has(name)) continue
      sizes[normaliseProperty(name)] = rest.join(':').trim().replace(/\s*!important$/, '')
    }
    if (Object.keys(sizes).length > 0) {
      elements.push({ file, context: [...stack, selector].filter(Boolean).join(' › '), sizes })
    }
  }

  let index = 0
  while (index < withoutComments.length) {
    const character = withoutComments[index]
    if (character === '{') {
      const selector = buffer.trim().split('\n').pop()?.trim() ?? ''
      // Find this block's matching close, so nested rules are handled by recursion below
      // rather than by hoping declarations and sub-rules do not interleave.
      let depth = 1
      let end = index + 1
      while (end < withoutComments.length && depth > 0) {
        if (withoutComments[end] === '{') depth++
        else if (withoutComments[end] === '}') depth--
        end++
      }
      const body = withoutComments.slice(index + 1, end - 1)

      // Declarations belonging to this block are everything before its first nested rule.
      const ownDeclarations = body.split('{')[0].split('}')[0]
      flush(selector, ownDeclarations)

      const nested = body.slice(ownDeclarations.length)
      if (nested.includes('{')) {
        stack.push(selector)
        elements.push(...collectCssSizes(nested, file).map((e) => ({
          ...e,
          context: [selector, e.context].filter(Boolean).join(' › '),
        })))
        stack.pop()
      }

      buffer = ''
      index = end
      continue
    }
    buffer += character
    index++
  }

  return elements
}

/**
 * Does this length depend on the viewport or its container, rather than being absolute?
 *
 * No leading `\b` before the units: in `100dvh` the digit and the `d` are both word
 * characters, so there is no boundary between them and an anchored pattern matches
 * nothing. That mistake reported every `minHeight: '100vh'` in the app as an unbounded
 * absolute floor — a scanner failing open, which is the failure mode this whole
 * directory exists to make impossible.
 */
export function isRelative(value: string): boolean {
  return /\d+(\.\d+)?\s*(vh|dvh|svh|lvh|vw|dvw|vmin|vmax|%)/.test(value) || /\bauto\b|calc\(/.test(value)
}

/** A floor of `0` is the flex `min-width: 0` idiom, not a size. */
export function isZero(value: string): boolean {
  return /^0(px|rem|em)?$/.test(value.trim())
}
