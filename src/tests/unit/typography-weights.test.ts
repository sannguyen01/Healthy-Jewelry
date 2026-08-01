import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'

/**
 * Every font weight the app asks for must be a weight the app actually loads.
 *
 * When a weight has no downloaded face, browsers do not fall back gracefully —
 * they *synthesise* one, algorithmically thickening the nearest face. Faux bold
 * distorts stroke contrast and letterform proportions, so the text reads as a
 * different typeface. That is exactly what shipped: `layout.tsx` loads Barlow
 * Condensed at 400 and 500, while eleven headings asked for 700 or 600 and one
 * asked for 300. The same `<h1>` rendered at four different effective weights
 * across the site, and only the homepage was using a real face.
 *
 * Nothing catches this at runtime. It is not a type error, not a lint error,
 * and not a visual-regression failure unless someone happens to compare two
 * pages side by side. It is, however, trivially checkable from source — which
 * is what this does, in the fast gate, in milliseconds.
 */

const SRC = path.resolve(__dirname, '../..')
const LAYOUT = path.join(SRC, 'app/layout.tsx')
const GLOBALS = path.join(SRC, 'app/globals.css')

/**
 * Files that legitimately sit outside the font pipeline:
 *
 * - `opengraph-image.tsx` renders through Satori, not the browser. It loads no
 *   custom font, so its weights are resolved against a different family
 *   entirely and this rule does not apply.
 * - `global-error.tsx` replaces the root layout when React fails to mount, so
 *   the `--font-*` custom properties do not exist and it names raw families on
 *   purpose.
 */
const EXEMPT = ['opengraph-image.tsx', 'global-error.tsx']

/**
 * Weights per font, resolved through to the semantic token a component names.
 *
 * Checking against the union of all loaded weights is not enough, and the gap
 * is not hypothetical: DM Sans loads 300, so a union check waves through
 * `--font-display` at 300 — which is the Materials heading, rendering with no
 * Barlow Condensed 300 face and silently falling back to 400.
 *
 * layout.tsx declares this in two hops — a loader owns a CSS variable
 * (`--font-bc`), and the `<html>` style maps a semantic token onto it
 * (`--font-display: var(--font-bc)`). Both are parsed so the weights follow the
 * name a component actually writes.
 */
function loadedWeightsByToken(): Map<string, Set<number>> {
  const source = readFileSync(LAYOUT, 'utf8')

  // `weight: ['400', '500'] … variable: '--font-bc'` within one loader call.
  const byVariable = new Map<string, Set<number>>()
  for (const call of source.matchAll(/weight:\s*\[([^\]]+)\][\s\S]{0,240}?variable:\s*'([^']+)'/g)) {
    const weights = new Set<number>()
    for (const raw of call[1].split(',')) {
      const value = Number.parseInt(raw.replace(/['"\s]/g, ''), 10)
      if (!Number.isNaN(value)) weights.add(value)
    }
    byVariable.set(call[2], weights)
  }

  // `'--font-display': 'var(--font-bc, …)'` in the <html> style object.
  const byToken = new Map<string, Set<number>>()
  for (const alias of source.matchAll(/'(--font-(?:display|ui|body))':\s*'var\((--font-[\w-]+)/g)) {
    const weights = byVariable.get(alias[2])
    if (weights) byToken.set(alias[1], weights)
  }

  return byToken
}

function tsxFiles(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry)
    if (statSync(full).isDirectory()) {
      if (entry === 'node_modules' || entry === '.next') continue
      tsxFiles(full, found)
    } else if (entry.endsWith('.tsx') && !EXEMPT.includes(entry)) {
      found.push(full)
    }
  }
  return found
}

interface WeightUse {
  file: string
  line: number
  weight: number
  /** The `--font-*` token in scope, when one is declared nearby. */
  token: string | null
}

/**
 * Every numeric `fontWeight` in TSX and `font-weight` in globals.css, paired
 * with the font token it applies to.
 *
 * The pairing is positional: within a style object, `fontFamily` and
 * `fontWeight` sit within a few lines of each other, so the nearest preceding
 * `--font-*` in a short window is the one in scope. A weight with no token
 * nearby is checked against the union instead — permissive by design, since
 * guessing wrong would produce a confident failure about the wrong font.
 */
const TOKEN_SCOPE_LINES = 12

function weightsInUse(): WeightUse[] {
  const uses: WeightUse[] = []

  const record = (file: string, source: string, pattern: RegExp, familyPattern: RegExp) => {
    const lines = source.split('\n')
    lines.forEach((text, index) => {
      for (const match of text.matchAll(pattern)) {
        const weight = Number.parseInt(match[1], 10)
        if (Number.isNaN(weight)) continue

        let token: string | null = null
        for (let back = index; back >= Math.max(0, index - TOKEN_SCOPE_LINES); back -= 1) {
          const family = lines[back].match(familyPattern)
          if (family) {
            token = family[1]
            break
          }
        }

        uses.push({ file: path.relative(SRC, file), line: index + 1, weight, token })
      }
    })
  }

  for (const file of tsxFiles(SRC)) {
    record(
      file,
      readFileSync(file, 'utf8'),
      /fontWeight:\s*'?(\d{3})'?/g,
      /fontFamily:\s*'var\((--font-[\w-]+)/
    )
  }
  // `inherit` and named keywords are fine; only numeric declarations are checked.
  record(
    GLOBALS,
    readFileSync(GLOBALS, 'utf8'),
    /font-weight:\s*(\d{3})\b/g,
    /font-family:\s*var\((--font-[\w-]+)/
  )

  return uses
}

const loadedByToken = loadedWeightsByToken()
const anyLoadedWeight = new Set([...loadedByToken.values()].flatMap((set) => [...set]))
const uses = weightsInUse()

/** Weights available to a use — its own font's, or the union when unknown. */
function availableFor(use: WeightUse): Set<number> {
  return (use.token && loadedByToken.get(use.token)) || anyLoadedWeight
}

const describeWeights = (set: Set<number>) => [...set].sort((a, b) => a - b).join(', ')

describe('font loading', () => {
  it('resolves each --font-* token to the weights its loader declares', () => {
    // Guards the whole file: if either parsing hop stops matching, every
    // assertion below would pass against empty sets.
    expect([...loadedByToken.keys()].sort()).toEqual(['--font-body', '--font-display', '--font-ui'])
  })

  it('loads the 500 that PageHeader and the homepage hero depend on', () => {
    expect(loadedByToken.get('--font-display')?.has(500)).toBe(true)
  })

  it('does not load a display weight heavier than 500', () => {
    // Documents why PageHeader hardcodes 500. If a heavier face is ever added
    // to the loader this fails, as a prompt to revisit that decision rather
    // than leave the component silently conservative.
    const display = loadedByToken.get('--font-display')
    expect([...(display ?? [])].filter((weight) => weight > 500)).toEqual([])
  })
})

describe('no font weight is synthesised', () => {
  it('finds font weights to check', () => {
    expect(uses.length).toBeGreaterThan(0)
  })

  it('resolves the font token for the headings it checks', () => {
    // If the positional pairing broke, every use would fall back to the union
    // and the family-specific failures below would stop being detectable.
    expect(uses.filter((use) => use.token !== null).length).toBeGreaterThan(0)
  })

  it('every requested weight has a real face in its own font', () => {
    const orphans = uses.filter((use) => !availableFor(use).has(use.weight))

    expect(
      orphans.map(
        (o) =>
          `${o.file}:${o.line} → weight ${o.weight} on ${o.token ?? 'an unresolved font'} ` +
          `(available: ${describeWeights(availableFor(o))})`
      ),
      `These weights have no downloaded face, so the browser will synthesise or ` +
        `substitute one and the text will render as a different typeface. Either ` +
        `use a weight the font actually loads, or add the weight to the next/font ` +
        `loader in src/app/layout.tsx.`
    ).toEqual([])
  })
})
