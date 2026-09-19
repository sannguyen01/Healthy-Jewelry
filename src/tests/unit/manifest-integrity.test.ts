import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const { findDuplicateJsonKeys, compareSpecifiers } = await import(
  '../../../scripts/lib/manifest-integrity.mjs'
)
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
      lockfile: '^16.3.4',
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
    expect(text).toContain('next: package.json says ^15.5.24, lockfile says ^16.3.4')
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
      duplicates: [],
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
