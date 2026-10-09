import { describe, it, expect } from 'vitest'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { parseDocument } from 'yaml'

const { findDuplicateJsonKeys, findDuplicateLockfileKeys, findConflictMarkers, compareSpecifiers } =
  await import('../../../scripts/lib/manifest-integrity.mjs')
const { audit, render, exitCode } = await import('../../../scripts/audit-manifest-integrity.mjs')

/**
 * **Pointed at the two files that actually broke, not at an invented one.**
 *
 * On 2026-09-18 GitHub's "Update branch" button text-merged `pnpm-lock.yaml` on Dependabot
 * PR #72 (`1c0419c`) and `package.json` on PR #73 (`410e4d9`). Both times two independent
 * dependency changes sat on adjacent lines, git interleaved them, and **no conflict marker
 * was written**. `main` ended the day with ten duplicated keys in the lockfile and five in
 * the manifest.
 *
 * The lockfile half was loud in the worst way: `pnpm` refuses to parse it, so every job
 * died at `Install dependencies` and every check after reported `skipped` — the shape ADR
 * 011 is about. The manifest half was silent, and is the reason this file exists. **JSON
 * permits duplicate keys.** `JSON.parse` takes the last one and reports nothing, so on
 * commit `4c7c5f6` every tool in the repository read `next: ^15.5.24` out of a manifest
 * that also said `^16.3.4`, beside a source tree written against Next 16.
 *
 * The fixtures below are the real bytes from those commits, reduced to the damaged blocks.
 * [ADR 024](../../../docs/adr/024-a-tool-never-pointed-at-a-known-answer.md): a tool that
 * has never been pointed at a known answer is a first draft.
 */

const ROOT = resolve(__dirname, '../../..')

/** Verbatim from `package.json` at `410e4d9`, the `dependencies` block. */
const DAMAGED_MANIFEST = `{
  "name": "healthy-jewelry",
  "dependencies": {
    "@upstash/ratelimit": "^2.1.0",
    "@upstash/redis": "^1.38.4",
    "clsx": "^2.1.1",
    "next": "^16.3.4",
    "react": "^19.2.8",
    "react-dom": "^19.2.8",
    "resend": "^6.24.0",
    "tailwind-merge": "^3.6.0",
    "next": "^15.5.24",
    "react": "^19.3.0",
    "react-dom": "^19.3.0",
    "resend": "^6.28.0",
    "tailwind-merge": "^3.7.0",
    "zustand": "^5.0.15"
  }
}`

describe('the manifest damage that shipped to main', () => {
  it('names all five duplicated keys', () => {
    const found = findDuplicateJsonKeys(DAMAGED_MANIFEST)
    expect(found.map((d) => d.key)).toEqual(['next', 'react', 'react-dom', 'resend', 'tailwind-merge'])
  })

  it('reports both lines, because which one wins is the whole question', () => {
    // `JSON.parse` takes the *last*. A reader looking only at the first would conclude the
    // repository was on Next 16. Naming one line without the other is half an answer.
    const next = findDuplicateJsonKeys(DAMAGED_MANIFEST).find((d) => d.key === 'next')
    expect(next).toMatchObject({ line: 12, firstLine: 7, path: ['dependencies'] })
  })

  it('agrees with what JSON.parse silently did', () => {
    // The assertion that makes the finding actionable rather than academic: the value the
    // whole toolchain read is the one on the *later* line.
    expect(JSON.parse(DAMAGED_MANIFEST).dependencies.next).toBe('^15.5.24')
  })

  it('places each duplicate under the object that owns it', () => {
    for (const d of findDuplicateJsonKeys(DAMAGED_MANIFEST)) {
      expect(d.path).toEqual(['dependencies'])
    }
  })
})

describe('the scanner is exact, not approximate', () => {
  it('finds nothing in a clean manifest', () => {
    // The control on the control. A scanner that reported duplicates everywhere would
    // "catch" the incident and be deleted within a week.
    expect(findDuplicateJsonKeys(readFileSync(join(ROOT, 'package.json'), 'utf8'))).toEqual([])
  })

  it('does not mistake a brace inside a string for an object', () => {
    const source = '{"a": "a value with { and } and \\"quotes\\"", "b": 1, "a": 2}'
    expect(findDuplicateJsonKeys(source).map((d) => d.key)).toEqual(['a'])
  })

  it('does not mistake a colon inside a string for a key separator', () => {
    const source = '{"scripts": {"dev": "next dev", "url": "https://example.com:3000"}}'
    expect(findDuplicateJsonKeys(source)).toEqual([])
  })

  it('treats the same name in two different objects as two different keys', () => {
    // `next` in `dependencies` and `next` in `devDependencies` is ordinary and common.
    // A scanner keyed on the name alone would fail every real manifest.
    const source = '{"dependencies": {"next": "^16"}, "devDependencies": {"next": "^16"}}'
    expect(findDuplicateJsonKeys(source)).toEqual([])
  })

  it('does not treat repeated keys in sibling array elements as duplicates', () => {
    const source = '{"items": [{"name": "a"}, {"name": "b"}]}'
    expect(findDuplicateJsonKeys(source)).toEqual([])
  })

  it('reports nothing for key-shaped text sitting directly inside an array', () => {
    // Malformed, and deliberately so: the input this tool exists for is a file **git
    // wrote**, and a text merge is under no obligation to produce valid JSON. The scanner
    // only collects keys whose enclosing frame is an object, so nonsense in an array
    // position produces no finding rather than a confident wrong one.
    //
    // This is also the assertion that keeps that check alive. Written with valid JSON the
    // guard is unobservable — array elements are comma-separated, so no string inside one
    // is ever followed by a colon — and an invariant nothing can falsify is documentation
    // wearing a test's clothes (ADR 020).
    expect(findDuplicateJsonKeys('{"a": ["x": 1, "x": 2]}')).toEqual([])
  })

  it('still sees a real duplicate that sits after a string containing an escaped quote', () => {
    // The dangerous direction, and the one that keeps escape handling alive. Stop honouring
    // `\"` and the scanner's idea of where strings begin drifts one quote out of step for
    // the rest of the file — so `x` and `x` stop looking like keys at all and the finding
    // is **silently lost**. A detector that under-reports on exactly the malformed input it
    // exists for is worse than none, because its green is taken as evidence.
    const source = '{"s": "a \\" b", "x": 1, "x": 2}'
    expect(JSON.parse(source)).toEqual({ s: 'a " b', x: 2 })
    expect(findDuplicateJsonKeys(source).map((d) => d.key)).toEqual(['x'])
  })

  it('does not read a key out of the inside of a string', () => {
    // The sharpest version of the tokeniser's reason to exist. This value *contains* the
    // text `"a": 1`, escaped. A scanner that stopped at the first unescaped-looking quote
    // would walk straight into it and report `a` twice — the regex failure mode, with a
    // confident line number attached.
    const source = '{"a": "x\\", \\"a\\": 1", "b": 2}'
    expect(JSON.parse(source)).toEqual({ a: 'x", "a": 1', b: 2 })
    expect(findDuplicateJsonKeys(source)).toEqual([])
  })

  it('finds a duplicate nested several levels down', () => {
    const source = '{"a": {"b": {"c": 1, "d": 2, "c": 3}}}'
    expect(findDuplicateJsonKeys(source)).toMatchObject([{ key: 'c', path: ['a', 'b'] }])
  })

  it('counts lines correctly across a multi-line string escape', () => {
    const source = '{\n  "a": "one\\ntwo",\n  "b": 1,\n  "a": 2\n}'
    expect(findDuplicateJsonKeys(source)[0]).toMatchObject({ key: 'a', line: 4, firstLine: 2 })
  })

  it('reports a key repeated three times twice, once per extra occurrence', () => {
    const source = '{"a": 1, "a": 2, "a": 3}'
    expect(findDuplicateJsonKeys(source)).toHaveLength(2)
  })

  it('finds nothing in an empty object', () => {
    expect(findDuplicateJsonKeys('{}')).toEqual([])
  })
})

// The range the real lockfile records for `next`, read from the manifest —
// 'this repository agrees with its own lockfile' holds the two equal. It was the literal
// `^16.3.4`, which made the upgrade to `^16.3.8` (GHSA-vcvr-r3jv-pc5j) fail two tests about
// something else entirely.
const lockedNext: string = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).dependencies.next

describe('manifest and lockfile are compared on the effective range', () => {
  const lockfile = readFileSync(join(ROOT, 'pnpm-lock.yaml'), 'utf8')

  it('this repository agrees with its own lockfile', () => {
    const manifest = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
    expect(compareSpecifiers(manifest, lockfile)).toMatchObject({ status: 'ok', divergences: [] })
  })

  it('catches the #68 and #73 divergence — the manifest moved and the lockfile did not', () => {
    // The literal failure that left `main` un-installable twice: `package.json` at
    // `^15.5.24` beside a lockfile resolving `^16.3.4`.
    const manifest = { dependencies: { next: '^15.5.24' } }
    const result = compareSpecifiers(manifest, lockfile)
    expect(result.status).toBe('divergent')
    expect(result.divergences).toContainEqual({
      name: 'next',
      manifest: '^15.5.24',
      lockfile: lockedNext,
      overridden: false,
    })
  })

  it('does not flag a package whose range pnpm.overrides replaces', () => {
    // The false positive the first draft shipped. `postcss` is declared `^8.5.28` and
    // overridden to `^8.5.23`; the lockfile records what was applied, and
    // `pnpm install --frozen-lockfile` is content. A check that called this a defect would
    // have been red on a correct repository, which is a check people mute.
    const manifest = {
      devDependencies: { postcss: '^8.5.28' },
      pnpm: { overrides: { postcss: '^8.5.23' } },
    }
    expect(compareSpecifiers(manifest, lockfile).status).toBe('ok')
  })

  it('still flags an overridden package when the override itself diverges', () => {
    // The paired positive. Exempting overridden packages outright would have been the
    // easy fix and would have blinded the check to the four ranges most worth watching —
    // the CVE floors in `pnpm.overrides`.
    const manifest = {
      devDependencies: { postcss: '^8.5.28' },
      pnpm: { overrides: { postcss: '^8.9.9' } },
    }
    const result = compareSpecifiers(manifest, lockfile)
    expect(result.status).toBe('divergent')
    expect(result.divergences).toContainEqual({
      name: 'postcss',
      manifest: '^8.9.9',
      lockfile: '^8.5.23',
      overridden: true,
    })
  })

  it('reports `unevaluable` rather than agreement when the lockfile shape is unfamiliar', () => {
    // ADR 010's separation of "failed" from "could not run". A format change must not
    // resolve to a green, which is what an empty comparison would produce.
    const result = compareSpecifiers({ dependencies: { next: '^16' } }, 'lockfileVersion: 9.0\n')
    expect(result.status).toBe('unevaluable')
    expect(result.reason).toMatch(/could not find/)
  })

  it('reports `unevaluable` when the manifest declares nothing', () => {
    expect(compareSpecifiers({}, lockfile).status).toBe('unevaluable')
  })

  it('reports `unevaluable` for an importers block that yields no entries', () => {
    // The near-miss the shape above hides. A lockfile with no `importers:` line at all is
    // the easy case; a lockfile that *has* one whose contents this scan cannot read is the
    // one that would quietly compare against an empty map and report perfect agreement —
    // a green derived from having found nothing, which is the shape of proof-free success
    // this repository keeps rediscovering.
    const result = compareSpecifiers({ dependencies: { next: '^16' } }, 'importers:\n  .:\n')
    expect(result.status).toBe('unevaluable')
  })

  it('ignores a lockfile entry with no counterpart in the manifest', () => {
    // A dependency removed from package.json but still recorded in a stale lockfile is a
    // different defect with a different owner (`pnpm install` prunes it). Reporting it
    // here would make this check's message wrong about what to do.
    expect(compareSpecifiers({ dependencies: { clsx: '^2.1.1' } }, lockfile).status).toBe('ok')
  })
})

describe('the probe itself, pointed at the bytes that shipped', () => {
  const lockfile = readFileSync(join(ROOT, 'pnpm-lock.yaml'), 'utf8')

  it('fails on the manifest main actually carried', () => {
    const verdict = audit(DAMAGED_MANIFEST, lockfile)
    expect(verdict.ok).toBe(false)
    expect(verdict.duplicates).toHaveLength(5)
    expect(exitCode(verdict)).toBe(1)
  })

  it('passes on this repository as it stands', () => {
    const verdict = audit(readFileSync(join(ROOT, 'package.json'), 'utf8'), lockfile)
    expect(verdict.ok).toBe(true)
    expect(exitCode(verdict)).toBe(0)
  })

  it('separates "could not run" from "ran and failed"', () => {
    // ADR 010. A format change that makes the comparison impossible must not exit 0, and
    // must not be filed under the same number as a real finding either.
    const verdict = audit('{"dependencies":{"next":"^16"}}', 'lockfileVersion: 9.0\n')
    expect(verdict.specifiers.status).toBe('unevaluable')
    expect(exitCode(verdict)).toBe(2)
  })

  it('tells the reader which occurrence won, and how to fix it', () => {
    // The message is the deliverable. A duplicate-key report that did not say `JSON.parse`
    // takes the last one leaves the reader to guess which version their toolchain read,
    // and a report that said "edit the lockfile" would be actively harmful.
    const text = render(audit(DAMAGED_MANIFEST, lockfile)).join('\n')
    expect(text).toContain('dependencies.next — line 12, first declared on line 7')
    expect(text).toMatch(/takes the \*\*last\*\* occurrence/)
    expect(text).toMatch(/pnpm install --no-frozen-lockfile/)
    expect(text, 'the remedy must never be "edit the lockfile"').not.toMatch(/edit the lockfile/i)
  })

  it('says nothing about duplicates when there are none', () => {
    // Paired negative: a renderer that always printed the remedy would train readers to
    // skip it on the run where it matters.
    const text = render(audit(readFileSync(join(ROOT, 'package.json'), 'utf8'), lockfile)).join('\n')
    expect(text).not.toMatch(/first declared on line/)
    expect(text).toContain('✓ package.json declares each key once')
  })

  it('names the package and both versions when the two files diverge', () => {
    const text = render(audit('{"dependencies":{"next":"^15.5.24"}}', lockfile)).join('\n')
    expect(text).toContain(`next: package.json says ^15.5.24, lockfile says ${lockedNext}`)
  })
})

describe('the audit runs against this repository and passes', () => {
  it('exits 0 with both questions answered', () => {
    // The end-to-end assertion. Everything above tests the decision; this tests that the
    // transport around it reads the real files and reaches the real verdict — the gap
    // ADR 030 is about.
    const out = execFileSync(
      process.execPath,
      [join(ROOT, 'scripts/audit-manifest-integrity.mjs'), '--json'],
      { cwd: ROOT, encoding: 'utf8' }
    )
    expect(JSON.parse(out)).toMatchObject({
      ok: true,
      findings: 0,
      markers: { manifest: [], lockfile: [] },
      duplicates: [],
      lockfile: { status: 'ok', duplicates: [] },
      specifiers: { status: 'ok' },
    })
  })
})

describe('ci.yml asks the question before pnpm install, not after', () => {
  /**
   * The placement is the control. Both files were damaged on the same day, so a check
   * sitting after `pnpm install` would not have run on either commit — the install is
   * exactly what the damage breaks.
   */
  const workflow = readFileSync(join(ROOT, '.github/workflows/ci.yml'), 'utf8')
  const verify = workflow.slice(
    workflow.indexOf('  verify:'),
    workflow.indexOf('  dependency-scope:')
  )
  const auditAt = verify.indexOf('audit-manifest-integrity.mjs')
  const installAt = verify.indexOf('pnpm install --frozen-lockfile')

  it('the verify job runs the audit', () => {
    expect(auditAt, 'ci.yml no longer runs scripts/audit-manifest-integrity.mjs').toBeGreaterThan(-1)
  })

  it('runs it before the install it protects', () => {
    expect(installAt).toBeGreaterThan(-1)
    expect(
      auditAt,
      'The manifest audit now runs after `pnpm install`. On the commit that motivated it ' +
        'the install itself failed, so a check in that position would not have run at all ' +
        'and every check after would have reported `skipped` (ADR 011).'
    ).toBeLessThan(installAt)
  })
})

/*
 * ─── The lockfile half (ADR 046) ─────────────────────────────────────────────────────────
 *
 * ADR 031 left duplicate keys in `pnpm-lock.yaml` to pnpm, because pnpm refuses such a file
 * loudly. On 2026-10-03 the step named "Manifest and lockfile integrity" printed two ticks
 * and exited 0 on PR #101, one line above the install that died on ten of them.
 */

/**
 * Verbatim from `pnpm-lock.yaml` at `ed7594a` — PR #101's merge of `main`, resolved in GitHub's
 * conflict editor by keeping both sides — reduced to two of its ten damaged blocks: real lines
 * 1–2, 13–15, 44, 81–87, 3461–3463 and 6745–6754. pnpm's own report on the full file was
 * `duplicated mapping key (84:9)`: the second `version` below.
 */
const DAMAGED_LOCKFILE_PR101 = `lockfileVersion: '9.0'

importers:

  .:
    devDependencies:
      '@vitejs/plugin-react':
        specifier: ^4.7.0
        version: 4.7.0(vite@6.4.3(@types/node@26.6.1)(jiti@2.7.0)(lightningcss@1.33.0)(terser@5.51.2)(yaml@2.9.1))
        version: 4.7.0(vite@6.4.3(@types/node@26.6.2)(jiti@2.7.0)(lightningcss@1.33.0)(yaml@2.9.1))
      '@vitest/coverage-v8':
        specifier: ^3.2.7
        version: 3.2.7(vitest@3.2.7)

snapshots:

  vite-node@3.2.4(@types/node@26.6.2)(jiti@2.7.0)(lightningcss@1.33.0)(yaml@2.9.1):
    dependencies:
      cac: 6.7.14
      debug: 4.4.3
      es-module-lexer: 1.7.0
      pathe: 2.0.3
      vite: 6.4.3(@types/node@26.6.1)(jiti@2.7.0)(lightningcss@1.33.0)(terser@5.51.2)(yaml@2.9.1)
      vite: 6.4.3(@types/node@26.6.2)(jiti@2.7.0)(lightningcss@1.33.0)(yaml@2.9.1)
    transitivePeerDependencies:
      - '@types/node'
`

/**
 * Verbatim from `pnpm-lock.yaml` at `1c0419c` — the merge of `main` into Dependabot PR #72, the
 * first incident (ADR 031) — reduced to its first damaged block: real lines 1–2, 13–15, 44 and 57–66.
 * pnpm's report on the full file was `duplicated mapping key (63:9)`.
 */
const DAMAGED_LOCKFILE_PR72 = `lockfileVersion: '9.0'

importers:

  .:
    devDependencies:
      '@testing-library/jest-dom':
        specifier: ^7.0.1
        version: 7.0.1(@testing-library/dom@10.4.1)(vitest@3.2.7)
      '@testing-library/react':
        specifier: ^16.3.3
        version: 16.3.3(@testing-library/dom@10.4.1)(@types/react-dom@19.2.5(@types/react@19.2.18))(@types/react@19.2.18)(react-dom@19.2.8(react@19.2.8))(react@19.2.8)
        specifier: ^16.3.2
        version: 16.3.2(@testing-library/dom@10.4.1)(@types/react-dom@19.3.0(@types/react@19.3.0))(@types/react@19.3.0)(react-dom@19.3.0(react@19.3.0))(react@19.3.0)
      '@testing-library/user-event':
        specifier: ^14.6.7
`

/** The duplicates as YAML itself counts them: the reference the scanner is held to. */
function referenceDuplicateLines(source: string): number[] {
  return parseDocument(source, { uniqueKeys: true })
    .errors.filter((e) => e.code === 'DUPLICATE_KEY')
    .map((e) => e.linePos?.[0]?.line ?? -1)
}

describe('pnpm-lock.yaml duplicate keys, pointed at the bytes that broke', () => {
  it('finds both duplicates the PR #101 resolution wrote, where pnpm found the first', () => {
    const result = findDuplicateLockfileKeys(DAMAGED_LOCKFILE_PR101)
    expect(result.status).toBe('ok')
    expect(result.duplicates).toEqual([
      {
        key: 'version',
        line: 10,
        firstLine: 9,
        path: ['importers', '.', 'devDependencies', '@vitejs/plugin-react'],
      },
      {
        key: 'vite',
        line: 24,
        firstLine: 23,
        path: [
          'snapshots',
          'vite-node@3.2.4(@types/node@26.6.2)(jiti@2.7.0)(lightningcss@1.33.0)(yaml@2.9.1)',
          'dependencies',
        ],
      },
    ])
    // Column 9 is where pnpm pointed (`84:9` on the full file): the key after 8 spaces.
    expect(DAMAGED_LOCKFILE_PR101.split('\n')[9].indexOf('version') + 1).toBe(9)
  })

  it('finds both duplicates in the first incident too', () => {
    const result = findDuplicateLockfileKeys(DAMAGED_LOCKFILE_PR72)
    expect(result.duplicates.map((d: { key: string; line: number; firstLine: number }) => [d.key, d.line, d.firstLine])).toEqual([
      ['specifier', 13, 11],
      ['version', 14, 12],
    ])
  })

  it('agrees with a real YAML parser on both fixtures', () => {
    for (const fixture of [DAMAGED_LOCKFILE_PR101, DAMAGED_LOCKFILE_PR72]) {
      expect(findDuplicateLockfileKeys(fixture).duplicates).toHaveLength(referenceDuplicateLines(fixture).length)
    }
  })

  it("finds nothing in this repository's lockfile, and neither does the reference", () => {
    const lockfile = readFileSync(join(ROOT, 'pnpm-lock.yaml'), 'utf8')
    expect(findDuplicateLockfileKeys(lockfile)).toEqual({ status: 'ok', duplicates: [] })
    expect(referenceDuplicateLines(lockfile)).toEqual([])
  })

  it(
    'agrees with a real YAML parser on seeded mutations of the real lockfile',
    () => {
      /*
       * ADR 007: a hand-written scanner has unknown coverage until something measures it.
       * This measures it against the `yaml` package on the shapes this repository's lockfile
       * actually contains — a corpus cut from the real file at entry boundaries, so every
       * line shape pnpm writes is present — under three mutations: a key line duplicated in
       * place, a key renamed to its preceding sibling's name (always a duplicate), and a key
       * renamed to a fresh one (never). Duplicates are compared as (first, second) pairs,
       * because for a duplicated block key `yaml` reports the first line and this scanner
       * the second; both identify the same pair.
       */
      const lines = readFileSync(join(ROOT, 'pnpm-lock.yaml'), 'utf8').split('\n')
      const cut = (header: string, count: number) => {
        const start = lines.indexOf(header)
        expect(start, `${header} is missing from pnpm-lock.yaml`).toBeGreaterThan(-1)
        let end = Math.min(lines.length, start + count)
        while (end < lines.length && lines[end] !== '') end++
        return lines.slice(start, end + 1)
      }
      const corpusLines = [...lines.slice(0, lines.indexOf('packages:')), ...cut('packages:', 350), ...cut('snapshots:', 350)]
      const corpus = corpusLines.join('\n')
      // The corpus has to contain the shapes the scanner claims to read, or agreement on it
      // would prove nothing about them.
      expect(corpus).toMatch(/^ {6}- \S/m) // a plain-scalar sequence item
      expect(corpus).toMatch(/: \{[^}]*\}$/m) // a single-line flow mapping
      expect(corpus).toMatch(/: \[[^\]]*\]$/m) // a single-line flow sequence
      expect(corpus).toMatch(/^ {2}'@/m) // a quoted key
      expect(findDuplicateLockfileKeys(corpus)).toEqual({ status: 'ok', duplicates: [] })
      expect(referenceDuplicateLines(corpus)).toEqual([])

      let seed = 20261004
      const random = () => {
        seed = (seed + 0x6d2b79f5) | 0
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
      }
      const indentOf = (line: string) => line.length - line.trimStart().length
      const keyOf = (line: string) => {
        const content = line.trimStart()
        return content.startsWith("'") ? content.slice(0, content.indexOf("':") + 1) : content.slice(0, content.search(/:( |$)/))
      }
      const keyLines = corpusLines
        .map((line, i) => (line.trim() && !line.trimStart().startsWith('- ') && /:( |$)/.test(line) ? i : -1))
        .filter((i) => i >= 0)

      const tally = { mutations: 0, withDuplicate: 0, agreed: 0 }
      for (let n = 0; tally.mutations < 120; n++) {
        const i = keyLines[Math.floor(random() * keyLines.length)]
        const kind = (['in-place', 'to-sibling', 'fresh'] as const)[n % 3]
        const mutated = corpusLines.slice()
        if (kind === 'in-place') {
          mutated.splice(i + 1, 0, corpusLines[i])
        } else {
          let sibling: number | null = null
          for (let j = i - 1; j >= 0; j--) {
            if (!corpusLines[j].trim()) continue
            const depth = indentOf(corpusLines[j])
            if (depth < indentOf(corpusLines[i])) break
            if (depth === indentOf(corpusLines[i]) && !corpusLines[j].trimStart().startsWith('- ')) {
              sibling = j
              break
            }
          }
          if (kind === 'to-sibling' && sibling === null) continue
          const name = kind === 'fresh' ? `zz-mutant-${n}` : keyOf(corpusLines[sibling as number])
          mutated[i] = ' '.repeat(indentOf(corpusLines[i])) + name + corpusLines[i].trimStart().slice(keyOf(corpusLines[i]).length)
        }
        const source = mutated.join('\n')
        const ours = findDuplicateLockfileKeys(source)
        const reference = referenceDuplicateLines(source)
        tally.mutations++
        expect(ours.status, `mutation ${n} (${kind}, line ${i + 1}) made the scanner give up: ${ours.reason}`).toBe('ok')
        expect(
          ours.duplicates.length,
          `mutation ${n} (${kind}, line ${i + 1}): scanner found ${ours.duplicates.length}, yaml found ${reference.length}`
        ).toBe(reference.length)
        for (const d of ours.duplicates as Array<{ line: number; firstLine: number }>) {
          expect(reference.includes(d.line) || reference.includes(d.firstLine), `mutation ${n}: pair ${d.firstLine}/${d.line} not in ${reference}`).toBe(true)
        }
        if (reference.length > 0) tally.withDuplicate++
        tally.agreed++
      }
      // Both directions were exercised, or "agreed" could mean "never saw a duplicate".
      expect(tally.withDuplicate).toBeGreaterThanOrEqual(60)
      expect(tally.mutations - tally.withDuplicate).toBeGreaterThanOrEqual(30)
    },
    { timeout: 60_000 }
  )

  it('treats a quoted and a plain spelling as the same key, as YAML does', () => {
    const source = "packages:\n  'clsx@2.1.1':\n    resolution: {integrity: a}\n  clsx@2.1.1:\n    resolution: {integrity: b}\n"
    expect(findDuplicateLockfileKeys(source).duplicates).toMatchObject([{ key: 'clsx@2.1.1', line: 4, firstLine: 2 }])
    expect(referenceDuplicateLines(source)).toHaveLength(1)
  })

  it('does not call the same key under two parents a duplicate, or a repeated sequence item a key', () => {
    const source = [
      'snapshots:',
      '  a@1.0.0:',
      '    dependencies:',
      '      vite: 6.4.3',
      '    transitivePeerDependencies:',
      "      - '@types/node'",
      "      - '@types/node'",
      '  b@1.0.0:',
      '    dependencies:',
      '      vite: 6.4.3',
      '',
    ].join('\n')
    expect(findDuplicateLockfileKeys(source)).toEqual({ status: 'ok', duplicates: [] })
    expect(referenceDuplicateLines(source)).toEqual([])
  })

  it.each([
    ['a block scalar', 'packages:\n  a@1:\n    note: |\n      text\n', 3],
    ['an anchor', 'packages:\n  a@1: &shared\n    x: 1\n', 2],
    ['an alias', 'packages:\n  a@1:\n    x: *shared\n', 3],
    ['a merge key', 'packages:\n  a@1:\n    <<: {x: 1}\n', 3],
    ['a flow collection spanning lines', 'packages:\n  a@1:\n    resolution: {integrity:\n      sha512-x}\n', 3],
    ['a tab in the indentation', 'packages:\n\ta@1:\n', 2],
    ['a mapping inside a sequence', 'packages:\n  a@1:\n    list:\n      - name: x\n', 4],
    ['an indentation nothing opened', 'packages:\n  a@1: 1.0.0\n    b: 2\n', 3],
    ['a dedent to an unused indentation', 'packages:\n    a@1:\n      x: 1\n  b@1:\n', 4],
    ['a sequence item after a key that already has a value', 'packages:\n  a@1: 1.0.0\n    - x\n', 3],
  ])('says it could not run on %s, never "ok"', (_shape, source, line) => {
    const result = findDuplicateLockfileKeys(source)
    expect(result.status).toBe('unevaluable')
    expect(result.line).toBe(line)
    expect(result.reason).toMatch(/could not run/)
  })
})

describe('conflict markers', () => {
  it('finds each kind git writes, at the start of a line only', () => {
    const source = ['<<<<<<< ours', 'a: 1', '||||||| base', '=======', 'a: 2', '>>>>>>> theirs', '  =======', 'x: "======="'].join('\n')
    expect(findConflictMarkers(source)).toEqual([
      { line: 1, marker: '<<<<<<<' },
      { line: 3, marker: '|||||||' },
      { line: 4, marker: '=======' },
      { line: 6, marker: '>>>>>>>' },
    ])
  })

  it('reports a manifest carrying markers instead of throwing on it', () => {
    // Before 2026-10-04 `JSON.parse` threw out of the probe: a stack trace, not a verdict.
    const manifest = '{\n<<<<<<< HEAD\n  "name": "a"\n=======\n  "name": "b"\n>>>>>>> main\n}\n'
    const lockfile = readFileSync(join(ROOT, 'pnpm-lock.yaml'), 'utf8')
    const verdict = audit(manifest, lockfile)
    expect(verdict.ok).toBe(false)
    expect(verdict.markers.manifest).toHaveLength(3)
    expect(exitCode(verdict)).toBe(1)
    expect(render(verdict).join('\n')).toContain('✗ neither file carries a conflict marker')
  })

  it('reports a lockfile carrying markers as a finding, not as "could not run"', () => {
    const lockfile = `lockfileVersion: '9.0'\n<<<<<<< HEAD\nimporters: {}\n=======\nimporters: {}\n>>>>>>> main\n`
    const verdict = audit(readFileSync(join(ROOT, 'package.json'), 'utf8'), lockfile)
    expect(verdict.markers.lockfile).toHaveLength(3)
    expect(exitCode(verdict)).toBe(1)
  })
})

describe('the probe, pointed at the PR #101 lockfile', () => {
  const manifest = readFileSync(join(ROOT, 'package.json'), 'utf8')

  it('fails, where it printed two ticks on 2026-10-03', () => {
    const verdict = audit(manifest, DAMAGED_LOCKFILE_PR101)
    expect(verdict.ok).toBe(false)
    expect(verdict.lockfile.duplicates).toHaveLength(2)
    expect(exitCode(verdict)).toBe(1)
  })

  it('names each duplicate by its path, and gives a remedy that regenerates rather than edits', () => {
    const text = render(audit(manifest, DAMAGED_LOCKFILE_PR101)).join('\n')
    expect(text).toContain('✗ pnpm-lock.yaml declares each key once')
    expect(text).toContain('importers > . > devDependencies > @vitejs/plugin-react > version — line 10, first declared on line 9')
    expect(text).toContain('ERR_PNPM_BROKEN_LOCKFILE')
    expect(text).toContain('git checkout origin/main -- pnpm-lock.yaml && pnpm install --lockfile-only')
    expect(text).toContain('docs/runbooks/lockfile-conflicts.md')
    expect(text, 'the remedy must never be "edit the lockfile"').not.toMatch(/edit the lockfile/i)
  })

  it('says nothing about lockfile duplicates when there are none', () => {
    const text = render(audit(manifest, readFileSync(join(ROOT, 'pnpm-lock.yaml'), 'utf8'))).join('\n')
    expect(text).toContain('✓ pnpm-lock.yaml declares each key once')
    expect(text).not.toContain('ERR_PNPM_BROKEN_LOCKFILE')
  })
})

describe('.gitattributes: git never text-merges the lockfile', () => {
  /*
   * The prevention, as opposed to the detection above. Both incidents were a text conflict in
   * the lockfile resolved by keeping both sides of every hunk (7 hunks on PR #72, 20 on PR
   * #101). With `merge=binary` git refuses to text-merge the file at all: it keeps the current
   * branch's copy, writes no markers, and marks the path conflicted, so there is nothing to
   * keep both of. Asserted as behaviour — a real three-way merge — and paired with the same
   * merge without the attribute, so the test proves the attribute is what changes the outcome.
   */
  it('git resolves the attribute for pnpm-lock.yaml, and only for it', () => {
    const attr = (path: string) =>
      execFileSync('git', ['check-attr', 'merge', '--', path], { cwd: ROOT, encoding: 'utf8' }).trim()
    expect(attr('pnpm-lock.yaml')).toBe('pnpm-lock.yaml: merge: binary')
    expect(attr('package.json')).toBe('package.json: merge: unspecified')
  })

  function mergeAdjacentLockfileChanges(withAttribute: boolean) {
    const dir = mkdtempSync(join(tmpdir(), 'hj-lockfile-merge-'))
    const git = (...args: string[]) =>
      spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.invalid', '-c', 'init.defaultBranch=main', ...args], {
        cwd: dir,
        encoding: 'utf8',
      })
    try {
      git('init', '-q')
      if (withAttribute) writeFileSync(join(dir, '.gitattributes'), readFileSync(join(ROOT, '.gitattributes'), 'utf8'))
      const base = DAMAGED_LOCKFILE_PR72.split('\n').filter((_, i) => i !== 12 && i !== 13).join('\n')
      writeFileSync(join(dir, 'pnpm-lock.yaml'), base)
      git('add', '-A')
      git('commit', '-qm', 'base')
      git('checkout', '-qb', 'side')
      writeFileSync(join(dir, 'pnpm-lock.yaml'), base.replace('specifier: ^16.3.3', 'specifier: ^16.3.2'))
      git('commit', '-qam', 'side')
      git('checkout', '-q', 'main')
      writeFileSync(join(dir, 'pnpm-lock.yaml'), base.replace('specifier: ^16.3.3', 'specifier: ^16.3.4'))
      git('commit', '-qam', 'main')
      const merge = git('merge', '--no-edit', 'side')
      return {
        status: merge.status,
        output: `${merge.stdout}${merge.stderr}`,
        file: readFileSync(join(dir, 'pnpm-lock.yaml'), 'utf8'),
        ours: base.replace('specifier: ^16.3.3', 'specifier: ^16.3.4'),
      }
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }

  it('without it, git writes markers a person can "accept both" of', () => {
    const result = mergeAdjacentLockfileChanges(false)
    expect(result.status).not.toBe(0)
    expect(findConflictMarkers(result.file).length).toBeGreaterThan(0)
  })

  it('with it, git refuses the text merge and leaves nothing to keep both of', () => {
    const result = mergeAdjacentLockfileChanges(true)
    expect(result.status).not.toBe(0)
    expect(result.output).toContain('Cannot merge binary files: pnpm-lock.yaml')
    expect(findConflictMarkers(result.file)).toEqual([])
    expect(result.file).toBe(result.ours)
  })
})
