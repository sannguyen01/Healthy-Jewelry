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
 * ## The two directions, both enforced
 *
 * Every reconciliation in this repository runs both ways and this one is no exception.
 * A retained-surface row naming a file that no longer carries the identifier is a
 * **phantom**, and it fails exactly as loudly as an unlisted file does. A register that
 * over-reports is how a decommission looks unfinished forever; a tool that reports
 * phantoms is one whose output people skim
 * ([ADR 024](../../docs/adr/024-a-tool-never-pointed-at-a-known-answer.md)).
 */

// ── Position: where in a file a token sits ─────────────────────────────────

/**
 * Comment syntax per extension.
 *
 * `json` has none, which is why it is absent rather than mapped to an empty pair: a
 * lookup miss is a loud `unknown-language` finding, and a silent default of "no comments"
 * would classify an unfamiliar file's entire contents as code and bury the real answer in
 * false positives.
 */
const LANGUAGES = {
  ts: 'c-style',
  tsx: 'c-style',
  js: 'c-style',
  jsx: 'c-style',
  mjs: 'c-style',
  cjs: 'c-style',
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

/**
 * Split a source file into its code half and its prose half, preserving line numbers.
 *
 * Returns two arrays the same length as the input's lines, so a finding can name the line
 * it came from without a second pass. A line that is part code and part comment appears in
 * both, truncated to its own half — which is what makes
 * `const x = 1 // shopify` a prose finding rather than a code one.
 *
 * This is a lexer, not a parser, and it knows it: a `//` inside a string literal ends the
 * code half early. That direction is safe. It moves a token from `code` to `prose`, which
 * *weakens* a finding rather than inventing one, and the retained-surface reconciliation
 * below runs in both directions, so a token that silently changed class would surface as a
 * phantom row rather than as silence. [ADR 007](../../docs/adr/007-regex-guardrails-have-unknown-coverage.md)
 * is the standing rule: a pattern's coverage is unknown unless something measures it, and
 * `parser-fuzz.test.ts` is where that measurement happens.
 */
export function splitPositions(source, language) {
  const lines = source.split('\n')
  const code = new Array(lines.length).fill('')
  const prose = new Array(lines.length).fill('')

  if (language === 'all-prose') {
    return { code, prose: lines.slice() }
  }
  if (language === 'none') {
    return { code: lines.slice(), prose }
  }
  if (language === 'hash') {
    lines.forEach((line, i) => {
      const at = line.indexOf('#')
      if (at === -1) {
        code[i] = line
      } else {
        code[i] = line.slice(0, at)
        prose[i] = line.slice(at)
      }
    })
    return { code, prose }
  }

  // c-style and block-only
  const lineComments = language === 'c-style'
  let inBlock = false
  lines.forEach((line, i) => {
    let c = ''
    let p = ''
    let j = 0
    while (j < line.length) {
      const two = line.slice(j, j + 2)
      if (inBlock) {
        if (two === '*/') {
          inBlock = false
          p += two
          j += 2
        } else {
          p += line[j]
          j += 1
        }
        continue
      }
      if (two === '/*') {
        inBlock = true
        p += two
        j += 2
        continue
      }
      if (lineComments && two === '//') {
        p += line.slice(j)
        break
      }
      c += line[j]
      j += 1
    }
    code[i] = c
    prose[i] = p
  })
  return { code, prose }
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
const unticked = (s) => s.replace(/^`|`$/g, '')

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

  const positions = tableRows(section(markdown, 'positions')).map((cells) => ({
    glob: unticked(cells[0]),
    klass: cells[1],
    why: cells[2] ?? '',
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

  return {
    identifiers,
    positions,
    packages,
    routesApproved,
    routesForbidden,
    contentForbidden,
    owners,
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
 * `Action` is the column that decides whether a row is retained or done. `remove` and
 * `rewrite` rows are outstanding work; a row whose file no longer carries an identifier is
 * a phantom and `evaluate()` says so. Nothing here is derived from the filesystem — that is
 * the point, and the reconciliation is what makes the document trustworthy rather than
 * merely present.
 */
export function parseRegister(markdown) {
  return tableRows(section(markdown, 'register')).map((cells) => ({
    path: unticked(cells[0]),
    identifiers: unticked(cells[1] ?? '')
      .split(/[,\s]+/)
      .filter(Boolean),
    system: cells[2] ?? '',
    trigger: cells[3] ?? '',
    data: cells[4] ?? '',
    action: cells[5] ?? '',
    provenBy: unticked(cells[6] ?? ''),
    workstream: cells[7] ?? '',
  }))
}

/** The paths the register accounts for — what `evaluate()` treats as retained. */
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
 * Which class a path belongs to. **Last match wins**, so the table reads as a series of
 * increasingly specific overrides and a reader can see the exception below the rule it
 * excepts. First-match-wins would put every exception above its rule and invert the
 * document's legibility.
 */
export function classify(relPath, positions) {
  let klass = 'executable'
  for (const p of positions) {
    if (globToRegExp(p.glob).test(relPath)) klass = p.klass
  }
  return klass
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
 * Judge the whole tree in one pass.
 *
 * @param {object} input
 * @param {{path: string, source: string}[]} input.files  every tracked text file
 * @param {object} input.contract                          parsed contract
 * @param {Set<string>} input.retained                     paths the register accounts for
 */
export function evaluate({ files, contract, retained }) {
  const findings = []
  const seenRetained = new Set()
  const classCounts = Object.fromEntries(CLASSES.map((c) => [c, 0]))
  const matchedGlobs = new Set()
  const specifications = new Set()

  for (const file of files) {
    const klass = classify(file.path, contract.positions)
    classCounts[klass] += 1
    for (const p of contract.positions) {
      if (globToRegExp(p.glob).test(file.path)) matchedGlobs.add(p.glob)
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

    const hits = occurrences(file, contract)
    const isRetained = retained.has(file.path)
    let usedRetention = false

    for (const hit of hits) {
      // ── Rule 1. A credential value is a leak in any position, in any class.
      if (hit.scope === 'value') {
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
        continue
      }

      const exemptByClass =
        klass === 'historical' || klass === 'negative-control' || klass === 'specification'
      const proseOnlyFile = language === 'all-prose'

      // ── Rule 2. An absolute prohibition in running code is never retained.
      if (hit.scope === 'absolute' && hit.position === 'code' && !proseOnlyFile) {
        if (exemptByClass) continue
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

      // ── Rule 3. A comment inside a code file is free.
      //
      // Deliberate, and the most likely part of this to be argued with. The comment above
      // `src/app/api/webhooks/shopify/route.ts` explaining why the route is still standing
      // is the single most useful sentence in that file, and a rule that deletes it makes
      // the decommission harder to finish rather than closer to done. Prose is a claim,
      // and claims expire on the register's clock, not the linter's.
      if (hit.position === 'prose' && !proseOnlyFile) continue

      if (exemptByClass) continue

      // ── Rule 4. A superseded document may say anything, because its banner has
      //           already told the reader not to act on it. The banner is checked below.
      if (klass === 'superseded') continue

      // ── Rule 5. Everything else needs a row in the register.
      if (isRetained) {
        usedRetention = true
        continue
      }

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

    if (isRetained && usedRetention) seenRetained.add(file.path)

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

    // ── Rule 7b. A negative control must control something.
    if (klass === 'negative-control' && !ASSERTION_EVIDENCE.test(file.source)) {
      findings.push({
        code: 'negative-control-asserts-nothing',
        path: file.path,
        line: 1,
        detail:
          `classified \`negative-control\` — the class that lets a file name what it ` +
          `forbids — but nothing in it asserts, throws or records a finding. That is the ` +
          `strongest exemption in this contract granted to a file that checks nothing.`,
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
    const readers = files.filter((f) => {
      if (f.path === spec) return false
      const lang = languageOf(f.path)
      if (lang === null || lang === 'all-prose') return false
      return splitPositions(f.source, lang).code.some((l) => l.includes(spec))
    })
    if (readers.length === 0) {
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

  // ── Rule 8, both directions. A register row that no longer matches is a phantom.
  const scanned = new Set(files.map((f) => f.path))
  for (const path of retained) {
    if (!scanned.has(path)) {
      findings.push({
        code: 'register-names-missing-file',
        path,
        line: 0,
        detail:
          `the register retains this path and the scan never saw it. If the file was ` +
          `deleted the row is complete — close it with its evidence rather than leaving ` +
          `it to read as outstanding work.`,
      })
      continue
    }
    if (!seenRetained.has(path)) {
      findings.push({
        code: 'register-row-is-spent',
        path,
        line: 0,
        detail:
          `the register retains this path for commerce identifiers it no longer carries ` +
          `where the rules look. The work is done and the row is not. A register that ` +
          `over-reports is one nobody finishes reading.`,
      })
    }
  }

  // ── Rule 9. Every classification glob must classify something.
  //
  // The phantom rule applied to the contract itself. A glob matching nothing is either a
  // typo — in which case the files it was meant to cover are silently unclassified — or a
  // rule that outlived its subject, which is ADR 035 exactly.
  for (const p of contract.positions) {
    if (!matchedGlobs.has(p.glob)) {
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
  }

  return { findings, scannedCount: files.length, classCounts }
}

/** Manifest rule: no commerce SDK may be a dependency, direct or transitive. */
export function auditPackages({ manifest, lockfile }, contract) {
  const findings = []
  const declared = Object.keys({
    ...(manifest.dependencies ?? {}),
    ...(manifest.devDependencies ?? {}),
    ...(manifest.optionalDependencies ?? {}),
    ...(manifest.peerDependencies ?? {}),
  })

  for (const rule of contract.packages) {
    for (const name of declared) {
      if (rule.pattern.test(name)) {
        findings.push({
          code: 'prohibited-package',
          path: 'package.json',
          line: 0,
          detail: `\`${name}\` matches the prohibited pattern \`${rule.source}\`. ${rule.why}`,
        })
      }
    }
    /*
     * The lockfile carries transitives, and a transitive is how commerce machinery
     * actually arrives: not as `npm i @shopify/hydrogen`, but inside an image plugin, a
     * form service or an analytics wrapper that someone added for an unrelated reason.
     *
     * The line shape is pnpm's: two-space-indented `name@version:` keys under `packages:`
     * and `snapshots:`, with a **scoped** name quoted — `'@upstash/redis@1.38.4':` — and an
     * unscoped one bare. The quote is the part a first draft gets wrong, and getting it
     * wrong is invisible: every scoped package silently falls out of the scan, and
     * `@shopify/*` is scoped. The contract test therefore asserts the parser can see
     * packages this project is known to depend on, scoped ones included, rather than only
     * asserting the absence of the ones it must not have.
     */
    for (const line of lockfile.split('\n')) {
      const m = line.match(/^\s{2}['"]?\/?(@?[^:@\s'"/]+(?:\/[^:@\s'"]+)?)@/)
      if (m && rule.pattern.test(m[1])) {
        findings.push({
          code: 'prohibited-transitive-package',
          path: 'pnpm-lock.yaml',
          line: 0,
          detail:
            `\`${m[1]}\` matches \`${rule.source}\` and reaches this project as a ` +
            `transitive dependency. A commerce SDK nobody installed is still in the bundle.`,
        })
      }
    }
  }
  return findings
}

/** Package names the lockfile declares, used to prove the lockfile parser still parses. */
export function lockfilePackages(lockfile) {
  const names = new Set()
  for (const line of lockfile.split('\n')) {
    const m = line.match(/^\s{2}['"]?\/?(@?[^:@\s'"/]+(?:\/[^:@\s'"]+)?)@/)
    if (m) names.add(m[1])
  }
  return names
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
  'classification-matches-nothing',
  'prohibited-package',
  'prohibited-transitive-package',
  'unknown-language',
])
