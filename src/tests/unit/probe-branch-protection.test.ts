import { describe, it, expect } from 'vitest'

const {
  verdict,
  escalationDecision,
  evaluateProtection,
  classifyClassic,
  requiredContextsFromRules,
  readProtection,
  PRECONDITION_GREEN_RUNS,
  PROTECTION_FINDINGS,
  ENFORCEABLE_SET,
} = await import('../../../scripts/probe-branch-protection.mjs')
const { ACCEPTED_GAP_MAX_AGE_DAYS } = await import('../../../scripts/lib/accepted-gap.mjs')

/**
 * The classification logic of the merge-gate probe, exercised without a token.
 *
 * This is the part of the probe that has to be right, and it is the part a live run
 * cannot demonstrate: a scheduled run against a repository whose protection is absent
 * only ever shows one of these four branches. The other three are reachable only here.
 *
 * The 404 case is the reason this file exists. GitHub answers "this branch has no
 * protection" with a 404, and a 404 handled as an error turns *there is no gate* into
 * *the check could not run* — a monitoring script laundering its most important finding
 * into a shrug. That is ADR 006's shape exactly, so it gets a test rather than a comment.
 */

/**
 * The three contexts the registry names and `ci.yml` publishes. This fixture carried two
 * until 2026-09-26 — `Dependency scope` was added to the registry and never here, so every
 * assertion below was measuring a gate one check short of the one it claimed to model.
 */
const CLAIMED_CONTEXTS = [
  'Lint · Type-check · Unit tests · Build',
  'Dependency scope',
  'E2E tests (Playwright)',
]

const claimNotConfigured = { requiredContexts: CLAIMED_CONTEXTS, status: 'not-configured' }
const claimConfigured = { requiredContexts: CLAIMED_CONTEXTS, status: 'configured' }

describe('an unprotected branch is a finding, not an error', () => {
  const absent = { state: 'absent', contexts: [], detail: 'no protection' }

  it('agrees when the registry also says not-configured', () => {
    const result = verdict(claimNotConfigured, absent)
    expect(result.verdict).toBe('absent')
    expect(result.agrees).toBe(true)
  })

  it('disagrees when the registry claims the gate is configured', () => {
    // The exact regression ADR 015 recorded: a document asserting a gate that is not
    // there. If this ever passes silently the probe has stopped being a control.
    const result = verdict(claimConfigured, absent)
    expect(result.agrees).toBe(false)
    expect(result.summary).toMatch(/ADR 015/)
  })
})

describe('protection is compared context by context', () => {
  it('enforced when the required set matches exactly', () => {
    const result = verdict(claimConfigured, {
      state: 'protected',
      contexts: [...CLAIMED_CONTEXTS].reverse(), // order is not part of the contract
      detail: '',
    })
    expect(result.verdict).toBe('enforced')
    expect(result.agrees).toBe(true)
  })

  it('mismatched when GitHub requires the job IDs instead of the check names', () => {
    // The booby trap itself: `verify` and `e2e` are contexts nothing publishes, so a
    // repository configured this way blocks every pull request forever with no message
    // saying why. This is the single most valuable thing this probe can detect.
    const result = verdict(claimConfigured, {
      state: 'protected',
      contexts: ['verify', 'e2e'],
      detail: '',
    })
    expect(result.verdict).toBe('mismatched')
    expect(result.agrees).toBe(false)
    expect(result.summary).toMatch(/blocks every pull request forever/)
  })

  it('mismatched when only one of the two checks is required', () => {
    // A gate with a hole in it, and the hole is invisible: the PR goes green on the
    // half that is enforced.
    const result = verdict(claimConfigured, {
      state: 'protected',
      contexts: ['Lint · Type-check · Unit tests · Build'],
      detail: '',
    })
    expect(result.verdict).toBe('mismatched')
    expect(result.agrees).toBe(false)
  })

  it('reports a stale registry when protection exists but the registry says otherwise', () => {
    const result = verdict(claimNotConfigured, {
      state: 'protected',
      contexts: CLAIMED_CONTEXTS,
      detail: '',
    })
    expect(result.verdict).toBe('enforced')
    expect(result.agrees).toBe(false)
    expect(result.summary).toMatch(/stale registry/)
  })
})

describe('unreadable is not the same as unprotected', () => {
  it('reports unevaluable rather than absent', () => {
    // ADR 010's separation, applied here: "this check failed" and "this check could not
    // run" are different facts, and collapsing them is how a control goes quiet.
    const result = verdict(claimNotConfigured, {
      state: 'unevaluable',
      contexts: [],
      detail: 'GitHub returned 403',
    })
    expect(result.verdict).toBe('unevaluable')
    expect(result.agrees).toBeNull()
  })

  it('never exits non-zero on unevaluable — agrees is null, not false', () => {
    // The script exits 1 only on `agrees === false`. A token problem must not turn the
    // scheduled audit red, or the audit becomes the noise it exists to replace.
    const result = verdict(claimConfigured, { state: 'unevaluable', contexts: [], detail: '' })
    expect(result.agrees).not.toBe(false)
  })
})

/**
 * **When an absent gate should wake somebody, and when it should stay quiet.**
 *
 * The probe's exit code is deliberately blind to this: "absent, and the registry honestly
 * says so" is a consistent state and exits 0, because failing a scheduled audit over a
 * console action nobody in CI can perform produces a permanent red that people mute.
 *
 * The consequence, until 2026-08-31, was that the finding went into `merge-gate.log` and
 * stopped. `smoke-liveness` and `ci-liveness` each open a labelled issue; the merge gate —
 * the reason eleven commits reached `main` unverified on 2026-08-29 — had no channel at
 * all. `escalationDecision` is that channel's decision, and it is a pure function precisely
 * so it can be pointed at known answers here rather than learned from a live run (ADR 024).
 *
 * The four cases that must never escalate matter more than the two that must. An alarm that
 * fires on an unreadable token is an alarm about credentials wearing a branch-protection
 * label, which is ADR 010's confusion of "failed" with "could not run" rebuilt inside the
 * fix for it.
 */

const AT_THE_TIME = new Date('2026-08-31T00:00:00Z')
const FRESHLY_ACCEPTED = { acceptedSince: '2026-08-29', humanAction: 'GitHub → Settings' }
const LONG_ACCEPTED = { acceptedSince: '2026-06-01', humanAction: 'GitHub → Settings' }
const GREEN = Array(PRECONDITION_GREEN_RUNS).fill('success')
const RED_STREAK = ['failure', 'failure', 'failure', 'failure']

describe('an absent gate escalates for two reasons and no others', () => {
  it('escalates when the precondition ADR 015 named is now met', () => {
    // The state this repository is actually in: main unprotected, and the last four CI
    // runs green after the blackout. ADR 015 said protection was "only reasonable once a
    // passing run existed to enforce against" — so the stated blocker is gone.
    const result = escalationDecision({
      verdict: 'absent',
      control: FRESHLY_ACCEPTED,
      ciConclusions: GREEN,
      now: AT_THE_TIME,
    })
    expect(result.escalate).toBe(true)
    expect(result.reason).toBe('precondition-met')
  })

  it('escalates when the acceptance has gone stale, whatever CI is doing', () => {
    const result = escalationDecision({
      verdict: 'absent',
      control: LONG_ACCEPTED,
      ciConclusions: RED_STREAK,
      now: AT_THE_TIME,
    })
    expect(result.escalate).toBe(true)
    expect(result.reason).toBe('stale-acceptance')
    expect(result.detail).toContain(String(ACCEPTED_GAP_MAX_AGE_DAYS))
  })

  it('stays quiet on a fresh acceptance with no green run to enforce against', () => {
    const result = escalationDecision({
      verdict: 'absent',
      control: FRESHLY_ACCEPTED,
      ciConclusions: RED_STREAK,
      now: AT_THE_TIME,
    })
    expect(result.escalate).toBe(false)
    expect(result.reason).toBe(null)
  })

  it('does not count a green streak shorter than the threshold', () => {
    // One green run after a red streak is as likely to be the flake as the recovery.
    const result = escalationDecision({
      verdict: 'absent',
      control: FRESHLY_ACCEPTED,
      ciConclusions: ['success', 'failure', 'failure', 'failure'],
      now: AT_THE_TIME,
    })
    expect(result.escalate).toBe(false)
  })

  it('treats an unreadable run history as no evidence, not as good news', () => {
    // `null` is "the API did not answer". Reading a precondition out of that is the
    // laundering ADR 006 is about, in the direction that produces a false alarm.
    const result = escalationDecision({
      verdict: 'absent',
      control: FRESHLY_ACCEPTED,
      ciConclusions: null,
      now: AT_THE_TIME,
    })
    expect(result.escalate).toBe(false)
  })
})

describe('every other verdict is silent here', () => {
  it.each(['enforced', 'mismatched', 'unevaluable'])('%s does not escalate', (state) => {
    // `mismatched` already exits 1 and fails loudly; `enforced` has nothing to say; and
    // `unevaluable` means the probe could not read the setting. Escalating on the last of
    // those would turn an expired token into an alarm about branch protection — ADR 010's
    // separation of "this check failed" from "this check could not run", rebuilt inside
    // the very fix that exists to honour it.
    const result = escalationDecision({
      verdict: state,
      control: LONG_ACCEPTED, // stale enough to fire, if the verdict were absent
      ciConclusions: GREEN, // green enough to fire, if the verdict were absent
      now: AT_THE_TIME,
    })
    expect(result.escalate).toBe(false)
    expect(result.reason).toBe(null)
  })
})

// ─────────────────────────────────────────────────────────────────────────────────────
// Rulesets and classic protection, judged together
// ─────────────────────────────────────────────────────────────────────────────────────

/**
 * **The mechanism the owner will actually configure was invisible to this probe.**
 *
 * It read `GET /branches/main/protection` and nothing else. A branch governed only by a
 * repository ruleset — GitHub's recommended mechanism, and the one the runbook creates —
 * answers that endpoint with 404, so the day the gate was configured the recommended way,
 * this probe would have reported `absent` and kept the issue open. Every shape below is a
 * fixture in the form GitHub returns it, so each branch is reachable without a token.
 */

const NOT_PROTECTED = { status: 404, body: { message: 'Branch not protected' } }
const NO_RULES = { status: 200, body: [] }
const FORBIDDEN = { status: 403, body: { message: 'Resource not accessible by integration' } }

/** Classic protection as `GET /branches/main/protection` returns it. */
function classicBody({
  contexts = CLAIMED_CONTEXTS,
  strict = true,
  enforceAdmins = true,
  reviews = true,
  codeOwners = false,
} = {}) {
  return {
    status: 200,
    body: {
      required_status_checks: {
        strict,
        contexts,
        checks: contexts.map((context) => ({ context, app_id: null })),
      },
      enforce_admins: { enabled: enforceAdmins },
      ...(reviews
        ? {
            required_pull_request_reviews: {
              required_approving_review_count: 0,
              require_code_owner_reviews: codeOwners,
            },
          }
        : {}),
    },
  }
}

/** The effective rules one ruleset contributes, as `GET /rules/branches/main` lists them. */
function rulesetRules(
  id: number,
  { contexts = CLAIMED_CONTEXTS, strict = true, pullRequest = true, codeOwners = false } = {}
) {
  const source = {
    ruleset_source_type: 'Repository',
    ruleset_source: 'sannguyen01/healthy-jewelry',
    ruleset_id: id,
  }
  return [
    {
      type: 'required_status_checks',
      ...source,
      parameters: {
        strict_required_status_checks_policy: strict,
        required_status_checks: contexts.map((context) => ({ context })),
      },
    },
    ...(pullRequest
      ? [
          {
            type: 'pull_request',
            ...source,
            parameters: {
              required_approving_review_count: 0,
              require_code_owner_review: codeOwners,
              dismiss_stale_reviews_on_push: false,
              require_last_push_approval: false,
              required_review_thread_resolution: false,
            },
          },
        ]
      : []),
    { type: 'non_fast_forward', ...source },
    { type: 'deletion', ...source },
  ]
}

const ruleset = (bypass_actors: unknown[] | undefined) => ({
  status: 200,
  body: { id: 7, name: 'main', enforcement: 'active', ...(bypass_actors ? { bypass_actors } : {}) },
})

interface Finding {
  code: string
  severity: string
  missing?: string[]
  extra?: string[]
  actors?: unknown[]
}

const claim = { requiredContexts: CLAIMED_CONTEXTS }
const codes = (result: { findings: Finding[] }, severity?: string) =>
  result.findings.filter((f) => !severity || f.severity === severity).map((f) => f.code)
const find = (result: { findings: Finding[] }, code: string) =>
  result.findings.find((f) => f.code === code)

describe('evaluateProtection — where protection comes from', () => {
  it('classic only: protected, and judged on strict, reviews and admin enforcement', () => {
    const result = evaluateProtection({ classic: classicBody(), rules: NO_RULES }, claim)
    expect(result.state).toBe('protected')
    expect(result.sources).toEqual(['classic'])
    expect(result.contexts).toEqual([...CLAIMED_CONTEXTS].sort())
    expect(codes(result, 'blocking')).toEqual([])
    expect(verdict({ ...claim, status: 'configured' }, result).verdict).toBe('enforced')
  })

  it('ruleset only: protected — not the 404 the old probe read as "absent"', () => {
    const result = evaluateProtection(
      {
        classic: NOT_PROTECTED,
        rules: { status: 200, body: rulesetRules(7) },
        rulesets: { '7': ruleset([]) },
      },
      claim
    )
    expect(result.state).toBe('protected')
    expect(result.sources).toEqual(['ruleset:7'])
    expect(codes(result, 'blocking')).toEqual([])
    const judged = verdict({ ...claim, status: 'configured' }, result)
    expect(judged.verdict).toBe('enforced')
    expect(judged.agrees).toBe(true)
  })

  it('both: the union of every layer is what a pull request must satisfy', () => {
    // GitHub layers the two mechanisms; each can only add. A context either one requires is
    // required, so the classic layer's extra context is a real (and blocking) requirement.
    const result = evaluateProtection(
      {
        classic: classicBody({ contexts: [...CLAIMED_CONTEXTS, 'Legacy check'] }),
        rules: { status: 200, body: rulesetRules(7) },
        rulesets: { '7': ruleset([]) },
      },
      claim
    )
    expect(result.sources).toEqual(['classic', 'ruleset:7'])
    expect(result.contexts).toContain('Legacy check')
    const mismatch = find(result, 'contexts-mismatch')
    expect(mismatch?.severity).toBe('blocking')
    expect(mismatch?.extra).toEqual(['Legacy check'])
    expect(verdict({ ...claim, status: 'configured' }, result).verdict).toBe('mismatched')
  })

  it('neither: absent, but only when both mechanisms were actually read', () => {
    const result = evaluateProtection({ classic: NOT_PROTECTED, rules: NO_RULES }, claim)
    expect(result.state).toBe('absent')
    expect(verdict({ ...claim, status: 'not-configured' }, result)).toMatchObject({
      verdict: 'absent',
      agrees: true,
    })
  })
})

describe('evaluateProtection — an inability to ask is never "absent"', () => {
  it.each([
    ['401', { status: 401, body: { message: 'Bad credentials' } }],
    ['403', FORBIDDEN],
    ['a 404 that does not say "Branch not protected"', { status: 404, body: { message: 'Not Found' } }],
    ['no token', { status: 0, error: 'GITHUB_TOKEN is not set' }],
  ])('classic %s with no ruleset is unevaluable', (_label, classic) => {
    const result = evaluateProtection({ classic, rules: NO_RULES }, claim)
    expect(result.state).toBe('unevaluable')
    expect(verdict({ ...claim, status: 'not-configured' }, result).agrees).toBeNull()
  })

  it('both unreadable is unevaluable', () => {
    expect(evaluateProtection({ classic: FORBIDDEN, rules: FORBIDDEN }, claim).state).toBe(
      'unevaluable'
    )
  })

  it('classic absent but the rules endpoint unreadable is unevaluable — a ruleset may govern it', () => {
    expect(evaluateProtection({ classic: NOT_PROTECTED, rules: FORBIDDEN }, claim).state).toBe(
      'unevaluable'
    )
  })

  it('only the literal "Branch not protected" 404 reads as absent', () => {
    expect(classifyClassic(NOT_PROTECTED)).toBe('absent')
    expect(classifyClassic({ status: 404, body: { message: 'Not Found' } })).toBe('unreadable')
    expect(classifyClassic({ status: 404 })).toBe('unreadable')
    expect(classifyClassic(classicBody())).toBe('present')
  })

  it('a complete ruleset proves protection even when classic cannot be read', () => {
    // Layers only add. A ruleset with no bypass that enforces the full set is enforcement
    // however little else the token could see.
    const result = evaluateProtection(
      {
        classic: FORBIDDEN,
        rules: { status: 200, body: rulesetRules(7) },
        rulesets: { '7': ruleset([]) },
      },
      claim
    )
    expect(result.state).toBe('protected')
    expect(result.complete).toBe(false)
    expect(codes(result, 'blocking')).toEqual([])
    expect(verdict({ ...claim, status: 'configured' }, result).verdict).toBe('enforced')
  })

  it('but a requirement missing from what could be read is not concluded missing', () => {
    // Classic, unread, might be the layer that supplies strict. Reported, never blocking.
    const result = evaluateProtection(
      {
        classic: FORBIDDEN,
        rules: { status: 200, body: rulesetRules(7, { strict: false }) },
        rulesets: { '7': ruleset([]) },
      },
      claim
    )
    expect(find(result, 'not-strict')?.severity).toBe('unevaluable')
    expect(verdict({ ...claim, status: 'configured' }, result).verdict).toBe('unevaluable')
  })
})

describe('evaluateProtection — the enforceable set', () => {
  const rulesOnly = (options: Parameters<typeof rulesetRules>[1], actors: unknown[] | null = []) =>
    evaluateProtection(
      {
        classic: NOT_PROTECTED,
        rules: { status: 200, body: rulesetRules(7, options) },
        rulesets: { '7': ruleset(actors ?? undefined) },
      },
      claim
    )

  it('holds GitHub to strict mode, a pull request and no bypass', () => {
    expect(ENFORCEABLE_SET).toEqual({ strict: true, pullRequest: true, bypassActors: 0 })
  })

  it('strict off in every layer is blocking', () => {
    const result = rulesOnly({ strict: false })
    expect(codes(result, 'blocking')).toContain('not-strict')
    const judged = verdict({ ...claim, status: 'configured' }, result)
    expect(judged.verdict).toBe('mismatched')
    expect(judged.agrees).toBe(false)
    expect(judged.summary).toMatch(/not-strict/)
  })

  it('strict in either mechanism is strict', () => {
    const result = evaluateProtection(
      {
        classic: classicBody({ strict: true }),
        rules: { status: 200, body: rulesetRules(7, { strict: false }) },
        rulesets: { '7': ruleset([]) },
      },
      claim
    )
    expect(result.strict).toBe(true)
    expect(codes(result)).not.toContain('not-strict')
  })

  it('no pull request required is blocking', () => {
    expect(codes(rulesOnly({ pullRequest: false }), 'blocking')).toContain('no-pull-request-required')
  })

  it('a bypass actor is blocking, and named', () => {
    const result = rulesOnly({}, [{ actor_id: 5, actor_type: 'RepositoryRole', bypass_mode: 'always' }])
    const bypass = find(result, 'bypass-actors-present')
    expect(bypass?.severity).toBe('blocking')
    expect(bypass?.actors).toEqual([
      { layer: 'ruleset:7', actor_type: 'RepositoryRole', actor_id: 5, bypass_mode: 'always' },
    ])
    expect(verdict({ ...claim, status: 'not-configured' }, result)).toMatchObject({
      verdict: 'mismatched',
      agrees: false,
    })
  })

  it('classic enforce_admins off is a bypass for the owner, and the owner is who agents act as', () => {
    const result = evaluateProtection(
      { classic: classicBody({ enforceAdmins: false }), rules: NO_RULES },
      claim
    )
    expect(find(result, 'admins-not-enforced')?.severity).toBe('blocking')
  })

  it('a bypass on one layer is informational when a bypass-free layer enforces the full set', () => {
    // Layers do not bypass each other: the admin who can merge around classic protection
    // still cannot merge around a ruleset with nobody on its bypass list.
    const result = evaluateProtection(
      {
        classic: classicBody({ enforceAdmins: false }),
        rules: { status: 200, body: rulesetRules(7) },
        rulesets: { '7': ruleset([]) },
      },
      claim
    )
    expect(find(result, 'admins-not-enforced')?.severity).toBe('informational')
    expect(verdict({ ...claim, status: 'configured' }, result).verdict).toBe('enforced')
  })

  it('a bypass list the token was not shown is unreadable, never empty', () => {
    // GitHub omits bypass_actors for a reader without write access to the ruleset.
    const result = rulesOnly({}, null)
    expect(codes(result, 'unevaluable')).toContain('bypass-actors-unreadable')
    expect(verdict({ ...claim, status: 'configured' }, result).verdict).toBe('unevaluable')
  })

  it('a ruleset that could not be read at all is treated the same way', () => {
    const result = evaluateProtection(
      {
        classic: NOT_PROTECTED,
        rules: { status: 200, body: rulesetRules(7) },
        rulesets: { '7': FORBIDDEN },
      },
      claim
    )
    expect(codes(result, 'unevaluable')).toContain('bypass-actors-unreadable')
  })

  it('contexts are compared as a set, both ways', () => {
    const result = rulesOnly({ contexts: [...CLAIMED_CONTEXTS.slice(0, 2), 'verify'] })
    const mismatch = find(result, 'contexts-mismatch')
    expect(mismatch?.missing).toEqual(['E2E tests (Playwright)'])
    expect(mismatch?.extra).toEqual(['verify'])
    expect(verdict({ ...claim, status: 'configured' }, result).verdict).toBe('mismatched')
  })

  it("requires exactly the registry's three contexts — the fixture this file had wrong", () => {
    const result = rulesOnly({})
    expect(result.contexts).toHaveLength(3)
    expect(codes(result)).not.toContain('contexts-mismatch')
  })

  it('code-owner review off is information, never a reason to fail', () => {
    // Required in a one-maintainer repository it deadlocks every merge: GitHub blocks
    // self-approval. It turns on when a second human reviewer exists.
    const result = rulesOnly({})
    expect(find(result, 'code-owner-review-off')?.severity).toBe('informational')
    expect(verdict({ ...claim, status: 'configured' }, result).verdict).toBe('enforced')
  })
})

describe('the finding enumeration and the decision agree', () => {
  const emitted = new Set<string>()
  const scenarios = [
    {
      classic: classicBody({ enforceAdmins: false, strict: false, reviews: false, contexts: ['verify'] }),
      rules: NO_RULES,
    },
    {
      classic: NOT_PROTECTED,
      rules: { status: 200, body: [...rulesetRules(7), ...rulesetRules(8)] },
      rulesets: { '7': ruleset([{ actor_id: 1, actor_type: 'Integration' }]), '8': ruleset(undefined) },
    },
  ]
  for (const s of scenarios) {
    for (const f of evaluateProtection(s, claim).findings as Finding[]) emitted.add(f.code)
  }

  it('names every code it can emit, and can emit every code it names', () => {
    expect([...emitted].sort()).toEqual([...PROTECTION_FINDINGS].sort())
  })
})

describe('requiredContextsFromRules', () => {
  it('reads contexts out of required_status_checks rules only, de-duplicated', () => {
    expect(requiredContextsFromRules([...rulesetRules(7), ...rulesetRules(8)])).toEqual(
      [...CLAIMED_CONTEXTS].sort()
    )
    expect(requiredContextsFromRules(null)).toEqual([])
  })
})

describe('readProtection asks the right endpoints and only ever GETs', () => {
  type Answer = { status: number; body?: unknown }

  it('reads classic, the effective rules, and each contributing ruleset', async () => {
    const asked: Array<{ url: string; method: string }> = []
    const answers: Record<string, Answer> = {
      '/branches/main/protection': NOT_PROTECTED,
      '/rules/branches/main': { status: 200, body: rulesetRules(7) },
      '/rulesets/7': ruleset([]),
    }
    const fetchImpl = async (url: string, init: { method: string }) => {
      asked.push({ url, method: init.method })
      const key = Object.keys(answers).find((k) => url.split('?')[0].endsWith(k)) as string
      return { status: answers[key].status, json: async () => answers[key].body }
    }
    const readings = await readProtection({
      api: 'https://api.example',
      repo: 'o/r',
      branch: 'main',
      token: 'x',
      fetchImpl,
    })
    expect(asked.map((a) => a.url)).toEqual([
      'https://api.example/repos/o/r/branches/main/protection',
      'https://api.example/repos/o/r/rules/branches/main?per_page=100',
      'https://api.example/repos/o/r/rulesets/7',
    ])
    expect(new Set(asked.map((a) => a.method))).toEqual(new Set(['GET']))
    expect(evaluateProtection(readings, claim).state).toBe('protected')
  })

  it('without a token, does not ask classic protection and cannot conclude absence', async () => {
    const asked: string[] = []
    const fetchImpl = async (url: string) => {
      asked.push(url)
      return { status: 200, json: async () => [] }
    }
    const readings = await readProtection({
      api: 'https://api.example',
      repo: 'o/r',
      token: '', // empty, not undefined: undefined falls back to the environment's token
      fetchImpl,
    })
    expect(asked).toEqual(['https://api.example/repos/o/r/rules/branches/main?per_page=100'])
    expect(evaluateProtection(readings, claim).state).toBe('unevaluable')
  })

  it('turns a transport failure into data rather than an exception', async () => {
    const fetchImpl = async () => {
      throw new Error('ECONNRESET')
    }
    const readings = await readProtection({
      api: 'https://api.example',
      repo: 'o/r',
      token: 'x',
      fetchImpl,
    })
    expect(readings.classic.status).toBe(0)
    expect(evaluateProtection(readings, claim).state).toBe('unevaluable')
  })
})
