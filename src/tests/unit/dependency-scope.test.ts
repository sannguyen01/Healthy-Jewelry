import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { parse } from 'yaml'

const {
  classifyManifestChange,
  escalationMajors,
  isEscalated,
  majorOf,
  hasWrittenRationale,
  requiresRationale,
  resolvePrBody,
  unusedDependencies,
  importedSpecifiersUnder,
  NOT_IMPORTED_BY_DESIGN,
} = await import('../../../scripts/audit-dependency-scope.mjs')

/**
 * **The judgement PR #61 made once, made repeatable.**
 *
 * PR #60 proposed `next` 15.5.24 → 16.3.3 to close two Critical RCEs. The advisory was
 * real; riding along with it was a framework major this repository had never compiled,
 * linted or tested against — the same class of change as the `eslint-config-next` 16.x and
 * `@vitejs/plugin-react` 6.x bumps that landed unverified on 2026-08-29 and left `main`
 * unbuildable for a day.
 *
 * PR #61 patched the CVE *inside* `next@15` and declined the major. That was right, and it
 * depended on a person reading a diff carefully while a Critical advisory was applying
 * pressure to merge fast. `loop-constraints.md` had required exactly this in prose for
 * weeks, addressed to a loop, read by nobody with the power to stop a merge.
 *
 * The two real pull requests are the fixtures, per
 * [ADR 024](../../../docs/adr/024-a-tool-never-pointed-at-a-known-answer.md): a tool that
 * has never been pointed at a known answer is a first draft. The version strings below are
 * verbatim from those manifests.
 */

const ROOT = resolve(__dirname, '../../..')
const constraints = readFileSync(join(ROOT, 'loop-constraints.md'), 'utf8')
const majors = escalationMajors(constraints)

/** The manifests either side of PR #61 — a patch bump inside the current major. */
const PR61_BASE = { dependencies: { next: '^15.5.23' } }
const PR61_HEAD = { dependencies: { next: '^15.5.24' } }

/** The manifests either side of PR #60 — the same advisory, with a major attached. */
const PR60_BASE = { dependencies: { next: '^15.5.24' } }
const PR60_HEAD = { dependencies: { next: '^16.3.3' } }

const RATIONALE = [
  '## Rationale',
  '',
  'Next 16 is required for the App Router change described in the linked issue, and the',
  'full E2E suite has been run against it on this branch.',
].join('\n')

describe('the escalation list was found', () => {
  it('reads the fence from loop-constraints.md', () => {
    // An empty list makes every assertion below vacuously true and, worse, makes the real
    // script pass everything while reporting green. The script exits 2 on this; here it is
    // the first thing asserted.
    expect(majors.length, 'no ```escalation-majors``` fence in loop-constraints.md').toBeGreaterThan(0)
  })

  it('carries the four names the rule has always named', () => {
    expect(majors).toEqual(['next', 'react', 'react-dom'])
  })

  it('the prose above the fence still describes what the fence does', () => {
    // The fence and the sentence introducing it are two statements of one rule, and the
    // `gate.yaml` mirror drifted from its prose for exactly as long as nothing compared
    // them. See ADR 019.
    expect(constraints).toMatch(/major-version bumps in the packages below/i)
    expect(constraints).toMatch(/written rationale/i)
  })
})

describe('a scope pattern matches what it says it matches', () => {
  it('matches an exact name', () => {
    expect(isEscalated('next', majors)).toBe(true)
    expect(isEscalated('nextjs-fake', majors)).toBe(false)
  })

  it('matches a whole scope through the trailing star', () => {
    // Was `@shopify/hydrogen-react`, which the escalation list used to carry. It is now
    // forbidden outright by COMMERCE-ELIMINATION-CONTRACT.md §5 rather than escalated on a
    // major bump, so the wildcard case needs a package that could legitimately arrive.
    expect(isEscalated('react-dom', majors)).toBe(true)
  })

  it('does not match an unlisted package', () => {
    // framer-motion 11 → 13 landed unverified during the blackout and was genuinely not on
    // this list. The rule names four packages; widening it silently would be a different
    // decision, taken by a test.
    //
    // It is no longer a dependency at all — `unusedDependencies` below is what removed it,
    // and the two facts are worth holding apart. The escalation list was never wrong about
    // framer-motion; it simply had nothing to say about a package that should not have been
    // installed. A second question, not a correction to this one.
    expect(isEscalated('framer-motion', majors)).toBe(false)
  })
})

/**
 * **A dependency's cost is not only what it ships.**
 *
 * `framer-motion` sat in `dependencies` with zero import sites under `src/`, in either of
 * its package names. It contributed **0 bytes** to the client bundle — Next tree-shakes an
 * unimported package entirely, and the build's 103 kB shared chunk was identical before and
 * after removal. Every cost it had was somewhere the bundle does not measure:
 *
 * | Cost | Measured |
 * |---|---|
 * | node_modules | 5.9 MB, 3 transitive packages |
 * | dependabot pull requests | 2 (#53, #67) |
 * | major-version decisions | 1 — a **two-major** jump merged unverified during the 2026-08-29 blackout |
 * | CVE surface | permanent, for code that never executes |
 *
 * That is why the check is here rather than in a bundle analyser: the bundle was the one
 * place this was invisible.
 */
describe('unusedDependencies finds what the bundle cannot', () => {
  it('flags a production dependency nothing imports', () => {
    const result = unusedDependencies({ 'ghost-lib': '^1.0.0' }, ['react', 'next'], {})
    expect(result.ok).toBe(false)
    expect(result.unused).toEqual(['ghost-lib'])
    expect(result.summary).toContain('ghost-lib')
  })

  it('passes a dependency that is imported', () => {
    const result = unusedDependencies({ zustand: '^5.0.0' }, ['zustand'], {})
    expect(result.ok).toBe(true)
    expect(result.unused).toEqual([])
  })

  it('counts a subpath import as a use of the package', () => {
    // `next/font/google` is how this repository imports `next` most often. Matching the
    // full specifier would flag `next` itself as unused, which is the false positive that
    // kills a checker on its first run.
    const result = unusedDependencies({ next: '^15.5.24' }, ['next/font/google'], {})
    expect(result.ok).toBe(true)
  })

  it('keeps both segments of a scoped package', () => {
    const result = unusedDependencies(
      { '@upstash/redis': '^1.38.3' },
      ['@upstash/redis/cloudflare'],
      {}
    )
    expect(result.ok).toBe(true)
  })

  it('does not let one scoped package vouch for another in the same scope', () => {
    // `@upstash/ratelimit` being imported says nothing about `@upstash/redis`. Truncating
    // to the scope would have made every package under a scope mutually exempt.
    const result = unusedDependencies(
      { '@upstash/redis': '^1.38.3' },
      ['@upstash/ratelimit'],
      {}
    )
    expect(result.ok).toBe(false)
    expect(result.unused).toEqual(['@upstash/redis'])
  })

  it('exempts an allowlisted package, and the allowlist carries reasons', () => {
    const result = unusedDependencies({ 'react-dom': '^19.2.8' }, [], NOT_IMPORTED_BY_DESIGN)
    expect(result.ok).toBe(true)

    // A bare list would be a list nobody could audit. Every exemption states why, or it is
    // indistinguishable from an oversight (ADR 019).
    for (const [name, reason] of Object.entries(NOT_IMPORTED_BY_DESIGN)) {
      expect((reason as string).length, `${name} is exempt with no stated reason`).toBeGreaterThan(30)
    }
  })

  it('reports cleanly when there is nothing to report', () => {
    const result = unusedDependencies({}, [], {})
    expect(result.ok).toBe(true)
    expect(result.summary).toContain('0 production dependencies')
  })
})

describe('the real manifest has no unused production dependency', () => {
  it('every dependency in package.json is imported or exempt', () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>
    }
    const result = unusedDependencies(
      pkg.dependencies ?? {},
      importedSpecifiersUnder(join(ROOT, 'src'))
    )
    expect(result.ok, result.summary).toBe(true)
  })
})

describe('majorOf reads a range, or admits it cannot', () => {
  it.each([
    ['^15.5.24', 15],
    ['~16.0.0', 16],
    ['16.3.3', 16],
    ['>=22.0.0', 22],
    ['v4.7.0', 4],
  ])('%s → %i', (range, expected) => {
    expect(majorOf(range as string)).toBe(expected)
  })

  it.each(['workspace:*', 'latest', 'github:org/repo', '*'])('%s is unreadable, not zero', (range) => {
    // Returning 0 would make every subsequent change to such a range look like a major
    // bump, and a check that cries wolf on `workspace:*` is a check people turn off.
    expect(majorOf(range)).toBe(null)
  })
})

describe('PR #61 — the CVE patched inside the current major', () => {
  const changes = classifyManifestChange(PR61_BASE, PR61_HEAD)

  it('classifies the bump as within-major', () => {
    expect(changes).toEqual([
      { name: 'next', field: 'dependencies', from: '^15.5.23', to: '^15.5.24', bump: 'within-major' },
    ])
  })

  it('passes with no rationale at all', () => {
    // The whole point. A security patch inside the current major must not need a ceremony
    // to land — making it harder is how the bundled major starts looking attractive.
    const result = requiresRationale({ changes, majors, prBody: '' })
    expect(result.ok).toBe(true)
    expect(result.flagged).toEqual([])
  })
})

describe('PR #60 — the same advisory with a framework major attached', () => {
  const changes = classifyManifestChange(PR60_BASE, PR60_HEAD)

  it('classifies the bump as major', () => {
    expect(changes[0]).toMatchObject({ name: 'next', from: '^15.5.24', to: '^16.3.3', bump: 'major' })
  })

  it('is blocked when the description says nothing', () => {
    const result = requiresRationale({ changes, majors, prBody: '' })
    expect(result.ok).toBe(false)
    expect(result.flagged).toHaveLength(1)
    expect(result.summary).toContain('next ^15.5.24 → ^16.3.3')
  })

  it('is blocked by a dependabot changelog, which is not a rationale', () => {
    // Dependabot writes a long, entirely accurate body. Length is not the signal — a
    // deliberate statement under a heading is, because that is the thing that did not
    // happen on the eleven bumps merged during the blackout.
    const result = requiresRationale({
      changes,
      majors,
      prBody: 'Bumps [next](https://github.com/vercel/next.js) from 15.5.24 to 16.3.3.\n\n<details>\n<summary>Release notes</summary>\n\nLots of accurate detail about what changed upstream, none of it about this repository.\n</details>',
    })
    expect(result.ok).toBe(false)
  })

  it('passes when somebody writes the rationale down', () => {
    const result = requiresRationale({ changes, majors, prBody: RATIONALE })
    expect(result.ok).toBe(true)
    expect(result.justified).toBe(true)
  })

  it('is not satisfied by an empty heading', () => {
    // A box to tick is worse than no box: it launders the absence of a decision into the
    // appearance of one.
    expect(hasWrittenRationale('## Rationale\n\n')).toBe(false)
    expect(hasWrittenRationale('## Rationale\n\nyes\n')).toBe(false)
  })
})

describe('changes this check deliberately lets through', () => {
  it('a major bump on an unlisted package', () => {
    const changes = classifyManifestChange(
      { devDependencies: { jsdom: '^25.0.1' } },
      { devDependencies: { jsdom: '^30.0.1' } }
    )
    expect(changes[0].bump).toBe('major')
    expect(requiresRationale({ changes, majors, prBody: '' }).ok).toBe(true)
  })

  it('a patch bump across every field', () => {
    const changes = classifyManifestChange(
      { dependencies: { next: '^15.5.23' }, devDependencies: { typescript: '^5.9.3' } },
      { dependencies: { next: '^15.5.24' }, devDependencies: { typescript: '^5.9.4' } }
    )
    expect(changes.every((c) => c.bump === 'within-major')).toBe(true)
    expect(requiresRationale({ changes, majors, prBody: '' }).ok).toBe(true)
  })

  it('an identical manifest produces no changes at all', () => {
    expect(classifyManifestChange(PR60_HEAD, PR60_HEAD)).toEqual([])
  })
})

describe('additions and removals are named, not classified as bumps', () => {
  it('a newly added escalation-listed package is reported as added', () => {
    // Adding `react` at 19 is not a major *bump*, and calling it one would be a claim the
    // manifest does not support. It is still reported, because a reviewer should see it.
    const changes = classifyManifestChange({}, { dependencies: { react: '^19.2.8' } })
    expect(changes[0]).toMatchObject({ name: 'react', bump: 'added' })
    expect(requiresRationale({ changes, majors, prBody: '' }).ok).toBe(true)
  })

  it('a removal is reported as removed', () => {
    const changes = classifyManifestChange({ dependencies: { react: '^19.2.8' } }, {})
    expect(changes[0]).toMatchObject({ name: 'react', bump: 'removed' })
  })
})

/**
 * **Which description did the check read?**
 *
 * ## The defect
 *
 * Every assertion above this block passed throughout the period during which this check
 * could not be cleared by any pull request that actually flagged a major. That is the
 * interesting part: the logic was right and the *input* was wrong, and no unit test of
 * the logic can see an input a workflow supplies. It also went unnoticed for the most
 * ordinary reason there is — between shipping on 2026-08-31 and PR #73 on 2026-09-18,
 * nothing tripped it, so the failing path was never walked.
 *
 * `PR_BODY` came from `${{ github.event.pull_request.body }}` — the description frozen
 * into the webhook payload at the moment the event fired. `pull_request` fires on
 * `opened`, `synchronize` and `reopened`; none of those is "somebody edited the
 * description", and a re-run replays the original payload verbatim. So the one action
 * this check's failure message asks for — write a `## Rationale` section — was an action
 * it could not observe. Not on save, because nothing fires. Not on re-run, because the
 * re-run reads the same frozen bytes.
 *
 * The only sequence that ever cleared it was *edit the description, then push a commit*,
 * which nobody would guess and nothing said. PR #73 is the worked example: the rationale
 * was written, `hasWrittenRationale` accepted it locally, and the check stayed red.
 *
 * A control that demands something it cannot observe is a claim about a control rather
 * than a control ([ADR 018](../../../docs/adr/018-a-claim-about-a-control-is-not-a-control.md)).
 * These tests pin both halves of the repair: the resolver's precedence and refusal
 * behaviour here, and the fact that `ci.yml` actually hands it the live body, below.
 */
describe('resolvePrBody reads the description that exists now', () => {
  it('prefers the file — the live body — over the frozen payload', () => {
    const resolved = resolvePrBody(
      { PR_BODY_FILE: '/tmp/body.md', PR_BODY: 'the description before the edit' },
      () => 'the description after the edit'
    )
    expect(resolved).toEqual({ body: 'the description after the edit', source: 'api' })
  })

  it('falls back to the payload when no file is named', () => {
    expect(resolvePrBody({ PR_BODY: '## Rationale\nbecause' }, () => 'unreachable')).toEqual({
      body: '## Rationale\nbecause',
      source: 'payload',
    })
  })

  it('treats an empty PR_BODY as a real, empty description rather than an absent one', () => {
    // `''` is what GitHub sends for a pull request opened with no description. It is an
    // answer, not a missing answer, and reporting it as `absent` would put a diagnostic
    // in the log that points at the workflow instead of at the contributor.
    expect(resolvePrBody({ PR_BODY: '' }, () => 'unreachable')).toEqual({
      body: '',
      source: 'payload',
    })
  })

  it('reports `absent` when neither variable is set', () => {
    expect(resolvePrBody({}, () => 'unreachable')).toEqual({ body: '', source: 'absent' })
  })

  it('ignores a PR_BODY_FILE that is blank or whitespace', () => {
    // An unset workflow output interpolates to the empty string rather than disappearing,
    // so `PR_BODY_FILE: ''` is the shape a half-wired step produces. Reading `''` as a
    // path would throw EISDIR or ENOENT and blame the contributor for it.
    for (const file of ['', '   ']) {
      expect(resolvePrBody({ PR_BODY_FILE: file, PR_BODY: 'payload' }, () => 'unreachable')).toEqual(
        { body: 'payload', source: 'payload' }
      )
    }
  })

  it('throws rather than reporting a broken fetch as a missing rationale', () => {
    // The distinction ADR 010 draws between "failed" and "could not run". Falling back to
    // `''` here would print "no written rationale" at somebody who had written one —
    // precisely the failure this whole change repairs, reintroduced one layer down.
    expect(() =>
      resolvePrBody({ PR_BODY_FILE: '/tmp/gone.md', PR_BODY: '' }, () => {
        throw new Error('ENOENT: no such file or directory')
      })
    ).toThrow(/cannot be read/)
  })

  it('names the unreadable file and says which kind of problem it is', () => {
    // A stack trace that says only "ENOENT" sends the reader to the audit script. The
    // message has to send them to the workflow step that was supposed to write the file.
    expect(() =>
      resolvePrBody({ PR_BODY_FILE: '/tmp/gone.md' }, () => {
        throw new Error('ENOENT')
      })
    ).toThrow(/\/tmp\/gone\.md[\s\S]*broken workflow step, not a missing rationale/)
  })

  it('does not fall back to the payload once a file has been named', () => {
    // The dangerous near-miss: a fetch that failed, a frozen payload that happens to
    // carry a stale rationale, and a check that goes green on the wrong evidence.
    expect(() =>
      resolvePrBody({ PR_BODY_FILE: '/tmp/gone.md', PR_BODY: RATIONALE }, () => {
        throw new Error('ENOENT')
      })
    ).toThrow()
  })

  it('reads process.env when called with no arguments', () => {
    // The production call site passes nothing. A resolver that only worked against an
    // injected object would be tested and unused.
    const previous = process.env.PR_BODY
    try {
      process.env.PR_BODY = '## Rationale\nread from the real environment'
      delete process.env.PR_BODY_FILE
      expect(resolvePrBody()).toEqual({
        body: '## Rationale\nread from the real environment',
        source: 'payload',
      })
    } finally {
      if (previous === undefined) delete process.env.PR_BODY
      else process.env.PR_BODY = previous
    }
  })

  it('accepts the CRLF line endings the API actually returns', () => {
    // GitHub normalises pull request bodies to `\r\n`, and this is the first time that
    // matters: the old path carried the same bytes, so nothing about the change is a
    // regression — but the read is new, and "the heading matched in the fixture" is not
    // evidence about "the heading matches what the API sends". `\s*$` absorbs the `\r`
    // before the multiline `$`, and `line.trim()` strips it off the prose beneath.
    const crlf = RATIONALE.split('\n').join('\r\n')
    expect(hasWrittenRationale(crlf)).toBe(true)

    const { body } = resolvePrBody({ PR_BODY_FILE: '/tmp/body.md' }, () => crlf)
    const changes = classifyManifestChange(PR60_BASE, PR60_HEAD)
    expect(requiresRationale({ changes, majors, prBody: body }).ok).toBe(true)
  })

  it('still rejects a CRLF heading with nothing under it', () => {
    // The paired negative. Without it the assertion above would also pass on a resolver
    // that returned `true` for every string containing the word "Rationale".
    expect(hasWrittenRationale('## Rationale\r\n\r\ntoo short\r\n')).toBe(false)
  })

  it('the resolved body is what requiresRationale then judges', () => {
    // End to end across the seam that broke: a rationale added after the last push, read
    // from the live file, clears a flagged major that the frozen payload would not have.
    const changes = classifyManifestChange(PR60_BASE, PR60_HEAD)
    const frozen = resolvePrBody({ PR_BODY: 'Bumps next from 15.5.24 to 16.3.3.' })
    const live = resolvePrBody({ PR_BODY_FILE: '/tmp/body.md' }, () => RATIONALE)

    expect(requiresRationale({ changes, majors, prBody: frozen.body }).ok).toBe(false)
    expect(requiresRationale({ changes, majors, prBody: live.body }).ok).toBe(true)
  })
})

describe('ci.yml hands the audit the live description, not the frozen one', () => {
  /**
   * Structural, not behavioural, and deliberately so. Nothing in a unit suite can make a
   * webhook fire, so the only thing assertable here is that the workflow still wires the
   * resolver to the API rather than to the event payload. That is exactly the line whose
   * silent reversion re-breaks the check, so it is the line worth pinning.
   *
   * **Read through the YAML parser, never as text.** The first draft of this block
   * grepped the file and failed on its own explanation: the comments above the step
   * *name* `github.event.pull_request.body` and `types: [… edited]` in order to say why
   * neither is used, and a text scan cannot tell a citation from a use. That is ADR 007's
   * unknown coverage arriving in the test rather than in the thing tested — and the
   * cheaper fix, deleting the comments, is the one that would have made the file worse.
   */
  const workflow = parse(readFileSync(join(ROOT, '.github/workflows/ci.yml'), 'utf8'))
  const job = workflow.jobs['dependency-scope']
  const steps: Array<{ name?: string; run?: string; env?: Record<string, string> }> = job.steps

  it('found the job to read', () => {
    // Without this, every assertion below is a statement about an empty array.
    expect(job.name).toBe('Dependency scope')
    expect(steps.length).toBeGreaterThanOrEqual(4)
  })

  it('no step is handed the frozen event payload', () => {
    const frozen = steps.flatMap((step) =>
      Object.entries(step.env ?? {})
        .filter(([, value]) => String(value).includes('github.event.pull_request.body'))
        .map(([key]) => `${step.name ?? '(unnamed)'} → ${key}`)
    )
    expect(
      frozen,
      'ci.yml is back to reading `github.event.pull_request.body`. That is the description ' +
        'frozen into the webhook payload: a rationale written in answer to this check is ' +
        'invisible to it, on save and on re-run alike, and the check becomes unsatisfiable ' +
        'by the action it asks for.'
    ).toEqual([])
  })

  it('fetches the body from the pull requests API and passes it on as a path', () => {
    const fetchStep = steps.find((step) => (step.run ?? '').includes('gh api'))
    expect(fetchStep, 'no step fetches the live description').toBeDefined()
    expect(fetchStep?.run).toMatch(/gh api "repos\/\$\{GITHUB_REPOSITORY\}\/pulls\/\$\{PR_NUMBER\}"/)
    expect(fetchStep?.run).toContain('PR_BODY_FILE=')
    expect(Object.keys(fetchStep?.env ?? {})).toEqual(
      expect.arrayContaining(['GH_TOKEN', 'PR_NUMBER'])
    )
  })

  it('runs the audit against that path', () => {
    const auditStep = steps.find((step) => (step.run ?? '').includes('audit-dependency-scope.mjs'))
    expect(auditStep?.run).toMatch(/--base "\$BASE_REF"/)
    expect(auditStep?.run).toMatch(/--head "\$HEAD_SHA"/)
  })

  it('holds the token scope that fetch needs, and no more', () => {
    // `permissions:` at job scope drops every scope it does not name, so the checkout's
    // `contents: read` has to be spelled out beside `pull-requests: read` or the job
    // cannot clone itself. Asserted as an exact object: a later `write` added here would
    // otherwise pass a containment check silently.
    expect(job.permissions).toEqual({ contents: 'read', 'pull-requests': 'read' })
  })

  it('never interpolates attacker-reachable text into a run: line', () => {
    // The body, the base ref and the head SHA all cross into the shell as quoted
    // environment variables. A `${{ }}` inside `run:` is string substitution performed
    // before bash ever sees the line, which is a shell injection with a friendly name.
    const interpolating = steps
      .filter((step) => (step.run ?? '').includes('${{'))
      .map((step) => step.name ?? '(unnamed)')
    expect(interpolating, `steps interpolating into run:\n${interpolating.join('\n')}`).toEqual([])
  })

  it('does not fire CI on a description edit', () => {
    // The smaller diff that was rejected, pinned so it is not reached for again.
    // `concurrency.cancel-in-progress` is keyed on the ref, so an `edited` event cancels
    // the verify/E2E run already in flight — editing a description mid-build would kill
    // the build — and the replacement run reports the merge gate as `skipped`, which from
    // outside is indistinguishable from passing (ADR 011's merge-gate-dark). Reading the
    // live body costs one API call and leaves the gate alone.
    const types: string[] = workflow.on.pull_request?.types ?? []
    expect(
      types,
      'ci.yml now fires on a pull_request `edited` event. That cancels the in-flight ' +
        'verify/E2E run through the concurrency group and replaces the merge gate with a ' +
        '`skipped` nobody can distinguish from a pass. The live API read in ' +
        'dependency-scope exists so this trigger is not needed.'
    ).not.toContain('edited')
  })

  it('leaves the merge-gate jobs unconditioned on the event action', () => {
    // The other half of the same rejected design: `if:` guards on verify/e2e would not
    // have helped, because cancellation happens at the concurrency group before any job
    // condition is evaluated. Their absence is the evidence that nothing here quietly
    // grew one.
    for (const id of ['verify', 'e2e']) {
      expect(workflow.jobs[id].if, `${id} has grown an \`if:\``).toBeUndefined()
    }
  })
})

/**
 * `HEAD` on **both** ends, deliberately.
 *
 * The first draft passed `--base HEAD` alone, which compares the committed manifest to
 * the one in the working tree — so the test asserted "this checkout has no uncommitted
 * dependency change", which is a fact about the developer's afternoon and not about the
 * script. It failed the moment the same branch repaired `package.json`, which is the
 * best possible demonstration of why: a contributor editing a dependency would have been
 * told their edit broke a JSON serialiser.
 *
 * Comparing a commit to itself yields the empty change set on any checkout, at any time,
 * which is what a test of the *output mode* should depend on.
 */
const ARGV = [join(ROOT, 'scripts/audit-dependency-scope.mjs'), '--base', 'HEAD', '--head', 'HEAD', '--json']

describe('--json is a mode that runs', () => {
  it('reports the unused-dependency result alongside the scope verdict', () => {
    // It did not. `unused` was declared *below* the branch that referenced it — a temporal
    // dead zone, so every `--json` invocation died with `ReferenceError: Cannot access
    // 'unused' before initialization`. The human-readable arm never touched it, which is
    // why the mode CI runs was fine and the mode a person reaches for when debugging CI
    // was the broken one. A flag nothing exercises is a flag nothing tests.
    const out = execFileSync(process.execPath, ARGV, {
      cwd: ROOT,
      encoding: 'utf8',
      env: { ...process.env, PR_BODY: '', PR_BODY_FILE: '' },
    })
    const parsed = JSON.parse(out)
    expect(parsed).toMatchObject({ ok: true, unused: { ok: expect.any(Boolean) } })
    expect(parsed.majors).toEqual(majors)
  })

  it('records which description it read, so a regression is visible in the output', () => {
    const out = execFileSync(process.execPath, ARGV, {
      cwd: ROOT,
      encoding: 'utf8',
      env: { ...process.env, PR_BODY_FILE: '', PR_BODY: '## Rationale\n' + 'x'.repeat(60) },
    })
    expect(JSON.parse(out).prBodySource).toBe('payload')
  })
})
