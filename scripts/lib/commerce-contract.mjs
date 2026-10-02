/**
 * The Commerce Elimination Contract, as executable rules.
 *
 * ## Why this file exists at all
 *
 * `COMMERCE-ELIMINATION-CONTRACT.md` states what this website may and may not be. A
 * statement of that kind has exactly one failure mode worth designing against: it is
 * believed. Eleven documents in this repository have described a control that did not
 * exist, and every one of them read as reassuring right up until somebody checked
 * ([ADR 018](../../docs/adr/018-a-claim-about-a-control-is-not-a-control.md)). So the
 * contract is parsed, not read, and this module is the parser and the judge.
 *
 * Nothing here touches the filesystem. `scripts/verify-commerce-contract.mjs` supplies the
 * files; `src/tests/unit/commerce-contract.test.ts` supplies fixtures and mutations. That
 * split is deliberate and this repository has paid for the alternative: a checker fused to
 * its own input can only ever be tested against the tree it happens to be run in, which is
 * the one input nobody chose ([ADR 028](../../docs/adr/028-a-fixture-is-the-input-you-thought-of.md)).
 *
 * ## The distinction the naive scan gets wrong, in both directions
 *
 * "Fail the build if any tracked file contains `shopify`" is the obvious rule and it is
 * unusable here, because of what it says about these four files:
 *
 * | File | Contains `shopify` because | A flat scan calls it |
 * |---|---|---|
 * | `src/app/api/webhooks/shopify/route.ts` | it verifies live Shopify HMAC signatures | a defect — correct |
 * | `docs/adr/009-*.md` | it records a decision taken in 2026-08 | a defect — **wrong** |
 * | `src/tests/unit/browse-only-copy.test.tsx` | it is the check that **forbids** the word | a defect — **wrong, and fatal** |
 * | `docs/browse-only-masterplan.md` | it is the plan to remove Shopify | a defect — **wrong** |
 *
 * The third row is the one that decides the design. A scan that fails on its own negative
 * controls teaches its reader to add exemptions until it is quiet, and a guardrail people
 * route around has negative value — it is the ADR 011 muting pattern applied to a linter.
 *
 * So a finding is a function of **two** things, never one: the identifier, and the
 * **position** it occupies.
 *
 * - `code` — outside comments, in a file that executes. A running reference to a system
 *   that is being removed.
 * - `prose` — comments and Markdown. A *claim* about the system, which is a different kind
 *   of object and expires on a different clock.
 *
 * A comment is prose written inside an executable file, and it is classified as prose
 * rather than as code on purpose: the comment above the webhook route explaining why the
 * route is held back is the most useful sentence in that file, and a rule that deletes it
 * makes the decommission less legible, not more complete.
 *
 * ## The two directions, both enforced — at the grain of the identifier
 *
 * Every reconciliation in this repository runs both ways and this one is no exception.
 * A retained-surface row naming a file that no longer carries the identifier is a
 * **phantom**, and it fails exactly as loudly as an unlisted file does. A register that
 * over-reports is how a decommission looks unfinished forever; a tool that reports
 * phantoms is one whose output people skim
 * ([ADR 024](../../docs/adr/024-a-tool-never-pointed-at-a-known-answer.md)).
 *
 * Until 2026-09-25 "both ways" meant both ways *per file*. `retainedPaths()` reduced every
 * row to its path and nothing ever read the Identifiers column, so a registered file could
 * gain a new commerce identifier in silence, lose one of three and keep claiming all three,
 * or carry a row twice. Two rows had already drifted by the time anybody looked. A
 * reconciliation at a coarser grain than the claim it reconciles is the claim, unchecked —
 * so rows, and the whole-file exemptions in §4, are now compared as **exact sets**: what a
 * row declares must equal what the scan observes where that row is doing the excusing,
 * no more and no less.
 */

// ── Position: where in a file a token sits ─────────────────────────────────

/**
 * Comment syntax per extension.
 *
 * `json` has none, which is why it is absent rather than mapped to an empty pair: a
 * lookup miss is a loud `unknown-language` finding, and a silent default of "no comments"
 * would classify an unfamiliar file's entire contents as code and bury the real answer in
 * false positives.
 *
 * `tsx` and `jsx` are their own language because JSX text is not JavaScript: a `//` in
 * `<a>https://example.com</a>` is page copy, not a comment, and an apostrophe in
 * `<p>Don't</p>` opens no string. `.js`/`.mjs`/`.cjs` are lexed without JSX; the
 * differential test below is what says that is still true of every tracked file.
 */
const LANGUAGES = {
  ts: 'c-style',
  js: 'c-style',
  mjs: 'c-style',
  cjs: 'c-style',
  tsx: 'c-style-jsx',
  jsx: 'c-style-jsx',
  css: 'block-only',
  json: 'none',
  md: 'all-prose',
  yml: 'hash',
  yaml: 'hash',
  example: 'hash',
  sh: 'hash',
  txt: 'all-prose',
}

/** The language rule for a path, or `null` when nothing claims it. */
export function languageOf(relPath) {
  const base = relPath.split('/').pop() ?? relPath
  const ext = base.includes('.') ? base.split('.').pop().toLowerCase() : ''
  return LANGUAGES[ext] ?? null
}

/*
 * Keywords after which an expression — and so a regular-expression literal — may begin.
 *
 * `/` is the one character JavaScript cannot lex without knowing what came before it:
 * after an operand it divides, and after an operator or one of these words it opens a
 * regex whose body may contain `//`, `/*` or a quote. The compiler resolves it from the
 * parse; a lexer has only the previous token, and this is the standard previous-token
 * rule. Where the rule and the grammar could part company (`if (x) /re/.test(y)`, a block
 * followed by a regex statement) the differential test is what would say so.
 */
const KEYWORDS_BEFORE_EXPRESSION = new Set([
  'return',
  'typeof',
  'instanceof',
  'in',
  'of',
  'new',
  'delete',
  'void',
  'throw',
  'case',
  'do',
  'else',
  'yield',
  'await',
  'extends',
])

const IDENT_START = /[A-Za-z_$\u0080-￿]/
const IDENT_PART = /[\w$\u0080-￿]/
const WHITESPACE = /\s/
const DIGIT = /[0-9]/

/**
 * A per-character prose mask for the C family: 1 where a character is inside a comment.
 *
 * ## Why this is a state machine and not a `//` search
 *
 * Its predecessor split each line at the first `//` and opened a block comment at the
 * first `/*`, with no idea whether either sat inside a string. That was documented as a
 * limit whose error "weakens a finding rather than inventing one — the safe direction".
 * **For a prohibition scanner that is the unsafe direction.** Moving a token from `code`
 * to `prose` is how a finding disappears: a comment is free, so a misread comment is a
 * silent exemption. And it was worse than documented. A `'e2e/**'` glob in a string
 * opened a block comment that swallowed the thirty lines after it; fourteen such strings
 * in the tree turned 661 lines of code into prose, and one of them was hiding an
 * `absolute` finding — `graphql.json` in a test's URL literal — that no row can excuse.
 *
 * So strings, template literals (including `${}` nested to any depth, which re-enters
 * code, comments and all), regular-expression literals (with character classes, so
 * `/[/]/` does not end early) and JSX (tags, attribute strings, expression containers and
 * text) are tokens here, and only what the language calls a comment is prose. A
 * `#!` line is prose: it is an instruction to the shell, not code this file runs.
 *
 * ## Why not the TypeScript compiler
 *
 * Because this runs in CI before `pnpm install` could be trusted to have produced one, and
 * a scanner that cannot be installed by the manifest it inspects is the same argument
 * `audit-manifest-integrity.mjs` makes. The compiler is used instead as the *second*
 * implementation: `src/tests/unit/commerce-lexer-differential.test.ts` lexes every tracked
 * JavaScript and TypeScript file both ways and fails on any line where the two disagree —
 * N-version checking, and the measurement
 * [ADR 007](../../docs/adr/007-regex-guardrails-have-unknown-coverage.md) says a
 * hand-written recogniser needs before anybody may state its coverage.
 */
export function proseMaskCStyle(source, { lineComments = true, script = true, jsx = false } = {}) {
  const n = source.length
  const mask = new Uint8Array(n)
  const mark = (from, to) => mask.fill(1, from, Math.min(to, n))

  /*
   * Contexts nest: a template's `${` re-enters code, a JSX attribute's `{` re-enters code,
   * and that code can open another template. A brace inside code only closes its context
   * when it is unmatched *within* that context, which is what `depth` counts.
   */
  const stack = [{ kind: 'code', depth: 0 }]
  let exprAllowed = true // may an expression — a regex, a JSX element — begin here?
  let afterDot = false // `x.return` is a property, not a keyword
  let i = 0

  const lineCommentAt = (at) => {
    const nl = source.indexOf('\n', at)
    const end = nl === -1 ? n : nl
    mark(at, end)
    return end
  }
  const blockCommentAt = (at) => {
    const close = source.indexOf('*/', at + 2)
    const end = close === -1 ? n : close + 2
    mark(at, end)
    return end
  }

  if (script && source.startsWith('#!')) i = lineCommentAt(0)

  while (i < n) {
    const top = stack[stack.length - 1]
    const c = source[i]
    const next = source[i + 1]

    if (top.kind === 'template') {
      if (c === '\\') {
        i += 2
      } else if (c === '`') {
        stack.pop()
        exprAllowed = false
        afterDot = false
        i += 1
      } else if (c === '$' && next === '{') {
        stack.push({ kind: 'code', depth: 0 })
        exprAllowed = true
        i += 2
      } else {
        i += 1
      }
      continue
    }

    // JSX text is page copy: no comments, no strings, no escapes. Only `{` and `<` mean
    // anything here.
    if (top.kind === 'jsx-children') {
      if (c === '{') {
        stack.push({ kind: 'code', depth: 0 })
        exprAllowed = true
        i += 1
      } else if (c === '<' && next === '/') {
        stack.push({ kind: 'jsx-tag', closing: true })
        i += 2
      } else if (c === '<') {
        stack.push({ kind: 'jsx-tag', closing: false })
        i += 1
      } else {
        i += 1
      }
      continue
    }

    if (top.kind === 'jsx-tag') {
      if (c === '/' && next === '/') {
        i = lineCommentAt(i)
      } else if (c === '/' && next === '*') {
        i = blockCommentAt(i)
      } else if (c === '/' && next === '>') {
        stack.pop() // self-closing: the element has no children
        exprAllowed = false
        i += 2
      } else if (c === '>') {
        stack.pop()
        if (top.closing) {
          // `</x>` ends the element whose children we were in.
          if (stack[stack.length - 1]?.kind === 'jsx-children') stack.pop()
          exprAllowed = false
        } else {
          stack.push({ kind: 'jsx-children' })
        }
        i += 1
      } else if (c === '"' || c === "'") {
        // A JSX attribute string has no escapes and may span lines.
        const close = source.indexOf(c, i + 1)
        i = close === -1 ? n : close + 1
      } else if (c === '{') {
        stack.push({ kind: 'code', depth: 0 })
        exprAllowed = true
        i += 1
      } else {
        i += 1
      }
      continue
    }

    // ── code
    if (WHITESPACE.test(c)) {
      i += 1
      continue
    }
    if (c === '/' && next === '*') {
      i = blockCommentAt(i)
      continue
    }
    if (lineComments && c === '/' && next === '/') {
      i = lineCommentAt(i)
      continue
    }

    if (c === '"' || c === "'") {
      // Ends at its quote or, unterminated, at the line break — where the compiler's own
      // error recovery ends it, so one stray quote cannot turn a file into a string.
      let j = i + 1
      while (j < n) {
        const d = source[j]
        if (d === '\\') {
          j += 2
          continue
        }
        if (d === c) {
          j += 1
          break
        }
        if (d === '\n') break
        j += 1
      }
      i = j
      exprAllowed = false
      afterDot = false
      continue
    }

    if (!script) {
      // CSS: strings and block comments are the whole grammar that matters here.
      i += 1
      continue
    }

    if (c === '`') {
      stack.push({ kind: 'template' })
      i += 1
      continue
    }

    if (c === '/') {
      if (exprAllowed) {
        let j = i + 1
        let inClass = false
        while (j < n) {
          const d = source[j]
          if (d === '\n') break
          if (d === '\\') {
            j += 2
            continue
          }
          if (inClass) {
            if (d === ']') inClass = false
          } else if (d === '[') {
            inClass = true
          } else if (d === '/') {
            j += 1
            break
          }
          j += 1
        }
        while (j < n && IDENT_PART.test(source[j])) j += 1 // flags
        i = j
        exprAllowed = false
        afterDot = false
        continue
      }
      i += 1 // division
      exprAllowed = true
      afterDot = false
      continue
    }

    if (jsx && c === '<' && exprAllowed && next !== undefined && /[A-Za-z_$>]/.test(next)) {
      stack.push({ kind: 'jsx-tag', closing: false })
      i += 1
      continue
    }

    if (c === '{') {
      top.depth += 1
      exprAllowed = true
      afterDot = false
      i += 1
      continue
    }
    if (c === '}') {
      if (top.depth > 0) top.depth -= 1
      else if (stack.length > 1) stack.pop() // back to the template or JSX that opened us
      exprAllowed = false
      afterDot = false
      i += 1
      continue
    }

    if (IDENT_START.test(c) || (c === '#' && next !== undefined && IDENT_START.test(next))) {
      let j = i + 1
      while (j < n && IDENT_PART.test(source[j])) j += 1
      exprAllowed = !afterDot && KEYWORDS_BEFORE_EXPRESSION.has(source.slice(i, j))
      afterDot = false
      i = j
      continue
    }

    if (DIGIT.test(c) || (c === '.' && next !== undefined && DIGIT.test(next))) {
      let j = i + 1
      while (j < n && /[\w.]/.test(source[j])) j += 1
      i = j
      exprAllowed = false
      afterDot = false
      continue
    }

    if (c === ')' || c === ']') {
      exprAllowed = false
      afterDot = false
      i += 1
      continue
    }
    // `x++ / 2` divides; so does TypeScript's non-null `total! / count`.
    if ((c === '+' || c === '-') && next === c) {
      exprAllowed = false
      afterDot = false
      i += 2
      continue
    }
    if (c === '!' && next !== '=' && !exprAllowed) {
      i += 1
      continue
    }
    if (c === '.') {
      afterDot = next !== '.'
      exprAllowed = true
      i += 1
      continue
    }
    if (c === '?' && next === '.' && !DIGIT.test(source[i + 2] ?? '')) {
      afterDot = true
      exprAllowed = true
      i += 2
      continue
    }

    exprAllowed = true
    afterDot = false
    i += 1
  }
  return mask
}

/**
 * A per-character prose mask for the `#` family: YAML, shell and dotenv examples.
 *
 * A `#` is a comment only outside quotes and only at the start of a word — at the start of
 * a line or after whitespace — which is where YAML and POSIX shell both start one.
 * `echo "## Summary" >> "$GITHUB_STEP_SUMMARY"` is code in all four workflows that carry
 * it, and its predecessor read every one of them as a comment that began mid-string.
 *
 * A quote opens a quoted span only at the start of a token (line start, whitespace, or
 * after `= : [ { , ( $`), because YAML does not quote from the middle of a plain scalar and
 * `- don't deploy` would otherwise swallow the rest of the file. Spans persist across
 * lines: YAML flow scalars and shell strings both may. A misread here errs toward `code`,
 * which is loud, rather than toward `prose`, which is silent.
 */
export function proseMaskHash(source) {
  const n = source.length
  const mask = new Uint8Array(n)
  let quote = null
  let i = 0
  while (i < n) {
    const c = source[i]
    const prev = i === 0 ? '\n' : source[i - 1]
    if (quote) {
      if (quote === '"' && c === '\\') {
        i += 2
        continue
      }
      if (quote === "'" && c === "'" && source[i + 1] === "'") {
        i += 2 // YAML's escaped single quote
        continue
      }
      if (c === quote) quote = null
      i += 1
      continue
    }
    if (c === '#' && WHITESPACE.test(prev)) {
      const nl = source.indexOf('\n', i)
      const end = nl === -1 ? n : nl
      mask.fill(1, i, end)
      i = end
      continue
    }
    if ((c === '"' || c === "'") && /[\s=:[{,($]/.test(prev)) quote = c
    i += 1
  }
  return mask
}

/**
 * Lines of `source`, each split into its code half and its prose half by `mask`.
 *
 * Copied a run at a time rather than a character at a time: a line changes position at most
 * a few times, and this runs over every tracked file on every merge.
 */
export function linesFromMask(source, mask) {
  const lines = source.split('\n')
  const code = new Array(lines.length)
  const prose = new Array(lines.length)
  let offset = 0
  for (let li = 0; li < lines.length; li += 1) {
    const text = lines[li]
    let c = ''
    let p = ''
    for (let k = 0; k < text.length; ) {
      const inProse = mask[offset + k] === 1
      let end = k + 1
      while (end < text.length && (mask[offset + end] === 1) === inProse) end += 1
      if (inProse) p += text.slice(k, end)
      else c += text.slice(k, end)
      k = end
    }
    code[li] = c
    prose[li] = p
    offset += text.length + 1
  }
  return { code, prose }
}

/**
 * Split a source file into its code half and its prose half, preserving line numbers.
 *
 * Returns two arrays the same length as the input's lines, so a finding can name the line
 * it came from without a second pass. A line that is part code and part comment appears in
 * both, truncated to its own half — which is what makes
 * `const x = 1 // shopify` a prose finding rather than a code one, and
 * `const u = 'https://shop.myshopify.com'` a code finding rather than a prose one.
 *
 * The lexers above are hand-written, and a hand-written lexer's coverage is unknown until
 * something measures it ([ADR 007](../../docs/adr/007-regex-guardrails-have-unknown-coverage.md)).
 * `src/tests/unit/commerce-lexer-differential.test.ts` is that measurement for the C family:
 * it re-derives every comment range with the TypeScript compiler and fails on any line where
 * the two implementations disagree. The `#` family has no second implementation in this
 * repository and is asserted by fixtures only.
 */
export function splitPositions(source, language) {
  if (language === 'all-prose' || language === 'none') {
    const lines = source.split('\n')
    const empty = new Array(lines.length).fill('')
    return language === 'all-prose' ? { code: empty, prose: lines } : { code: lines, prose: empty }
  }
  if (language === 'hash') {
    return linesFromMask(source, proseMaskHash(source))
  }
  if (language === 'block-only') {
    return linesFromMask(source, proseMaskCStyle(source, { lineComments: false, script: false }))
  }
  return linesFromMask(
    source,
    proseMaskCStyle(source, { lineComments: true, script: true, jsx: language === 'c-style-jsx' })
  )
}

// ── The contract document, parsed ──────────────────────────────────────────

/**
 * Read one fenced block out of the contract.
 *
 * The blocks are delimited by HTML comments — `<!-- contract:identifiers -->` … `<!-- /contract:identifiers -->`
 * — rather than by heading text, so the prose around them can be rewritten freely without
 * changing what the parser sees. A heading is a sentence somebody will improve; an anchor
 * is a key.
 *
 * Throws on a missing block rather than returning empty. An absent section that parses to
 * `[]` makes every rule keyed on it vacuously satisfied, which is the exact shape
 * [ADR 020](../../docs/adr/020-a-test-that-cannot-fail-is-documentation.md) names: the
 * check runs, reports success, and covers nothing.
 */
export function section(markdown, name) {
  const open = `<!-- contract:${name} -->`
  const close = `<!-- /contract:${name} -->`
  const from = markdown.indexOf(open)
  const to = markdown.indexOf(close)
  if (from === -1 || to === -1 || to < from) {
    throw new Error(
      `COMMERCE-ELIMINATION-CONTRACT.md has no \`${name}\` section. ` +
        `Expected the anchors ${open} … ${close}. A rule whose section is missing would ` +
        `otherwise be enforced against an empty list, which passes and checks nothing.`
    )
  }
  return markdown.slice(from + open.length, to)
}

/**
 * Rows of every GitHub-flavoured Markdown table in a block, as arrays of trimmed cells.
 *
 * Handles **several tables in one section**, which the register needs: its rows are grouped
 * by workstream under sub-headings, and a parser that only skipped the first header row
 * would read every subsequent header as data. A row named `Path` with an owning system of
 * `Owning system` is the kind of entry that then sits in a register for months looking
 * plausible.
 *
 * A header is recognised structurally — a table row whose next table row is a separator —
 * rather than by its text, so renaming a column cannot silently turn a header into a row.
 */
export function tableRows(block) {
  const lines = block.split('\n')
  const isTable = (l) => l.trim().startsWith('|')
  const isSeparator = (l) =>
    isTable(l) &&
    l
      .trim()
      .replace(/^\||\|$/g, '')
      .split('|')
      .every((c) => /^:?-{3,}:?$/.test(c.trim()))

  /*
   * Split on *unescaped* pipes, then unescape.
   *
   * GitHub-flavoured Markdown escapes a literal pipe inside a cell as `\|`, and this
   * contract's cells are regular expressions — `\bcart(Create\|LinesAdd)\b` is one cell,
   * not two. A naive `split('|')` tears it into fragments and the first one compiles: the
   * scanner then runs a silently narrower pattern than the document shows, which is the
   * worst failure available to a checker. It does not error; it under-reports.
   */
  const cells = (l) => {
    const t = l.trim()
    const inner = t.slice(1, t.endsWith('|') && !t.endsWith('\\|') ? -1 : undefined)
    const out = []
    let cur = ''
    for (let i = 0; i < inner.length; i += 1) {
      if (inner[i] === '\\' && inner[i + 1] === '|') {
        cur += '|'
        i += 1
        continue
      }
      if (inner[i] === '|') {
        out.push(cur)
        cur = ''
        continue
      }
      cur += inner[i]
    }
    out.push(cur)
    return out.map((c) => c.trim())
  }

  const rows = []
  for (let i = 0; i < lines.length; i += 1) {
    if (!isTable(lines[i]) || isSeparator(lines[i])) continue
    if (i + 1 < lines.length && isSeparator(lines[i + 1])) {
      i += 1 // this row is a header; skip it and its separator
      continue
    }
    rows.push(cells(lines[i]))
  }
  return rows
}

/** Strip the backticks this repository writes identifiers in. */
export const unticked = (s) => s.replace(/^`|`$/g, '')

/** A space- or comma-separated list of identifier ids, backticks optional. */
const idList = (cell) =>
  (cell ?? '')
    .split(/[,\s]+/)
    .map((s) => s.replace(/`/g, ''))
    .filter(Boolean)

/**
 * The §4 `Carries` cell.
 *
 * Three states and they are not interchangeable. `—` is a *declaration* that the file needs
 * the exemption for nothing; an empty cell is the *absence* of a declaration. The first is
 * checked like any other claim; the second, on a row that must declare, is a finding.
 */
export function parseCarries(cell) {
  const raw = (cell ?? '').trim()
  if (raw === '') return { declared: false, ids: [], raw }
  if (raw === '—' || raw === '-') return { declared: true, ids: [], raw }
  return { declared: true, ids: idList(raw), raw }
}

/** The decommission's phases, in the only order they may be declared. */
export const PHASES = ['active', 'complete']

const ROUTE_WILDCARD = /\/:[A-Za-z_][A-Za-z0-9_]*\*$/

/**
 * The static prefix of a §7 `:path*` family, or `null` for an exact route.
 *
 * Here rather than in either reader of §7, because there are two — the E2E route matrix and
 * the live-surface probe — and each needs to know which rows are families.
 */
export function wildcardPrefix(route) {
  return ROUTE_WILDCARD.test(route) ? route.replace(ROUTE_WILDCARD, '') : null
}

/**
 * Parse the whole contract into the shape the rules below consume.
 *
 * Every list is asserted non-empty by `src/tests/unit/commerce-contract.test.ts`, for the
 * reason `section()` throws: the failure mode of a document-driven checker is an empty
 * document, and it is indistinguishable from a clean repository.
 */
export function parseContract(markdown) {
  const identifiers = tableRows(section(markdown, 'identifiers')).map((cells) => ({
    id: unticked(cells[0]),
    pattern: new RegExp(unticked(cells[1]), 'i'),
    source: unticked(cells[1]),
    scope: cells[2],
    why: cells[3] ?? '',
  }))

  /*
   * `Carries` is the *last* column on purpose. The `commerce-boundary` sentinel in
   * `scripts/lib/sentinels.mjs` anchors on the text of a row's first two cells, and a
   * column inserted between them would make that anchor stop occurring — reported as
   * `unapplicable`, which is honest, but a sentinel nobody can apply is a control nobody
   * is exercising.
   */
  const positions = tableRows(section(markdown, 'positions')).map((cells) => ({
    glob: unticked(cells[0]),
    klass: cells[1],
    why: cells[2] ?? '',
    carries: parseCarries(cells[3]),
  }))

  const packages = tableRows(section(markdown, 'packages')).map((cells) => ({
    pattern: new RegExp(unticked(cells[0]), 'i'),
    source: unticked(cells[0]),
    why: cells[1] ?? '',
  }))

  const routesApproved = tableRows(section(markdown, 'routes-approved')).map((cells) => ({
    route: unticked(cells[0]),
    kind: cells[1],
    status: Number(cells[2]),
  }))

  const routesForbidden = tableRows(section(markdown, 'routes-forbidden')).map((cells) => ({
    route: unticked(cells[0]),
    status: Number(cells[1]),
    location: cells[2] === '—' ? null : unticked(cells[2]),
    why: cells[3] ?? '',
  }))

  const contentForbidden = tableRows(section(markdown, 'content-forbidden')).map((cells) =>
    unticked(cells[0])
  )

  const owners = tableRows(section(markdown, 'owners')).map((cells) => ({
    domain: cells[0],
    owner: unticked(cells[1]),
    accountableFor: cells[2] ?? '',
  }))

  const state = Object.fromEntries(
    tableRows(section(markdown, 'state')).map((cells) => [unticked(cells[0]), unticked(cells[1] ?? '')])
  )

  return {
    identifiers,
    positions,
    packages,
    routesApproved,
    routesForbidden,
    contentForbidden,
    owners,
    state,
  }
}

/**
 * The Commerce Dependency Register, parsed.
 *
 * One row per artefact that still references commerce machinery, with the eight facts a
 * removal needs: where it is, what it says, which system owns it, what makes it run, what
 * data crosses it, what has to happen, what proves it happened, and which workstream is
 * holding it. Vague rows are the failure this shape refuses — "remove checkout code" names
 * no file, assigns no owner and cannot be checked off, so it stays open forever while
 * looking like progress.
 *
 * `Identifiers` is a claim like any other cell, and `evaluate()` holds it to the scan as an
 * exact set. Nothing here is derived from the filesystem — that is the point, and the
 * reconciliation is what makes the document trustworthy rather than merely present.
 */
export function parseRegister(markdown) {
  return tableRows(section(markdown, 'register')).map((cells) => ({
    path: unticked(cells[0]),
    identifiers: idList(cells[1]),
    system: cells[2] ?? '',
    trigger: cells[3] ?? '',
    data: cells[4] ?? '',
    action: cells[5] ?? '',
    provenBy: unticked(cells[6] ?? ''),
    workstream: cells[7] ?? '',
  }))
}

/**
 * The paths the register accounts for.
 *
 * A convenience for reporting, and **no longer what `evaluate()` reconciles against**: a
 * set of paths is exactly the grain at which two rows drifted unnoticed. Pass the rows.
 */
export function retainedPaths(register) {
  return new Set(register.map((r) => r.path))
}

// ── Position classes ───────────────────────────────────────────────────────

/**
 * Glob → RegExp, for the small subset of glob this contract uses: `**`, `*`, and literal
 * text. Deliberately not a glob library — a dependency added to a decommission whose whole
 * point is removing dependencies would be an odd first move, and the grammar is three
 * cases wide.
 */
export function globToRegExp(glob) {
  let out = '^'
  for (let i = 0; i < glob.length; i += 1) {
    const c = glob[i]
    if (c === '*' && glob[i + 1] === '*') {
      out += '.*'
      i += 1
      if (glob[i + 1] === '/') i += 1
      continue
    }
    if (c === '*') {
      out += '[^/]*'
      continue
    }
    out += c.replace(/[.+?^${}()|[\]\\]/g, '\\$&')
  }
  return new RegExp(out + '$')
}

/**
 * The index of the §4 row that decides a path's class, or `-1` for the default.
 *
 * **Last match wins**, so the table reads as a series of increasingly specific overrides
 * and a reader can see the exception below the rule it excepts. First-match-wins would put
 * every exception above its rule and invert the document's legibility. The index rather
 * than the class is returned because an exemption is granted by a *row*, and it is the row
 * whose `Carries` cell has to account for what the exemption covers.
 */
export function classifyIndex(relPath, positions) {
  let at = -1
  positions.forEach((p, i) => {
    if (globToRegExp(p.glob).test(relPath)) at = i
  })
  return at
}

/** Which class a path belongs to. See `classifyIndex()` for why last match wins. */
export function classify(relPath, positions) {
  const at = classifyIndex(relPath, positions)
  return at === -1 ? 'executable' : positions[at].klass
}

// ── The rules ──────────────────────────────────────────────────────────────

/**
 * Every occurrence in one file, tagged with the position it sits in.
 *
 * Occurrences, not verdicts. Whether an occurrence is a *defect* depends on the file's
 * class and on the register, and those are decisions the caller makes with the whole tree
 * in hand. A per-file function returning verdicts could not express "this path is
 * registered for an identifier it no longer carries", which is half the control and the
 * half that keeps the register honest.
 */
export function occurrences({ path: relPath, source }, contract) {
  const language = languageOf(relPath)
  if (language === null) return []

  const { code, prose } = splitPositions(source, language)
  const found = []
  for (const ident of contract.identifiers) {
    for (const [position, lines] of [
      ['code', code],
      ['prose', prose],
    ]) {
      for (let i = 0; i < lines.length; i += 1) {
        // `lastIndex` is not shared here — the patterns are built without /g — but the
        // test is per line on purpose: a finding names a line, and a whole-file match
        // would report every hit at line 0, which is a finding nobody can act on.
        if (ident.pattern.test(lines[i])) {
          found.push({ id: ident.id, scope: ident.scope, position, path: relPath, line: i + 1 })
        }
      }
    }
  }
  return found
}

/**
 * Credential values, matched against the raw text of any file.
 *
 * No lexer, no language and no class, because the `value` scope admits no exemption and a
 * rule that needs to know a file's comment syntax before it will look at the file is a rule
 * with an exemption for every syntax it does not know. Its predecessor ran after the
 * `excluded` short-circuit, so `pnpm-lock.yaml`, `.gitignore` and `.prettierrc` — three
 * files that could each hold a pasted token — had never been read for one.
 */
export function credentialValues({ path: relPath, source }, contract) {
  const found = []
  const lines = source.split('\n')
  for (const ident of contract.identifiers) {
    if (ident.scope !== 'value') continue
    for (let i = 0; i < lines.length; i += 1) {
      if (ident.pattern.test(lines[i])) {
        found.push({ id: ident.id, scope: ident.scope, position: 'raw', path: relPath, line: i + 1 })
      }
    }
  }
  return found
}

/**
 * The five position classes, and what each one buys.
 *
 * A class is an answer to one question: *if this file still says `shopify` a year from
 * now, is that a defect?* The classes exist because the honest answer differs by file, and
 * collapsing them is what makes a scanner either useless or ignored.
 *
 * | Class | Says | Still true in a year? |
 * |---|---|---|
 * | `excluded` | not text, or not ours to scan | n/a — and each exclusion must match something |
 * | `historical` | a dated record; never edited to match the present | yes, correctly |
 * | `specification` | the document a check parses | yes, provided a check still parses it |
 * | `negative-control` | the check that forbids the thing | yes, necessarily |
 * | `superseded` | describes a system being dismantled; carries a dated banner | yes, and the banner says so |
 * | `executable` (default) | everything else | **no** — needs a register row or a deletion |
 *
 * `executable` being the default is the load-bearing choice. A new file is a defect until
 * somebody classifies it, which is [ADR 019](../../docs/adr/019-an-unclassified-entry-is-an-unverified-one.md)'s
 * rule exactly: unexamined is not a third state. The alternative — an allowlist of
 * forbidden places — fails open, and a control that fails open is the one this repository
 * has now shipped four times.
 */
export const CLASSES = [
  'excluded',
  'historical',
  'specification',
  'negative-control',
  'superseded',
  'executable',
]

/**
 * The classes whose exemption covers a whole file, and so must say what it covers.
 *
 * `historical` is a whole-file exemption too, and is deliberately not here: a dated record
 * is excused for being dated, not for what it names, and an ADR that gains a mention of a
 * new identifier is doing its job. A negative control or a specification is excused for
 * *naming the forbidden thing*, which makes the set of things it names the claim — and a
 * claim the scan can check is one it must.
 */
export const CARRIES_REQUIRED = new Set(['negative-control', 'specification'])

/**
 * A dated supersession banner, in the forms this repository already writes.
 *
 * Matched against the head of the file rather than the whole of it, because the point of a
 * banner is that a reader meets it before they act on anything below. A supersession note
 * in a footer is a note nobody reaches.
 *
 * The pattern accepts `Superseded` and `Historical` and requires a date beside it. Per
 * [ADR 007](../../docs/adr/007-regex-guardrails-have-unknown-coverage.md) its coverage is
 * unknown in the abstract; what makes it meaningful here is that the contract names every
 * file this is applied to, so the set is finite and each member is checked.
 */
export const SUPERSESSION_BANNER = /\b(superseded|historical)\b[^\n]*\b20\d{2}-\d{2}(-\d{2})?\b/i
export const BANNER_HEAD_LINES = 15

/** Evidence that a file classified `negative-control` actually controls something. */
export const ASSERTION_EVIDENCE = /\b(expect|assert|throw new Error|toThrow|findings\.push)\b/

/**
 * Whether a file asserts, judged on its **code** only.
 *
 * The strongest exemption in the contract used to be earned by the word "expect" anywhere
 * in the file — including in a comment explaining what a future test would expect. A
 * condition a sentence can satisfy is a condition nobody has to meet.
 */
export function hasAssertion(source, language) {
  if (language === null || language === 'all-prose') return false
  return splitPositions(source, language).code.some((l) => ASSERTION_EVIDENCE.test(l))
}

/**
 * What stands between one occurrence and a finding, as a single word.
 *
 * - `absolute` — an absolute prohibition in running code. A finding, full stop.
 * - `free` — a comment inside a code file (Rule 3). Nothing to excuse.
 * - `class` — excused by the file's §4 class: `historical`, `negative-control`,
 *   `specification`. For the last two the row's `Carries` must name it.
 * - `superseded` — excused by a `superseded` class, which is earned by its banner.
 * - `register` — excused by a register row, **or a finding if there is none**. These are the
 *   hits a row's Identifiers cell must equal: exactly the ones that would otherwise raise
 *   `unregistered-commerce-reference` or `undeclared-commerce-document`.
 *
 * `value` hits never reach here; `credentialValues()` reports them for every file.
 */
export function disposition(hit, klass, language) {
  const proseOnlyFile = language === 'all-prose'
  const exemptByClass =
    klass === 'historical' || klass === 'negative-control' || klass === 'specification'

  // ── Rule 3. A comment inside a code file is free.
  //
  // Deliberate, and the most likely part of this to be argued with. The comment above
  // `src/app/api/webhooks/shopify/route.ts` explaining why the route is still standing
  // is the single most useful sentence in that file, and a rule that deletes it makes
  // the decommission harder to finish rather than closer to done. Prose is a claim,
  // and claims expire on the register's clock, not the linter's.
  if (hit.position === 'prose' && !proseOnlyFile) return 'free'

  // A class exemption excuses any hit, absolute ones included: a negative control has to
  // name what it forbids. It is not a blank cheque — the row's `Carries` must name the id.
  if (exemptByClass) return 'class'

  // ── Rule 2. An absolute prohibition in running code is never retained by the register.
  if (hit.scope === 'absolute' && !proseOnlyFile) return 'absolute'

  // ── Rule 4. A superseded document may say anything, because its banner has
  //           already told the reader not to act on it. The banner is checked below.
  if (klass === 'superseded') return 'superseded'

  // ── Rule 5. Everything else needs a row in the register.
  return 'register'
}

/**
 * `a − b` for two collections of ids, sorted, as an array.
 *
 * `b` is materialised once, up front. Either argument may be a `Map` key iterator, and an
 * iterator rebuilt into a set inside the filter callback is exhausted after the first
 * element — every later id then reads as absent from `b`. The first draft of this line did
 * exactly that and reported thirty-nine rows overdeclared on a register that was right.
 */
const minus = (a, b) => {
  const drop = new Set(b)
  return [...new Set(a)].filter((x) => !drop.has(x)).sort()
}

/**
 * Judge the whole tree in one pass.
 *
 * @param {object} input
 * @param {{path: string, source: string}[]} input.files  every tracked text file
 * @param {object} input.contract                          parsed contract
 * @param {object[]} input.register                        parsed register rows
 */
export function evaluate({ files, contract, register = [] }) {
  const findings = []
  const classCounts = Object.fromEntries(CLASSES.map((c) => [c, 0]))
  const matchedRows = new Set()
  const specifications = new Set()
  const knownIds = new Set(contract.identifiers.map((i) => i.id))

  /** path → id → first line, for every `register`-disposition hit, registered or not. */
  const eligible = new Map()
  /** §4 row index → id → paths, for every `class`-disposition hit. */
  const exempted = new Map()
  /** Every non-value hit, with its verdict — the raw material of `--summary`. */
  const observations = []

  const rowsByPath = new Map()
  for (const row of register) {
    if (!rowsByPath.has(row.path)) rowsByPath.set(row.path, [])
    rowsByPath.get(row.path).push(row)
  }

  // Compiled once, not once per file per row. One pass per file then answers both
  // questions: which rows match (for `classification-matches-nothing`) and which decides
  // the class — the last match, as `classifyIndex()` states.
  const globs = contract.positions.map((p) => globToRegExp(p.glob))

  for (const file of files) {
    let at = -1
    globs.forEach((re, i) => {
      if (!re.test(file.path)) return
      matchedRows.add(i)
      at = i
    })
    const klass = at === -1 ? 'executable' : contract.positions[at].klass
    classCounts[klass] = (classCounts[klass] ?? 0) + 1

    // ── Rule 1. A credential value is a leak in any position, in any class — `excluded`
    //            included, and files with no declared language included. It runs before
    //            anything that could `continue`.
    for (const hit of credentialValues(file, contract)) {
      findings.push({
        code: 'credential-value-committed',
        path: file.path,
        line: hit.line,
        id: hit.id,
        detail:
          `this looks like a live credential rather than a credential *name*. No class ` +
          `and no register row excuses it. Treat it as disclosed: rotate it in the ` +
          `originating console first, then remove it from the file and from history.`,
      })
    }

    if (klass === 'excluded') continue

    const language = languageOf(file.path)
    if (language === null) {
      findings.push({
        code: 'unknown-language',
        path: file.path,
        line: 0,
        detail:
          `no comment syntax is declared for this extension, so the scanner cannot tell ` +
          `code from prose and would classify the whole file as one or the other by ` +
          `accident. Declare it in LANGUAGES, or exclude the path in the contract.`,
      })
      continue
    }

    const hits = occurrences(file, contract).filter((h) => h.scope !== 'value')
    const isRegistered = rowsByPath.has(file.path)

    for (const hit of hits) {
      const verdict = disposition(hit, klass, language)
      observations.push({ ...hit, klass, disposition: verdict })

      if (verdict === 'absolute') {
        findings.push({
          code: 'absolute-prohibition-in-code',
          path: file.path,
          line: hit.line,
          id: hit.id,
          detail:
            `\`${hit.id}\` is an absolute prohibition: no workstream retains it, and a ` +
            `register row cannot excuse it. This is cart, checkout, payment, customer or ` +
            `discount machinery, and the contract's whole subject is that none of it exists.`,
        })
        continue
      }

      if (verdict === 'class') {
        if (!exempted.has(at)) exempted.set(at, new Map())
        const byId = exempted.get(at)
        if (!byId.has(hit.id)) byId.set(hit.id, new Set())
        byId.get(hit.id).add(file.path)
        continue
      }

      if (verdict !== 'register') continue

      if (!eligible.has(file.path)) eligible.set(file.path, new Map())
      const seen = eligible.get(file.path)
      if (!seen.has(hit.id)) seen.set(hit.id, hit.line)

      // A registered file is reconciled below, as a set, against its row. An unregistered
      // one is reported here, per line, because the line is what somebody has to go and
      // delete.
      if (isRegistered) continue

      const proseOnlyFile = language === 'all-prose'
      findings.push({
        code: proseOnlyFile ? 'undeclared-commerce-document' : 'unregistered-commerce-reference',
        path: file.path,
        line: hit.line,
        id: hit.id,
        detail: proseOnlyFile
          ? `this document describes \`${hit.id}\` as part of a live system and is neither ` +
            `classified in the contract nor listed in the register. An obsolete runbook ` +
            `that reads as current is the failure mode this rule exists for: the code can ` +
            `be gone while the instructions still tell somebody to go and use it.`
          : `executable code references \`${hit.id}\` and this path has no row in the ` +
            `Commerce Dependency Register. Either the reference is new — delete it — or ` +
            `the register is incomplete, which is the same defect one level up.`,
      })
    }

    // ── Rule 6. A superseded document must actually carry its banner.
    if (klass === 'superseded' && hits.length > 0) {
      const head = file.source.split('\n').slice(0, BANNER_HEAD_LINES).join('\n')
      if (!SUPERSESSION_BANNER.test(head)) {
        findings.push({
          code: 'superseded-without-banner',
          path: file.path,
          line: 1,
          detail:
            `classified \`superseded\` and carries commerce identifiers, but the first ` +
            `${BANNER_HEAD_LINES} lines contain no dated supersession banner. The class is ` +
            `what exempts this file from every rule above; the banner is what earns the ` +
            `class. Without it the exemption is a silent one.`,
        })
      }
    }

    // ── Rule 7a. A specification must be read by something.
    //
    // The class exists because a document that *names* every forbidden identifier cannot
    // also assert — it is the input a check reads, not the check. That is a real
    // distinction and it needs a real earning condition, or `specification` becomes the
    // exemption anybody reaches for. The condition is the honest one: something has to
    // parse it. A specification nothing reads is documentation, which is ADR 018's sentence
    // pointed at the contract rather than at a control.
    if (klass === 'specification') specifications.add(file.path)

    // ── Rule 7b. A negative control must control something — in its code.
    if (klass === 'negative-control' && !hasAssertion(file.source, language)) {
      findings.push({
        code: 'negative-control-asserts-nothing',
        path: file.path,
        line: 1,
        detail:
          `classified \`negative-control\` — the class that lets a file name what it ` +
          `forbids — but nothing in its code asserts, throws or records a finding. A ` +
          `comment that mentions an assertion is not one. That is the strongest ` +
          `exemption in this contract granted to a file that checks nothing.`,
      })
    }
  }

  // ── Rule 7a, concluded. Every specification is named in some other file's code.
  //
  // `code` position rather than anywhere, deliberately: a document mentioned in a comment
  // is cited, and a document named in an import or a path constant is *read*. Only the
  // second keeps a specification honest, because only the second breaks when the
  // specification changes shape.
  for (const spec of specifications) {
    // `some`, not `filter`: one reader is the whole condition, and lexing the rest of the
    // tree to count more of them was half the cost of this function.
    const read = files.some((f) => {
      if (f.path === spec) return false
      const lang = languageOf(f.path)
      if (lang === null || lang === 'all-prose') return false
      return splitPositions(f.source, lang).code.some((l) => l.includes(spec))
    })
    if (!read) {
      findings.push({
        code: 'specification-nothing-reads',
        path: spec,
        line: 0,
        detail:
          `classified \`specification\` — the class for a document a check parses — and no ` +
          `tracked file names this path in code. Either the parser was renamed, in which ` +
          `case this document is now unenforced prose, or the class is wrong.`,
      })
    }
  }

  // ── Rule 8. The register, reconciled row by row as exact sets.
  //
  // "Eligible" is defined once, in `disposition()`: the hits that would raise
  // `unregistered-commerce-reference` or `undeclared-commerce-document` if the row were
  // not there. A row's Identifiers cell is a claim about exactly that set. Declaring
  // less lets an identifier arrive in a registered file with nobody deciding it should;
  // declaring more is a phantom at the grain of one identifier — the row reads as
  // outstanding work for something already done.
  const scanned = new Set(files.map((f) => f.path))
  for (const [relPath, rows] of rowsByPath) {
    if (rows.length > 1) {
      findings.push({
        code: 'register-duplicate-path',
        path: relPath,
        line: 0,
        detail:
          `the register carries ${rows.length} rows for this path. A path-keyed set merges ` +
          `them silently, so one row's identifiers, owner and action shadow the other's and ` +
          `nobody can say which judgement is in force. One path, one row.`,
      })
    }
    const declared = rows.flatMap((r) => r.identifiers)
    const unknown = minus(declared, knownIds)
    if (unknown.length > 0) {
      findings.push({
        code: 'register-unknown-identifier',
        path: relPath,
        line: 0,
        id: unknown.join(' '),
        detail:
          `the row declares ${unknown.map((u) => `\`${u}\``).join(', ')}, which §3 does not ` +
          `define. An identifier the scan cannot look for is a claim nothing can check — ` +
          `a typo here reads exactly like a real declaration.`,
      })
    }

    if (!scanned.has(relPath)) {
      findings.push({
        code: 'register-names-missing-file',
        path: relPath,
        line: 0,
        detail:
          `the register retains this path and the scan never saw it. If the file was ` +
          `deleted the row is complete — close it with its evidence rather than leaving ` +
          `it to read as outstanding work.`,
      })
      continue
    }

    const observed = eligible.get(relPath) ?? new Map()
    if (observed.size === 0) {
      findings.push({
        code: 'register-row-is-spent',
        path: relPath,
        line: 0,
        detail:
          `the register retains this path for commerce identifiers it no longer carries ` +
          `where the rules look. The work is done and the row is not. A register that ` +
          `over-reports is one nobody finishes reading.`,
      })
      continue
    }

    const undeclared = minus(observed.keys(), declared)
    if (undeclared.length > 0) {
      findings.push({
        code: 'register-identifiers-undeclared',
        path: relPath,
        line: observed.get(undeclared[0]),
        id: undeclared.join(' '),
        detail:
          `the file carries ${undeclared
            .map((u) => `\`${u}\` (first at line ${observed.get(u)})`)
            .join(', ')} and its row does not declare ${undeclared.length === 1 ? 'it' : 'them'}. ` +
          `A registered file is not a licence for any identifier: either the reference is ` +
          `new — delete it — or add it to the row, which is a decision somebody signs.`,
      })
    }
    const overdeclared = minus(
      declared.filter((d) => knownIds.has(d)),
      observed.keys()
    )
    if (overdeclared.length > 0) {
      findings.push({
        code: 'register-identifiers-overdeclared',
        path: relPath,
        line: 0,
        id: overdeclared.join(' '),
        detail:
          `the row declares ${overdeclared.map((o) => `\`${o}\``).join(', ')} and the file ` +
          `no longer carries ${overdeclared.length === 1 ? 'it' : 'them'} where the rules ` +
          `look. That part of the work is done; remove ${overdeclared.length === 1 ? 'it' : 'them'} ` +
          `from the row so the register stops describing it as outstanding.`,
      })
    }
  }

  // ── Rule 9. Every classification glob must classify something.
  //
  // The phantom rule applied to the contract itself. A glob matching nothing is either a
  // typo — in which case the files it was meant to cover are silently unclassified — or a
  // rule that outlived its subject, which is ADR 035 exactly.
  contract.positions.forEach((p, i) => {
    if (!matchedRows.has(i)) {
      findings.push({
        code: 'classification-matches-nothing',
        path: 'COMMERCE-ELIMINATION-CONTRACT.md',
        line: 0,
        detail:
          `the glob \`${p.glob}\` (class \`${p.klass}\`) matches no tracked file. Either ` +
          `it is misspelled, and the files it was meant to classify are silently falling ` +
          `through to \`executable\`, or its subject is gone and the row should go with it.`,
      })
    }
  })

  // ── Rule 10. A whole-file exemption says what it covers, exactly.
  //
  // `negative-control` and `specification` let a file name any identifier anywhere — the
  // scanner's widest door, recorded as known limit (3) in `docs/controls.json` until this
  // rule closed it. The row's `Carries` cell now states the identifiers the exemption is
  // actually doing work for (the `class`-disposition hits: code position in a code file,
  // anywhere in a prose-only one), and the scan holds it to that set in both directions. A
  // negative control that grows a cart mutation is no longer invisible; it is a Carries
  // line in a diff, which somebody reviews.
  //
  // A glob row matching many files is reconciled against the **union** over the files it
  // decides — the row is the unit that grants the exemption, so the row is the unit that
  // declares it. Files a later row overrides are that row's business, not this one's.
  // Rows that match nothing are skipped: Rule 9 has already said so, and reconciling an
  // empty observation would report every Carries entry as a second, derivative finding.
  contract.positions.forEach((p, i) => {
    const carries = p.carries ?? { declared: false, ids: [], raw: '' }
    const requires = CARRIES_REQUIRED.has(p.klass)
    const where = `\`${p.glob}\` (${p.klass})`
    if (requires && !carries.declared) {
      findings.push({
        code: 'exemption-carries-malformed',
        path: 'COMMERCE-ELIMINATION-CONTRACT.md',
        line: 0,
        detail:
          `${where} is a whole-file exemption and its Carries cell is empty. Name the ` +
          `identifiers the exemption covers, or write \`—\` to declare that it covers none.`,
      })
      return
    }
    if (!requires && carries.ids.length > 0) {
      findings.push({
        code: 'exemption-carries-malformed',
        path: 'COMMERCE-ELIMINATION-CONTRACT.md',
        line: 0,
        detail:
          `${where} declares Carries, and only ${[...CARRIES_REQUIRED].join(' and ')} rows ` +
          `may. A declaration on a class that grants no identifier-level exemption is a ` +
          `claim with nothing to check it against.`,
      })
      return
    }
    const unknown = minus(carries.ids, knownIds)
    if (unknown.length > 0) {
      findings.push({
        code: 'exemption-carries-malformed',
        path: 'COMMERCE-ELIMINATION-CONTRACT.md',
        line: 0,
        id: unknown.join(' '),
        detail: `${where} carries ${unknown.map((u) => `\`${u}\``).join(', ')}, which §3 does not define.`,
      })
      return
    }
    if (!requires || !matchedRows.has(i)) return

    const observed = exempted.get(i) ?? new Map()
    const undeclared = minus(observed.keys(), carries.ids)
    if (undeclared.length > 0) {
      findings.push({
        code: 'exemption-carries-undeclared',
        path: 'COMMERCE-ELIMINATION-CONTRACT.md',
        line: 0,
        id: undeclared.join(' '),
        detail:
          `${where} is exempting ${undeclared
            .map((u) => `\`${u}\` (in ${[...observed.get(u)].sort().join(', ')})`)
            .join(', ')} and its Carries cell does not say so. A whole-file exemption that ` +
          `grows without a diff to its declaration is the blind spot this column exists to close.`,
      })
    }
    const overdeclared = minus(carries.ids, observed.keys())
    if (overdeclared.length > 0) {
      findings.push({
        code: 'exemption-carries-overdeclared',
        path: 'COMMERCE-ELIMINATION-CONTRACT.md',
        line: 0,
        id: overdeclared.join(' '),
        detail:
          `${where} declares ${overdeclared.map((o) => `\`${o}\``).join(', ')} and nothing ` +
          `it classifies carries ${overdeclared.length === 1 ? 'it' : 'them'} where an ` +
          `exemption is needed. An exemption wider than its use is an exemption waiting ` +
          `for something to use it.`,
      })
    }
  })

  return {
    findings,
    scannedCount: files.length,
    classCounts,
    eligible,
    exempted,
    observations,
  }
}

/**
 * The decommission's phase, judged against the register.
 *
 * The register used to be guarded by a floor — at least twenty rows — which is the one
 * assertion guaranteed to fail on the day the work it tracks is finished, and to be
 * "fixed" that day by lowering it ([ADR 035](../../docs/adr/035-a-control-outlives-its-subject.md)).
 * A floor on a burn-down list encodes the opposite of the goal: §10 condition 5 is an
 * **empty** register.
 *
 * So the contract declares its phase and the phase is held against the rows in both
 * directions. `active` with no rows is not a clean pass; it is a completion nobody has
 * declared, and declaring it is a reviewed edit to the contract. `complete` with rows is a
 * declaration the tree contradicts. Neither state can be chosen to make a count pass,
 * because each state fails exactly where the other one would have been convenient.
 */
export function assessPhase({ contract, register }) {
  const phase = contract.state?.decommission
  if (!PHASES.includes(phase)) {
    return [
      {
        code: 'contract-state-invalid',
        path: 'COMMERCE-ELIMINATION-CONTRACT.md',
        line: 0,
        detail:
          `the \`state\` section declares \`decommission\` as \`${phase ?? '(missing)'}\`; ` +
          `it must be one of ${PHASES.map((p) => `\`${p}\``).join(', ')}.`,
      },
    ]
  }
  if (phase === 'active' && register.length === 0) {
    return [
      {
        code: 'phase-active-register-empty',
        path: 'docs/commerce-dependency-register.md',
        line: 0,
        detail:
          `the contract says the decommission is \`active\` and the register has no rows. ` +
          `That is the completion condition, not a pass: declare the contract \`complete\`, ` +
          `with review, so §10's other conditions are demonstrated rather than inferred.`,
      },
    ]
  }
  if (phase === 'complete' && register.length > 0) {
    return [
      {
        code: 'phase-complete-register-nonempty',
        path: 'docs/commerce-dependency-register.md',
        line: 0,
        detail:
          `the contract declares the decommission \`complete\` and the register still has ` +
          `${register.length} row(s). A completion the tree contradicts is the claim-about-a-` +
          `control failure ADR 018 names, pointed at the decommission itself.`,
      },
    ]
  }
  return []
}

// ── Packages ───────────────────────────────────────────────────────────────

/**
 * The package name an override selector or an `npm:` alias resolves to.
 *
 * `pnpm.overrides` keys are selectors — `foo`, `foo@1`, `parent>foo`, `@scope/foo@^2` —
 * and the package forced into the tree is the last segment with its version range removed.
 * A value of `npm:@scope/pkg@1` installs `@scope/pkg` under another name, which is the one
 * spelling of a dependency the manifest's own keys never show.
 */
export function packageNameOf(spec) {
  const last = String(spec).split('>').pop().trim()
  const bare = last.startsWith('npm:') ? last.slice(4) : last
  if (bare.startsWith('@')) {
    const [scope, rest = ''] = bare.slice(1).split('/')
    return `@${scope}/${rest.split('@')[0]}`
  }
  return bare.split('@')[0]
}

/**
 * Every package the manifest can cause to be installed, with where it said so.
 *
 * The four dependency maps, **plus** `pnpm.overrides`, npm's `overrides` and `resolutions`,
 * plus the target of any `npm:` alias. An override is not a request for a version; it is an
 * instruction to install, and it can force a prohibited package into the tree without any
 * dependency map naming it. The first version of this audit read the four maps and nothing
 * else.
 */
export function manifestPackages(manifest) {
  const out = []
  for (const field of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']) {
    for (const [name, value] of Object.entries(manifest[field] ?? {})) {
      out.push({ name, via: field })
      if (typeof value === 'string' && value.startsWith('npm:')) {
        out.push({ name: packageNameOf(value), via: `${field} alias \`${name}\`` })
      }
    }
  }
  const walkOverrides = (obj, via) => {
    for (const [key, value] of Object.entries(obj ?? {})) {
      if (key !== '.') out.push({ name: packageNameOf(key), via })
      if (typeof value === 'string' && value.startsWith('npm:')) {
        out.push({ name: packageNameOf(value), via: `${via} alias \`${key}\`` })
      } else if (value && typeof value === 'object') {
        walkOverrides(value, via) // npm's nested form
      }
    }
  }
  walkOverrides(manifest.pnpm?.overrides, 'pnpm.overrides')
  walkOverrides(manifest.overrides, 'overrides')
  walkOverrides(manifest.resolutions, 'resolutions')
  return out
}

/** Manifest rule: no commerce SDK may be a dependency, direct, forced or transitive. */
export function auditPackages({ manifest, lockfile }, contract) {
  const findings = []
  const matching = (name) => contract.packages.filter((rule) => rule.pattern.test(name))

  const reported = new Set()
  for (const { name, via } of manifestPackages(manifest)) {
    const rules = matching(name)
    if (rules.length === 0 || reported.has(`${name}\0${via}`)) continue
    reported.add(`${name}\0${via}`)
    findings.push({
      code: 'prohibited-package',
      path: 'package.json',
      line: 0,
      detail:
        `\`${name}\` (from \`${via}\`) matches the prohibited pattern ` +
        `${rules.map((r) => `\`${r.source}\``).join(', ')}. ${rules[0].why}`,
    })
  }

  /*
   * The lockfile carries transitives, and a transitive is how commerce machinery
   * actually arrives: not as `npm i @shopify/hydrogen`, but inside an image plugin, a
   * form service or an analytics wrapper that someone added for an unrelated reason.
   *
   * One finding per package **name**. pnpm lists every package twice — once under
   * `packages:` and once under `snapshots:` — and a report that says everything twice
   * teaches its reader to halve it, which is one step from skimming it.
   */
  for (const name of lockfilePackages(lockfile)) {
    const rules = matching(name)
    if (rules.length === 0) continue
    findings.push({
      code: 'prohibited-transitive-package',
      path: 'pnpm-lock.yaml',
      line: 0,
      detail:
        `\`${name}\` matches ${rules.map((r) => `\`${r.source}\``).join(', ')} and reaches ` +
        `this project as a transitive dependency. A commerce SDK nobody installed is still ` +
        `in the bundle.`,
    })
  }
  return findings
}

/**
 * Package names the lockfile declares, deduplicated.
 *
 * The line shape is pnpm's: two-space-indented `name@version:` keys under `packages:`
 * and `snapshots:`, with a **scoped** name quoted — `'@upstash/redis@1.38.4':` — and an
 * unscoped one bare. The quote is the part a first draft gets wrong, and getting it
 * wrong is invisible: every scoped package silently falls out of the scan, and
 * `@shopify/*` is scoped. The contract test therefore asserts the parser can see
 * packages this project is known to depend on, scoped ones included, rather than only
 * asserting the absence of the ones it must not have.
 */
export function lockfilePackages(lockfile) {
  const names = new Set()
  for (const line of lockfile.split('\n')) {
    const m = line.match(/^\s{2}['"]?\/?(@?[^:@\s'"/]+(?:\/[^:@\s'"]+)?)@/)
    if (m) names.add(m[1])
  }
  return names
}

// ── The report ─────────────────────────────────────────────────────────────

const countBy = (items, key) => {
  const out = {}
  for (const item of items) {
    const k = key(item)
    out[k] = (out[k] ?? 0) + 1
  }
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)))
}

/**
 * Every number a burn-down document would otherwise type by hand.
 *
 * The first masterplan said the register held 58 rows on the day it held 53, and
 * attributed thirty of them to a workstream that owned twenty-one. Nobody lied; somebody
 * counted once, and the count was a sentence from then on. A number a document needs is a
 * number this function prints, so a document can cite the command instead of the figure.
 */
export function summarise({ files, contract, register, result, manifest, lockfile, findings }) {
  const scopeOf = new Map(contract.identifiers.map((i) => [i.id, i.scope]))
  const byScope = {}
  for (const obs of result.observations) {
    const s = (byScope[obs.scope] ??= { occurrences: 0, files: new Set(), ids: {}, byDisposition: {} })
    s.occurrences += 1
    s.files.add(obs.path)
    s.ids[obs.id] = (s.ids[obs.id] ?? 0) + 1
    s.byDisposition[obs.disposition] = (s.byDisposition[obs.disposition] ?? 0) + 1
  }
  const valueFindings = findings.filter((f) => f.code === 'credential-value-committed')
  byScope.value = {
    occurrences: valueFindings.length,
    files: new Set(valueFindings.map((f) => f.path)),
    ids: countBy(valueFindings, (f) => f.id),
    byDisposition: valueFindings.length ? { finding: valueFindings.length } : {},
  }

  const exemptions = []
  contract.positions.forEach((p, i) => {
    if (!CARRIES_REQUIRED.has(p.klass)) return
    const observed = result.exempted.get(i) ?? new Map()
    exemptions.push({
      glob: p.glob,
      klass: p.klass,
      declared: p.carries?.ids ?? [],
      observed: [...observed.keys()].sort(),
    })
  })

  const blocking = findings.filter((f) => BLOCKING.has(f.code))
  return {
    phase: contract.state?.decommission ?? null,
    scanned: {
      trackedTextFiles: files.length,
      byClass: result.classCounts,
      byLanguage: countBy(files, (f) => languageOf(f.path) ?? '(none)'),
    },
    packages: {
      manifest: new Set(manifestPackages(manifest).map((p) => p.name)).size,
      lockfile: lockfilePackages(lockfile).size,
      rules: contract.packages.length,
    },
    register: {
      rows: register.length,
      byWorkstream: countBy(register, (r) => r.workstream),
      identifierDeclarations: register.reduce((n, r) => n + r.identifiers.length, 0),
      paths: [...result.eligible.keys()].filter((p) => register.some((r) => r.path === p)).length,
    },
    identifiers: Object.fromEntries(
      Object.entries(byScope)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([scope, s]) => [
          scope,
          {
            occurrences: s.occurrences,
            files: s.files.size,
            ids: Object.fromEntries(Object.entries(s.ids).sort(([a], [b]) => a.localeCompare(b))),
            byDisposition: s.byDisposition,
          },
        ])
    ),
    identifierScopes: Object.fromEntries(scopeOf),
    exemptions,
    findings: { blocking: blocking.length, byCode: countBy(blocking, (f) => f.code) },
  }
}

/**
 * Findings that must fail a build.
 *
 * Every code this module emits is here, and that is a decision rather than an oversight.
 * A checker with an advisory tier grows one: the tier fills up, and the difference between
 * "we know about it" and "we fixed it" stops being visible in CI
 * ([ADR 011](../../docs/adr/011-repeated-identical-failures-must-escalate.md)). Where this
 * contract needs to tolerate something, it tolerates it *by name* — a register row or a
 * class — not by severity.
 */
export const BLOCKING = new Set([
  'credential-value-committed',
  'absolute-prohibition-in-code',
  'unregistered-commerce-reference',
  'undeclared-commerce-document',
  'superseded-without-banner',
  'negative-control-asserts-nothing',
  'specification-nothing-reads',
  'register-names-missing-file',
  'register-row-is-spent',
  'register-identifiers-undeclared',
  'register-identifiers-overdeclared',
  'register-duplicate-path',
  'register-unknown-identifier',
  'exemption-carries-undeclared',
  'exemption-carries-overdeclared',
  'exemption-carries-malformed',
  'classification-matches-nothing',
  'contract-state-invalid',
  'phase-active-register-empty',
  'phase-complete-register-nonempty',
  'prohibited-package',
  'prohibited-transitive-package',
  'unknown-language',
])
