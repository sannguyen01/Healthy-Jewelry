import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'

/**
 * Every font weight the app asks for must be a weight the app actually loads.
 *
 * When a weight has no downloaded face, browsers do not fall back gracefully —
 * they *synthesise* one, algorithmically thickening the nearest face. Faux bold
 * distorts stroke contrast and letterform proportions, so the text reads as a
 * different typeface. That is exactly what shipped: `layout.tsx` loaded the
 * display family (Barlow Condensed) at 400 and 500, while
 * eleven headings asked for 700 or 600 and one asked for 300. The same `<h1>` rendered at four different effective weights
 * across the site, and only the homepage was using a real face. The original pair is back (ADR 052):
 * Barlow Condensed ships 400 and 500, DM Sans 300 and 500, and a request for any other weight in
 * either is a failure here rather than a faked bold.
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
 * was not hypothetical: when display and body were two families, the body's
 * 300 made a union check wave through `--font-display` at 300 — the Materials
 * heading, rendering with no display face at 300 and silently falling back to
 * 400. The two families' sets differ again (Barlow 400 and 500, DM Sans 300 and 500),
 * so the per-token resolution is what makes "Barlow at 300" or "DM Sans at 400" a
 * failure instead of a faked weight.
 *
 * layout.tsx declares this in two hops — a loader owns a CSS variable
 * (`--font-zk`), and the `<html>` style maps a semantic token onto it
 * (`--font-display: var(--font-zk)`). Both are parsed so the weights follow the
 * name a component actually writes. A loader is either `next/font/google`
 * (`weight: ['400', '500'] … variable:`) or `next/font/local` (one
 * `{ path, weight: '400' }` entry per file in `src`, then `variable:`).
 */
function loadedWeightsByToken(): Map<string, Set<number>> {
  const source = readFileSync(LAYOUT, 'utf8')

  const byVariable = new Map<string, Set<number>>()
  // next/font/google: `weight: ['400', '500'] … variable: '--font-bc'` within one loader call.
  for (const call of source.matchAll(/weight:\s*\[([^\]]+)\][\s\S]{0,240}?variable:\s*'([^']+)'/g)) {
    const weights = new Set<number>()
    for (const raw of call[1].split(',')) {
      const value = Number.parseInt(raw.replace(/['"\s]/g, ''), 10)
      if (!Number.isNaN(value)) weights.add(value)
    }
    byVariable.set(call[2], weights)
  }
  // next/font/local: `src: [{ path, weight: '300' }, …], … variable: '--font-zk'`.
  for (const call of source.matchAll(/localFont\(\{\s*src:\s*\[([\s\S]*?)\]([\s\S]*?)\}\)/g)) {
    const variable = call[2].match(/variable:\s*'([^']+)'/)?.[1]
    if (!variable) continue
    const weights = new Set([...call[1].matchAll(/weight:\s*'(\d{3})'/g)].map((m) => Number(m[1])))
    byVariable.set(variable, weights)
  }

  // `'--font-display': 'var(--font-bm96, …)'` in the <html> style object.
  const byToken = new Map<string, Set<number>>()
  for (const alias of source.matchAll(/'(--font-[\w-]+)':\s*'var\((--font-[\w-]+)/g)) {
    const weights = byVariable.get(alias[2])
    if (weights) byToken.set(alias[1], weights)
  }

  return byToken
}

/**
 * `src/tests` is walked past, not scanned.
 *
 * This rule is about the app's own typography: which faces the browser will be asked for
 * and whether `next/font` downloaded them. A spec is not a surface. It declares weights to
 * *exercise* a component or, in `opengraph-bundled-font.test.tsx`, to prove that both
 * bundled card faces rasterise — families `layout.tsx` has never heard of, resolved by
 * Satori against files on disk rather than by a browser against a CSS custom property.
 *
 * Scanning it reported `weight 700 on an unresolved font (available: 300, 400, 500)`: a
 * confident failure about the wrong font, which is the exact outcome the `availableFor`
 * fallback below is written to avoid. `opengraph-image.tsx` is exempt by name for the same
 * reason; this is that exemption applied to the directory where it kept recurring.
 */
function tsxFiles(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry)
    if (statSync(full).isDirectory()) {
      if (entry === 'node_modules' || entry === '.next' || entry === 'tests') continue
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
    expect([...loadedByToken.keys()].sort()).toEqual(['--font-body', '--font-brand', '--font-display', '--font-ui'])
  })

  it('gives each family the weights it has files for (ADR 052)', () => {
    const weights = (token: string) => [...(loadedByToken.get(token) ?? [])].sort()
    // Barlow Condensed: 500 for every heading and name, 400 for the footer's logotype (ADR 048).
    expect(weights('--font-display')).toEqual([400, 500])
    expect(weights('--font-brand')).toEqual([400, 500])
    // DM Sans: 300 for running text, 500 for labels and emphasis. There is no 400 file and nothing asks for one.
    expect(weights('--font-body')).toEqual([300, 500])
    expect(weights('--font-ui')).toEqual([300, 500])
  })

  it('maps the display voice and the name onto one loader and the body and the label voice onto the other', () => {
    const source = readFileSync(LAYOUT, 'utf8')
    const aliasOf = (token: string) => source.match(new RegExp(`'${token}':\\s*'var\\((--font-[\\w-]+)`))?.[1]
    expect(aliasOf('--font-display')).toBe(aliasOf('--font-brand'))
    expect(aliasOf('--font-body')).toBe(aliasOf('--font-ui'))
    expect(aliasOf('--font-display')).not.toBe(aliasOf('--font-body'))
  })
})

describe('the fallback lists are valid font-family lists', () => {
  // next/font writes each `fallback` entry into the generated custom property as-is. A name that is
  // not a sequence of identifiers ("Bodoni 72": a digit is not an identifier) makes the whole
  // `font-family: var(--font-display)` invalid at computed-value time, so the element inherits the
  // body's face. Measured 2026-10-09: every heading and name was drawn in DM Sans, the computed
  // style said so, and every other guard passed because DM Sans is also a shipped face.
  const entries = [...readFileSync(LAYOUT, 'utf8').matchAll(/fallback:\s*\[([^\]]*)\]/g)].flatMap((m) =>
    [...m[1].matchAll(/'([^']*)'/g)].map((e) => e[1])
  )

  it('finds the fallback entries it judges', () => {
    expect(entries.length).toBeGreaterThanOrEqual(6)
  })

  it.each([...new Set(entries)])('%s is a valid unquoted family name', (name) => {
    const quoted = /^"[^"]+"$/.test(name)
    const identifiers = /^-?[A-Za-z_][\w-]*(?: -?[A-Za-z_][\w-]*)*$/.test(name)
    expect(quoted || identifiers, `"${name}" would invalidate the whole font-family list`).toBe(true)
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

/**
 * Each style object in a TSX file that names the given family token: the object literal that
 * names it, from the line that opens it to the line that closes it. Inline styles here are flat, so the
 * nearest `{` above and `}` below bound the object exactly — which matters, because a label
 * sitting under a heading must not be read as the heading's.
 */
function styleObjects(token: 'display' | 'body' | 'ui'): { at: string; body: string }[] {
  const objects: { at: string; body: string }[] = []
  const named = new RegExp(`fontFamily:\\s*'var\\(--font-${token}\\)`)
  for (const file of tsxFiles(SRC)) {
    const lines = readFileSync(file, 'utf8').split('\n')
    lines.forEach((text, index) => {
      if (!named.test(text)) return
      let open = index
      while (open > 0 && !/\{\s*$/.test(lines[open])) open -= 1
      let close = index
      while (close < lines.length - 1 && !/^\s*\}/.test(lines[close])) close += 1
      objects.push({ at: `${path.relative(SRC, file)}:${index + 1}`, body: lines.slice(open, close + 1).join('\n') })
    })
  }
  return objects
}

/**
 * `globals.css` declarations per selector, merged in source order across every rule that
 * names the selector. Per *selector*, not per rule: `.hj-wordmark` takes its capitals from a
 * rule it shares with two controls and its family from a rule of its own, and only the merge
 * shows both. Media blocks merge in too, which errs toward flagging.
 */
function cssBySelector(): Map<string, Map<string, string>> {
  const merged = new Map<string, Map<string, string>>()
  const css = readFileSync(GLOBALS, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
  for (const rule of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const declarations = [...rule[2].matchAll(/([\w-]+)\s*:\s*([^;]+);?/g)].map((d) => [d[1], d[2].trim()] as const)
    for (const selector of rule[1].split(',').map((s) => s.trim())) {
      const props = merged.get(selector) ?? new Map<string, string>()
      for (const [prop, value] of declarations) props.set(prop, value)
      merged.set(selector, props)
    }
  }
  return merged
}

const selectorsOf = (token: 'display' | 'body' | 'ui') =>
  [...cssBySelector()].filter(([, props]) => props.get('font-family') === `var(--font-${token})`)

/**
 * **The brand face sets the brand name and nothing else.**
 *
 * The owner kept the logotype in its original typography (2026-10-04, ADR 048). The Quiet Archive
 * (ADR 051) sets its labels in the same face, through `--font-ui`; that widens who may use the
 * *face*, not who may use the *token*. The token still names the name: exactly one rule may use
 * `--font-brand`, the logotype's, and every file that mentions the token is accounted for.
 */
describe('the brand face is the logotype\'s alone', () => {
  const css = readFileSync(GLOBALS, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')

  it('only .hj-lockup-text sets its family in --font-brand', () => {
    const users = [...cssBySelector()].filter(([, props]) => props.get('font-family') === 'var(--font-brand)').map(([s]) => s)
    expect(users).toEqual(['.hj-lockup-text'])
  })

  it('no component names the token: the logotype takes it from globals.css', () => {
    const named = tsxFiles(SRC)
      .filter((file) => !file.endsWith(`${path.sep}layout.tsx`))
      .filter((file) => readFileSync(file, 'utf8').includes('--font-brand'))
      .map((file) => path.relative(SRC, file))
    expect(named).toEqual([])
  })

  it('is used in globals.css only where it is defined and where the logotype reads it', () => {
    // The :root fallback definition and the one rule above; anything else is a new user.
    expect(css.match(/--font-brand/g)?.length).toBe(2)
  })
})

/**
 * **A heading or a name is set in tracked capitals** (ADR 052).
 *
 * The original: every `--font-display` element is Barlow Condensed in capitals, tracked looser as
 * it gets smaller. Between 2026-10-04 and 2026-10-09 the site set names in the case they were written
 * in, first in a gothic and then in a didone; both were a reference's idiom and neither was the
 * brand's. A condensed face is drawn to be read in capitals, and the same words in lower case read
 * as a different, smaller typeface, so the case is part of the voice and is declared, never inherited.
 * The label voice (`--font-ui`) is tracked capitals too, and the body voice never is.
 */
describe('display and label styles are set in capitals, running text is not', () => {
  it('every --font-display and --font-ui style forces capitals', () => {
    const offenders = [
      ...styleObjects('display'),
      ...styleObjects('ui'),
    ]
      .filter((o) => !/textTransform:\s*'uppercase'/.test(o.body))
      .map((o) => o.at)
    const rules = [...selectorsOf('display'), ...selectorsOf('ui')]
      .filter(([selector, props]) => props.get('text-transform') !== 'uppercase' && !EXEMPT_FROM_CAPITALS.has(selector))
      .map(([selector]) => `globals.css ${selector}`)
    expect(
      [...offenders, ...rules],
      'These display or label styles do not force uppercase. Headings and names are Barlow Condensed ' +
        'capitals and labels are DM Sans capitals; mixed case belongs to running text (CLAUDE.md, Typography).'
    ).toEqual([])
  })

  it('no --font-body style forces capitals', () => {
    const offenders = [
      ...styleObjects('body').filter((o) => /textTransform:\s*'uppercase'/.test(o.body)).map((o) => o.at),
      ...selectorsOf('body')
        .filter(([, props]) => props.get('text-transform') === 'uppercase')
        .map(([selector]) => `globals.css ${selector}`),
    ]
    expect(offenders, 'Running text is written in the case it is read in.').toEqual([])
  })

  it('sees the styles it judges, so no scan is blind', () => {
    expect(styleObjects('display').length).toBeGreaterThan(20)
    expect(styleObjects('ui').length).toBeGreaterThan(20)
    expect(selectorsOf('display').map(([s]) => s)).toContain('.hj-menu-link')
    expect(selectorsOf('ui').map(([s]) => s)).toContain('.label-eyebrow')
  })
})

/**
 * Selectors that set `--font-ui` or `--font-display` and are *not* forced to capitals, each on
 * purpose. A form control the visitor types into is set in the case they type; the rest of the label
 * voice is capitals.
 */
const EXEMPT_FROM_CAPITALS = new Set<string>(['.hj-field', '.hj-archive-search label'])

/**
 * **Each voice has one weight, and says so** ([ADR 052](../../../docs/adr/052-the-original-pair-on-the-quiet-archive.md)).
 *
 * - `--font-display`: **500**. Every heading, name and menu link. The 400 file is the footer's name.
 * - `--font-ui`: **500**. Every label, control and badge. DM Sans Medium is what a small tracked
 *   capital needs to hold its colour against the 300 beside it.
 * - `--font-body`: **300**. Running text, as it was before the Songmont reference. Emphasis
 *   (`strong`, `b`, `th`) is the 500 of the same family, set through its own rule below.
 *
 * Declared per style, never inherited: a weight that depends on which files happen to be loaded
 * is the defect of 2026-10-04 (twenty-seven headings inherited the body's 300 and rendered at 400
 * only because Barlow had no 300 face; a family with a real Light turned every one of them Light).
 */
describe('each voice has one weight, declared', () => {
  const weightOf = (body: string) => Number(body.match(/fontWeight:\s*(\d+)/)?.[1])

  it('every --font-display style is 500 and declares it', () => {
    const offenders = [
      ...styleObjects('display').filter((o) => weightOf(o.body) !== 500).map((o) => `${o.at}  weight ${weightOf(o.body) || 'inherited'}`),
      ...selectorsOf('display')
        .filter(([, props]) => Number(props.get('font-weight')) !== 500)
        .map(([selector, props]) => `globals.css ${selector}  weight ${props.get('font-weight') ?? 'inherited'}`),
    ]
    expect(offenders).toEqual([])
  })

  it('every --font-ui style is 500 and declares it', () => {
    const offenders = [
      ...styleObjects('ui').filter((o) => weightOf(o.body) !== 500).map((o) => `${o.at}  weight ${weightOf(o.body) || 'inherited'}`),
      ...selectorsOf('ui')
        .filter(([, props]) => Number(props.get('font-weight')) !== 500)
        .map(([selector, props]) => `globals.css ${selector}  weight ${props.get('font-weight') ?? 'inherited'}`),
    ]
    expect(offenders).toEqual([])
  })

  it('every --font-body style is 300, or 500 for emphasis, and the page default is 300', () => {
    const offenders = [
      ...styleObjects('body')
        .filter((o) => ![undefined, NaN, 300].includes(weightOf(o.body) as number | undefined) && weightOf(o.body) !== 300)
        .map((o) => `${o.at}  weight ${weightOf(o.body)}`),
      ...selectorsOf('body')
        .filter(([selector, props]) => props.has('font-weight') && Number(props.get('font-weight')) !== 300 && !['strong', 'b', 'th'].includes(selector))
        .map(([selector, props]) => `globals.css ${selector}  weight ${props.get('font-weight')}`),
    ]
    expect(offenders).toEqual([])
    expect(cssBySelector().get('body')?.get('font-weight')).toBe('300')
  })

  it('emphasis is the 500 of the body family, through one rule', () => {
    const emphasis = cssBySelector().get('strong')
    expect(emphasis?.get('font-family')).toBe('var(--font-body)')
    expect(emphasis?.get('font-weight')).toBe('500')
    expect(cssBySelector().get('th')?.get('font-weight')).toBe('500')
  })

  it('has one piece-name class, in the display voice, in capitals', () => {
    const names = selectorsOf('display').filter(([s]) => s === '.hj-card-name')
    expect(names).toHaveLength(1)
    expect(names[0][1].get('text-transform')).toBe('uppercase')
  })
})
