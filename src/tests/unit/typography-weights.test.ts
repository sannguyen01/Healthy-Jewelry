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
 * display family (Barlow Condensed, until 2026-10-04) at 400 and 500, while
 * eleven headings asked for 700 or 600 and one asked for 300. The same `<h1>` rendered at four different effective weights
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
 * was not hypothetical: when display and body were two families, the body's
 * 300 made a union check wave through `--font-display` at 300 — the Materials
 * heading, rendering with no display face at 300 and silently falling back to
 * 400. Since 2026-10-04 one family serves all three tokens, so today the sets
 * are equal; the per-token resolution stays so a second family cannot
 * reintroduce the gap unseen.
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

  // `'--font-display': 'var(--font-bc, …)'` in the <html> style object.
  const byToken = new Map<string, Set<number>>()
  for (const alias of source.matchAll(/'(--font-(?:display|ui|body|brand))':\s*'var\((--font-[\w-]+)/g)) {
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
 * bundled Noto Sans faces rasterise — a family `layout.tsx` has never heard of, resolved by
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

  it('loads the brand name\'s two weights: 500 in the header, 400 in the footer (ADR 048)', () => {
    expect([...(loadedByToken.get('--font-brand') ?? [])].sort()).toEqual([400, 500])
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

/**
 * Each `--font-display` style object in a TSX file: the object literal that names the token,
 * from the line that opens it to the line that closes it. Inline styles here are flat, so the
 * nearest `{` above and `}` below bound the object exactly — which matters, because a label
 * sitting under a heading must not be read as the heading's.
 */
function displayStyleObjects(): { at: string; body: string }[] {
  const objects: { at: string; body: string }[] = []
  for (const file of tsxFiles(SRC)) {
    const lines = readFileSync(file, 'utf8').split('\n')
    lines.forEach((text, index) => {
      if (!/fontFamily:\s*'var\(--font-display\)/.test(text)) return
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

const displaySelectors = [...cssBySelector()].filter(([, props]) => props.get('font-family') === 'var(--font-display)')

/**
 * **The brand face sets the brand name and nothing else.**
 *
 * The owner kept the logotype in its original typography (2026-10-04, ADR 048) — an exception
 * to "one family", granted for the name alone. An exception that is not bounded spreads: the
 * next heading that wants "something with more character" reaches for the token that is
 * already there. So exactly one rule may use `--font-brand`, the logotype's, and every file
 * that mentions the token is accounted for.
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
 * **A heading or a name is set in the case it is written in.**
 *
 * Until 2026-10-04 every `--font-display` element was forced to capitals: condensed uppercase
 * was the Gentle Monster idiom the site was first drawn in. Songmont, the reference since,
 * sets everything in one gothic family and lists its pieces in Title Case ("Medium Gather
 * Bag"), and the catalogue already writes names that way — the capitals were a stylesheet
 * overriding the content. So the rule is by role: `--font-display` (headings, product and
 * collection names) never carries `text-transform: uppercase`; small `--font-ui` labels may.
 * The logotype is not an exception to this either: it is the brand name in its own face
 * (`--font-brand`, above), in the tracked capitals it has always had.
 */
describe('headings and names are set in their own case', () => {
  it('no --font-display style forces capitals', () => {
    const offenders = [
      ...displayStyleObjects()
        .filter((o) => /textTransform:\s*'uppercase'/.test(o.body))
        .map((o) => o.at),
      ...displaySelectors.filter(([, props]) => props.get('text-transform') === 'uppercase').map(([s]) => `globals.css ${s}`),
    ]
    expect(
      offenders,
      'These --font-display styles force uppercase. Headings and names render in the case ' +
        'they are written in; capitals belong to small --font-ui labels (DESIGN.md, Type).'
    ).toEqual([])
  })

  it('sees the styles it judges, so neither scan is blind', () => {
    expect(displayStyleObjects().length).toBeGreaterThan(20)
    expect(displaySelectors.map(([s]) => s)).toContain('.hj-menu-link')
    // And the labels keep their capitals: if this reads zero, the CSS patterns stopped matching.
    expect([...cssBySelector().values()].filter((p) => p.get('text-transform') === 'uppercase').length).toBeGreaterThan(0)
  })
})

/**
 * **Display weight is chosen by role, not by whoever wrote the page** ([ADR 050](../../../docs/adr/050-one-face-means-no-borrowed-ones.md)).
 *
 * Measured across the routes on 2026-10-09, the same tier was set at two weights depending on the
 * page: the 88px page title was 400 on `/shop`, the collections and the piece pages and 500 on
 * About, Materials and Contact; the homepage's section heading was 500 and About's equivalent
 * 400; a question heading was 500 in the FAQ and 400 in Materials; a piece's name was 400 in the
 * grid and 500 in the strip. With one family, weight is the only thing that separates a heading
 * from the body at small sizes, so it has to mean one thing:
 *
 * - **h1 is 500**, always (the page title and the hero);
 * - **display text at `--text-lg` or smaller is 500**: below about 24px it competes with body
 *   copy in the same family (names, question headings, small headings);
 * - **display text above `--text-lg` is 400**: large type needs no help.
 *
 * Keyed to the size *token*, not the computed size, because the tokens are `clamp()`s: a heading
 * is 35px on a desktop and 23px on a phone, and a weight that flipped across that boundary would
 * be a different design on each. Decorative watermarks (`aria-hidden`, `pointer-events: none`)
 * are exempt by listing, not by pattern.
 */
describe('display weight follows the size tier', () => {
  const DECORATIVE = ['components/home/CareSection.tsx']
  const SMALL_TOKENS = new Set(['--text-lg', '--text-base', '--text-sm', '--text-xs'])

  /** 'small' when the size is the label/body/lg tokens or a literal under 1.5rem; else 'large'. */
  function tier(fontSize: string): 'small' | 'large' | null {
    const token = fontSize.match(/var\((--text-[\w]+)/)?.[1]
    if (token) return SMALL_TOKENS.has(token) ? 'small' : 'large'
    const literal = fontSize.match(/'(?:clamp\()?\s*([\d.]+)(rem|px)/)
    if (!literal) return null
    return Number(literal[1]) * (literal[2] === 'rem' ? 16 : 1) < 24 ? 'small' : 'large'
  }

  const judged = displayStyleObjects()
    .filter((o) => !DECORATIVE.some((d) => o.at.startsWith(d)))
    .map((o) => ({
      at: o.at,
      weight: Number(o.body.match(/fontWeight:\s*(\d+)/)?.[1]),
      size: tier(o.body.match(/fontSize:\s*([^\n]+)/)?.[1] ?? ''),
    }))

  it('sees the styles it judges', () => {
    expect(judged.length).toBeGreaterThan(20)
    expect(judged.filter((j) => j.size === 'small').length).toBeGreaterThan(3)
    expect(judged.filter((j) => j.size === 'large').length).toBeGreaterThan(8)
  })

  it('sets every small display style at 500 and every large one at 400, bar the h1', () => {
    const lines = new Map<string, string[]>()
    const isH1 = (at: string): boolean => {
      const [file, line] = at.split(':')
      const source = lines.get(file) ?? readFileSync(path.join(SRC, file), 'utf8').split('\n')
      lines.set(file, source)
      for (let i = Number(line) - 1; i >= Math.max(0, Number(line) - 6); i -= 1) {
        if (/<h1\b/.test(source[i])) return true
        if (/<(h[2-6]|p|span|div|a|li|button)\b/.test(source[i])) return false
      }
      return false
    }
    const offenders = judged
      .filter((j) => j.size !== null)
      .filter((j) => {
        if (isH1(j.at)) return j.weight !== 500
        return j.weight !== (j.size === 'small' ? 500 : 400)
      })
      .map((j) => `${j.at}  weight ${j.weight} on a ${j.size} display style`)
    expect(
      offenders,
      'One tier, one weight (ADR 050): h1 500; display text at --text-lg or smaller 500; larger 400.'
    ).toEqual([])
  })

  it('has no display class in globals.css at a weight outside the same rule', () => {
    const names = displaySelectors.filter(([s]) => s === '.hj-card-name')
    expect(names).toHaveLength(1)
    expect(names[0][1].get('font-weight')).toBe('500')
  })
})

/**
 * **A display style states its weight; it never inherits one.**
 *
 * Twenty-seven headings and names declared no weight and inherited the body's 300. Under
 * Barlow Condensed, which had no 300 face, the browser rounded that up to 400 — so they
 * rendered at 400 by accident, and nobody had chosen it. One family with a real Light face
 * turned every one of them Light overnight (measured 2026-10-04: all 27 computed 300). The
 * weight a heading renders at must not depend on which faces happen to be loaded.
 */
describe('display weights are declared', () => {
  it('every --font-display style declares its weight', () => {
    const offenders = [
      ...displayStyleObjects()
        .filter((o) => !/fontWeight:/.test(o.body))
        .map((o) => o.at),
      ...displaySelectors.filter(([, props]) => !props.has('font-weight')).map(([s]) => `globals.css ${s}`),
    ]
    expect(offenders, 'These --font-display styles inherit their weight from the body.').toEqual([])
  })
})
