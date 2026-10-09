import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'

/**
 * Reading the app's own typography out of its source, shared by the guards that hold it
 * (`typography-tracking.test.ts`, `typography-scale.test.ts`).
 *
 * Both ask the same question of two kinds of text: an inline style object in a component
 * (`style={{ fontFamily: 'var(--font-ui)', letterSpacing: 'var(--tracking-label)' }}`) and a rule in the
 * stylesheet. This finds them, and the voice (`--font-ui`, `--font-display`, `--font-body`) each one
 * declares, so a guard can say "a label is tracked like a label" rather than "a number is a number".
 */

export const SRC = path.resolve(__dirname, '../..')
export const GLOBALS = path.join(SRC, 'app/globals.css')

/**
 * Documents that sit outside the stylesheet's tokens, each for a reason:
 * - `opengraph-image.tsx` is rasterised by Satori, which has no custom properties.
 * - `global-error.tsx` replaces the root layout when React fails to mount, so the tokens are not
 *   defined there (it declares its own faces for the same reason, `src/lib/design/siteFace.ts`).
 */
export const OUT_OF_LAYOUT = ['opengraph-image.tsx', 'global-error.tsx']

export type Voice = 'ui' | 'display' | 'body' | 'brand'

export function sourceFiles(dir: string = SRC, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry)
    if (statSync(full).isDirectory()) {
      if (entry === 'node_modules' || entry === '.next' || entry === 'tests') continue
      sourceFiles(full, found)
    } else if (entry.endsWith('.tsx') && !OUT_OF_LAYOUT.includes(entry)) {
      found.push(full)
    }
  }
  return found
}

export const lineOf = (text: string, index: number) => text.slice(0, index).split('\n').length

export function voiceOf(body: string): Voice | null {
  const m = body.match(/(?:fontFamily:\s*'|font-family:\s*)var\(--font-(ui|display|body|brand)\b/)
  return (m?.[1] as Voice | undefined) ?? null
}

/** The `{ … }` a position sits inside, by brace matching: an inline style object. */
export function enclosingObject(text: string, at: number): string {
  let depth = 0
  let start = at
  for (let i = at; i >= 0; i -= 1) {
    if (text[i] === '}') depth += 1
    if (text[i] === '{') {
      if (depth === 0) {
        start = i
        break
      }
      depth -= 1
    }
  }
  depth = 0
  let end = at
  for (let i = start + 1; i < text.length; i += 1) {
    if (text[i] === '{') depth += 1
    if (text[i] === '}') {
      if (depth === 0) {
        end = i
        break
      }
      depth -= 1
    }
  }
  return text.slice(start, end + 1)
}

/** The stylesheet with its comments blanked (line numbers are kept). */
export function stylesheet(): string {
  return readFileSync(GLOBALS, 'utf8').replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '))
}

export interface CssRule {
  selector: string
  body: string
  /** 1-based line of the rule's opening selector. */
  line: number
}

/**
 * Every leaf rule: a selector, then a body with no braces in it. `@layer` and `@media` blocks are
 * not leaves, so they are walked through rather than matched. Also reads a `<style>` template inside a
 * component when given its text.
 */
export function cssRules(css: string): CssRule[] {
  const rules: CssRule[] = []
  for (const rule of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    rules.push({
      selector: rule[1].replace(/\s+/g, ' ').trim(),
      body: rule[2],
      line: lineOf(css, (rule.index ?? 0) + rule[0].search(/\S/)),
    })
  }
  return rules
}
