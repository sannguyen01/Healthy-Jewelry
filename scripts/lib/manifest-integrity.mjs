/**
 * **Two files git will merge into nonsense without ever reporting a conflict.**
 *
 * ## What happened, twice, in one day
 *
 * On 2026-09-18 GitHub's "Update branch" button ran a text merge of `pnpm-lock.yaml` on
 * Dependabot PR #72 (commit `1c0419c`). Two independent dependency changes had landed on
 * adjacent lines, so git interleaved them and emitted **no conflict marker**. The result
 * held ten duplicated mapping keys, the first of them:
 *
 *     '@testing-library/react':
 *       specifier: ^16.3.3
 *       version: 16.3.3(…react@19.2.8)
 *       specifier: ^16.3.2
 *       version: 16.3.2(…react@19.3.0)
 *
 * That merged to `main`. `pnpm` refuses such a file outright — `ERR_PNPM_BROKEN_LOCKFILE`
 * — so every job died at `Install dependencies` and every check after it reported
 * `skipped`, which from outside is indistinguishable from passing (ADR 011).
 *
 * Hours later the same button did the same thing to **`package.json`** (`410e4d9`),
 * producing five duplicated keys:
 *
 *     "next": "^16.3.4",
 *     …
 *     "next": "^15.5.24",
 *
 * and this half is the one worth building a tool for. **JSON allows duplicate keys.**
 * `JSON.parse` takes the last occurrence and reports nothing, so every tool in the
 * repository — pnpm, tsc, Next, this repository's own manifest tests — read
 * `next: ^15.5.24` from a file that also said `^16.3.4`, while the source tree on the same
 * commit was written against Next 16. Nothing anywhere would ever have said so.
 *
 * ## Why this is dependency-free, and runs before `pnpm install`
 *
 * The same reasoning as the control-audit probes: a check on the dependency manifest
 * cannot be installed by the manifest it is checking. More pointedly, in the incident that
 * motivated it *both* files were damaged at once — so a check that ran after `pnpm install`
 * would never have run at all. It has to be the step before.
 *
 * ## Why a tokeniser rather than a regex
 *
 * A duplicate key is a question about structure: which keys are *siblings*. A regex sees
 * lines, cannot tell an object boundary from a brace inside a string, and would have
 * unknown coverage — [ADR 007](../../docs/adr/007-regex-guardrails-have-unknown-coverage.md).
 * JSON's grammar is small enough that scanning it exactly costs about fifty lines, so the
 * cheap approximation buys nothing.
 */

/**
 * Every key that appears more than once among its siblings, in document order.
 *
 * Exact for JSON: the scanner tracks string state, so a `{`, `}` or `"` inside a value
 * never moves it, and sibling sets are keyed on nesting depth within the enclosing object
 * rather than on indentation.
 *
 * @param {string} source
 * @returns {Array<{ key: string, line: number, firstLine: number, path: string[] }>}
 */
export function findDuplicateJsonKeys(source) {
  /** @type {Array<{ key: string, line: number, firstLine: number, path: string[] }>} */
  const duplicates = []
  /** @type {Array<{ kind: 'object' | 'array', seen: Map<string, number>, key: string | null }>} */
  const stack = []
  /** The key most recently read at the current level, which names a container it opens. */
  let pendingKey = null
  let line = 1
  let i = 0

  const path = () => stack.map((frame) => frame.key).filter((k) => k !== null)

  while (i < source.length) {
    const ch = source[i]

    if (ch === '\n') {
      line++
      i++
      continue
    }

    if (ch === '"') {
      // Read the whole string, honouring escapes, so a quote inside it cannot end it.
      let j = i + 1
      let text = ''
      while (j < source.length && source[j] !== '"') {
        if (source[j] === '\\') {
          text += source[j] + source[j + 1]
          j += 2
          continue
        }
        if (source[j] === '\n') line++
        text += source[j]
        j++
      }
      const afterString = skipWhitespace(source, j + 1)
      const isKey = source[afterString] === ':' && stack.length > 0 && stack.at(-1).kind === 'object'

      if (isKey) {
        const frame = stack.at(-1)
        const firstLine = frame.seen.get(text)
        if (firstLine !== undefined) {
          duplicates.push({ key: text, line, firstLine, path: path() })
        } else {
          frame.seen.set(text, line)
        }
        pendingKey = text
      }

      i = j + 1
      continue
    }

    if (ch === '{' || ch === '[') {
      stack.push({ kind: ch === '{' ? 'object' : 'array', seen: new Map(), key: pendingKey })
      pendingKey = null
      i++
      continue
    }

    if (ch === '}' || ch === ']') {
      stack.pop()
      pendingKey = null
      i++
      continue
    }

    i++
  }

  return duplicates
}

/** @param {string} source @param {number} from */
function skipWhitespace(source, from) {
  let i = from
  while (i < source.length && /\s/.test(source[i])) i++
  return i
}

/**
 * Do `package.json`'s declared ranges and the lockfile's recorded ranges agree?
 *
 * `pnpm install --frozen-lockfile` already refuses when they do not, so this adds no
 * detection. What it adds is a **name**: pnpm's refusal kills the install step, every
 * check after it reports `skipped`, and the reason lives in a log nobody opens. Answering
 * the same question in a step of its own, before install, turns that into a red check that
 * says which package and which two versions. That is the whole of ADR 011's finding,
 * applied to the one failure that has now caused it twice.
 *
 * Read line-oriented rather than through a YAML parser, because a YAML parser is a
 * dependency and this runs before `pnpm install`. The `importers:` block pnpm writes is a
 * fixed, flat shape — `name:` then `specifier:` then `version:` — and the function reports
 * `unevaluable` rather than `ok` if it does not find that shape, so a lockfile format
 * change surfaces as "could not run" and never as a false all-clear (ADR 010).
 *
 * ## `pnpm.overrides` is why this compares an *effective* range
 *
 * The first draft compared the declared range and immediately reported `postcss` as
 * divergent: `package.json` declares `^8.5.28`, the lockfile records `^8.5.23`, and
 * `pnpm install --frozen-lockfile` is perfectly happy. An entry in `pnpm.overrides`
 * replaces the effective range for the root importer as well as for transitive
 * dependents, and the lockfile records what was *applied*. So the range to compare is
 * `overrides[name] ?? declared[name]`, and a check that did not know this would have been
 * a permanent red on a correct repository — which is a check people mute.
 *
 * Typed by the fields it actually reads rather than with an index signature. The first
 * attempt intersected `Record<string, Record<string, string>>` with the `pnpm` shape, and
 * TypeScript rightly refused it: `pnpm.overrides` is not a `Record<string, string>`, so the
 * index signature contradicted the very field it had been widened to admit. Naming the four
 * keys is both shorter and true.
 *
 * @param {{ dependencies?: Record<string, string>, devDependencies?: Record<string, string>, optionalDependencies?: Record<string, string>, pnpm?: { overrides?: Record<string, string> } }} manifest parsed package.json
 * @param {string} lockfileSource
 * @returns {{ status: 'ok' | 'divergent' | 'unevaluable', divergences: Array<{ name: string, manifest: string, lockfile: string, overridden: boolean }>, reason?: string }}
 */
export function compareSpecifiers(manifest, lockfileSource) {
  const overrides = manifest.pnpm?.overrides ?? {}
  const declared = new Map()
  for (const field of ['dependencies', 'devDependencies', 'optionalDependencies']) {
    for (const [name, range] of Object.entries(manifest[field] ?? {})) {
      declared.set(name, overrides[name] ?? range)
    }
  }
  if (declared.size === 0) {
    return { status: 'unevaluable', divergences: [], reason: 'package.json declares no dependencies' }
  }

  const recorded = readRootImporterSpecifiers(lockfileSource)
  if (recorded === null) {
    return {
      status: 'unevaluable',
      divergences: [],
      reason:
        "could not find the root importer's specifier entries in pnpm-lock.yaml. The " +
        'lockfile format may have changed; this check reports that it could not run rather ' +
        'than reporting agreement it did not verify.',
    }
  }

  const divergences = []
  for (const [name, range] of declared) {
    const inLock = recorded.get(name)
    if (inLock !== undefined && inLock !== range) {
      divergences.push({ name, manifest: range, lockfile: inLock, overridden: name in overrides })
    }
  }

  return { status: divergences.length === 0 ? 'ok' : 'divergent', divergences }
}

/**
 * The root importer's `name -> specifier` map, or `null` if the expected shape is absent.
 *
 * pnpm writes the root project as `importers:` then `  .:` then a dependency field, then
 * two-space-deeper entries of `name:` / `specifier:` / `version:`. The scan stops at the
 * next top-level key so a package named `importers` elsewhere in the file cannot extend it.
 *
 * @param {string} source
 * @returns {Map<string, string> | null}
 */
function readRootImporterSpecifiers(source) {
  const lines = source.split('\n')
  const start = lines.findIndex((l) => l === 'importers:')
  if (start === -1) return null

  const map = new Map()
  let currentName = null
  let inRootImporter = false

  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i]
    if (line.trim() === '') continue
    if (/^\S/.test(line)) break // next top-level key ends the importers block

    const importer = line.match(/^ {2}(\S.*):$/)
    if (importer) {
      inRootImporter = importer[1] === '.'
      continue
    }
    if (!inRootImporter) continue

    const name = line.match(/^ {6}'?([^':]+)'?:$/)
    if (name) {
      currentName = name[1]
      continue
    }
    const specifier = line.match(/^ {8}specifier: (.+)$/)
    if (specifier && currentName !== null) map.set(currentName, specifier[1].trim())
  }

  return map.size === 0 ? null : map
}

/**
 * **The lockfile half, which ADR 031 left to pnpm and which came back.**
 *
 * ADR 031 declined to scan `pnpm-lock.yaml` for duplicate keys: pnpm refuses such a file
 * outright, so the failure was already loud. On 2026-10-03 it happened again — PR #101's
 * conflict with `main` was resolved in GitHub's web editor by keeping both sides of all 22
 * hunks (`ed7594a`), which left the lockfile ten duplicated keys — and the step this module
 * backs, **named "Manifest and lockfile integrity"**, printed two ticks and exited 0 one line
 * above the install that died on it. Loud was true. Checked was not: a step whose name
 * promises lockfile integrity, passing a lockfile pnpm will not parse, is a claim about a
 * control rather than a control (ADR 018). See ADR 046.
 *
 * ## Why a scanner for this subset, and why it says when it cannot run
 *
 * The objection in ADR 031 was that this needs a YAML parser, which is a dependency, and
 * this runs before dependencies exist. It does not need *a* YAML parser; it needs the subset
 * pnpm writes, which was measured rather than assumed (2026-10-04, 5,088 lines): block keys,
 * `key: scalar`, single-line flow collections (`resolution: {integrity: …}`, `cpu: [x64]`),
 * and plain-scalar sequences under `bundledDependencies` / `transitivePeerDependencies` —
 * nothing else. Siblings are the keys at one indentation inside one parent, which a stack of
 * indentations answers exactly for that subset.
 *
 * Anything outside it — a block scalar, an anchor or alias, a merge key, a flow collection
 * that spans lines, a mapping inside a sequence, a tab, an indentation the structure does not
 * explain — returns `unevaluable` with the line, never `ok` (ADR 010). And its coverage is
 * measured, not asserted: `manifest-integrity.test.ts` checks it against the `yaml` package
 * (`uniqueKeys: true`) on this repository's real lockfile and on hundreds of seeded
 * mutations of it, so a disagreement with a real parser is a failing test rather than a hole
 * nobody has found (ADR 007).
 *
 * @param {string} source
 * @returns {{ status: 'ok' | 'unevaluable', duplicates: Array<{ key: string, line: number, firstLine: number, path: string[] }>, reason?: string, line?: number }}
 */
export function findDuplicateLockfileKeys(source) {
  const lines = source.split('\n')
  /** @type {Array<{ key: string, line: number, firstLine: number, path: string[] }>} */
  const duplicates = []
  /** Sibling sets, innermost last. Root is indentation 0. */
  const frames = [{ indent: 0, seen: new Map(), path: [] }]
  /** A `key:` with no inline value, waiting for its children at a deeper indentation. */
  let open = null
  /** The indentation of the sequence currently being read, if any. */
  let sequenceIndent = null

  const unevaluable = (lineNo, why) => ({
    status: /** @type {const} */ ('unevaluable'),
    duplicates,
    line: lineNo,
    reason: `pnpm-lock.yaml line ${lineNo}: ${why}. This scanner reads the YAML subset pnpm writes and reports that it could not run rather than reporting agreement it did not verify.`,
  })

  for (let i = 0; i < lines.length; i++) {
    const lineNo = i + 1
    const raw = lines[i].endsWith('\r') ? lines[i].slice(0, -1) : lines[i]
    if (raw.trim() === '' || /^\s*#/.test(raw)) continue
    if (raw === '---' || raw === '...') {
      frames.length = 1
      frames[0] = { indent: 0, seen: new Map(), path: [] }
      open = null
      sequenceIndent = null
      continue
    }
    if (/^[ ]*\t/.test(raw)) return unevaluable(lineNo, 'a tab in the indentation')

    const indent = raw.length - raw.trimStart().length
    const content = raw.slice(indent)

    if (content === '-' || content.startsWith('- ')) {
      const item = content.slice(1).trim()
      if (sequenceIndent === null) {
        if (open === null || indent <= open.indent) {
          return unevaluable(lineNo, 'a sequence item that no key opened')
        }
        sequenceIndent = indent
        open = null
      } else if (indent !== sequenceIndent) {
        return unevaluable(lineNo, 'a sequence item at an indentation its sequence does not use')
      }
      if (item === '' || /^(&|\*|!|\||>)/.test(item) || parseKeyLine(item) !== null) {
        return unevaluable(lineNo, 'a sequence item that is not a plain scalar')
      }
      continue
    }

    const parsed = parseKeyLine(content)
    if (parsed === null) return unevaluable(lineNo, 'a line that is neither a key nor a sequence item')
    if (parsed.key === '<<') return unevaluable(lineNo, 'a merge key, which can introduce keys this scan cannot see')

    sequenceIndent = null
    while (frames.length > 1 && frames.at(-1).indent > indent) frames.pop()
    let frame = frames.at(-1)
    if (indent > frame.indent) {
      if (open === null || indent <= open.indent || open.indent !== frame.indent) {
        return unevaluable(lineNo, 'an indentation the structure above it does not explain')
      }
      frame = { indent, seen: new Map(), path: [...open.path, open.key] }
      frames.push(frame)
    } else if (indent < frame.indent) {
      return unevaluable(lineNo, 'a dedent to an indentation no enclosing key uses')
    }

    const firstLine = frame.seen.get(parsed.key)
    if (firstLine !== undefined) duplicates.push({ key: parsed.key, line: lineNo, firstLine, path: frame.path })
    else frame.seen.set(parsed.key, lineNo)

    const value = parsed.value
    if (value === null) {
      open = { key: parsed.key, indent, path: frame.path }
      continue
    }
    open = null
    if (/^(&|\*|!)/.test(value)) return unevaluable(lineNo, 'an anchor, alias or tag')
    if (/^[|>]/.test(value)) return unevaluable(lineNo, 'a block scalar')
    if (/^[[{]/.test(value) && !/[\]}]\s*(#.*)?$/.test(value)) {
      return unevaluable(lineNo, 'a flow collection that does not close on its own line')
    }
  }

  return { status: 'ok', duplicates }
}

/**
 * `{ key, value }` for a `key:` / `key: value` line, with the key unquoted so `'a'` and `a`
 * are the same key as YAML says they are, or `null` if the line is not a mapping entry.
 *
 * @param {string} content a line with its indentation removed
 * @returns {{ key: string, value: string | null } | null}
 */
function parseKeyLine(content) {
  let key
  let rest
  if (content.startsWith("'")) {
    let j = 1
    let text = ''
    for (;;) {
      if (j >= content.length) return null
      if (content[j] === "'") {
        if (content[j + 1] === "'") {
          text += "'"
          j += 2
          continue
        }
        break
      }
      text += content[j++]
    }
    key = text
    rest = content.slice(j + 1)
  } else if (content.startsWith('"')) {
    const m = content.match(/^"((?:[^"\\]|\\.)*)"/)
    if (!m) return null
    try {
      key = JSON.parse(`"${m[1]}"`)
    } catch {
      return null
    }
    rest = content.slice(m[0].length)
  } else {
    const m = content.match(/^([^\s'"#[\]{},&*!|>%@`-][^:#]*?|-[^\s:#][^:#]*?):(?=\s|$)/)
    if (!m) return null
    key = m[1].trimEnd()
    rest = content.slice(m[1].length)
  }
  if (!rest.startsWith(':')) return null
  const after = rest.slice(1)
  if (after !== '' && !/^\s/.test(after)) return null
  const value = after.trim()
  return { key, value: value === '' || value.startsWith('#') ? null : value }
}

/**
 * Every line that is a git conflict marker: `<<<<<<<`, `|||||||`, `=======`, `>>>>>>>`.
 *
 * A file committed with markers is what an abandoned resolution leaves. pnpm can resolve
 * markers in a lockfile itself, but only from a non-frozen `pnpm install` on a workstation;
 * a frozen install in CI or on Vercel refuses the file, and `JSON.parse` refuses a manifest
 * that carries them — which, before this check, threw out of this probe with a stack trace
 * instead of a verdict.
 *
 * @param {string} source
 * @returns {Array<{ line: number, marker: string }>}
 */
export function findConflictMarkers(source) {
  const found = []
  source.split('\n').forEach((text, i) => {
    const m = text.match(/^(<{7}|\|{7}|={7}|>{7})(?=\s|$)/)
    if (m) found.push({ line: i + 1, marker: m[1] })
  })
  return found
}
