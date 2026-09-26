#!/usr/bin/env node
/**
 * Reads `main`'s protection from GitHub — classic branch protection **and** repository
 * rulesets — and compares it against what `docs/controls.json` claims.
 *
 * ## Why a probe and not a paragraph
 *
 * Five documents in this repository asserted that `main` required `verify` and `e2e`.
 * None of them was checked against anything, and all five were wrong for as long as
 * they existed — `main` has never been protected. The merge record shows PR #34
 * squash-merged 4m37s after its own E2E job concluded failure.
 *
 * A sixth document saying the opposite fixes nothing durable. What fixes it is this:
 * something that asks GitHub, on a schedule, and reports the answer whatever it is.
 * See docs/adr/018-a-claim-about-a-control-is-not-a-control.md.
 *
 * ## Why it reads rulesets too, and why that was a defect rather than a feature request
 *
 * Until 2026-09-26 this read one endpoint — `GET /branches/main/protection` — and compared
 * one field, `required_status_checks.contexts`. GitHub has two protection mechanisms, and
 * the one its own documentation now recommends, a **repository ruleset**, is invisible to
 * that endpoint: it answers 404 for a branch governed only by a ruleset. So the moment the
 * owner configured the gate the recommended way, this probe would have reported `absent`,
 * kept the `merge-gate-unenforced` issue open, and exited 0 on "absent and honestly
 * documented" — a control reporting the absence of the thing it exists to confirm, on the
 * day that thing arrived. ADR 018's shape, inverted.
 *
 * It also only ever asked about contexts. A gate that requires the right three checks and
 * lets its admin merge around them, or does not require the branch to be up to date, or
 * does not require a pull request at all, read as `enforced`. So this now reads:
 *
 *   · `GET /repos/{repo}/branches/main/protection`   — classic protection
 *   · `GET /repos/{repo}/rules/branches/main`        — the *effective* rules from every
 *                                                      active ruleset targeting main
 *   · `GET /repos/{repo}/rulesets/{id}`              — each contributing ruleset, for its
 *                                                      bypass actors
 *
 * and {@link evaluateProtection} judges the union — GitHub layers the two mechanisms, and
 * every rule from every layer applies.
 *
 * ## The enforceable set, and the identity-separation decision behind it
 *
 * Agents in this repository act through the owner's GitHub identity. So "prevent agents
 * from bypassing" **cannot** be implemented as a bypass list — the agent *is* the owner as
 * far as GitHub can tell — and requiring code-owner review in a single-maintainer
 * repository deadlocks, because GitHub will not let the author approve their own pull
 * request. What can be enforced, and what {@link ENFORCEABLE_SET} holds GitHub to, is:
 *
 *   · the three required contexts, as a set, both ways;
 *   · strict mode (the branch must be up to date with main before merging);
 *   · a pull request required for every change;
 *   · **no bypass actors** — nobody, the owner included, can merge around the checks;
 *
 * plus an agent policy of never calling a merge endpoint. Code-owner review is reported as
 * information only, and becomes enforceable the day a second human reviewer exists. See
 * `docs/runbooks/main-ruleset.md`.
 *
 * ## Outcomes, and the one kept rigidly apart
 *
 *   · `enforced`   — protection exists and meets the enforceable set exactly
 *   · `absent`     — no protection in either mechanism, reported as a finding, never as an
 *                    error
 *   · `mismatched` — protection exists and falls short: wrong contexts, not strict, no
 *                    pull request, or a bypass that reaches around the checks
 *   · `unevaluable`— a transport or auth failure, or a question the token could not answer
 *
 * `unevaluable` is kept distinct from `absent` — ADR 010's separation of "this check
 * failed" from "this check could not run". A 401 or 403 is never read as unprotected, and
 * neither is a 404 whose body does not say *Branch not protected*: GitHub answers
 * "you may not see this" with a 404 on many endpoints, and reading that as "there is no
 * gate" is the laundering this probe exists to refuse.
 *
 * ## Usage
 *
 *   GITHUB_TOKEN=… node scripts/probe-branch-protection.mjs [--json]
 *
 * Exits 0 when the registry and GitHub agree — including when both say the gate is
 * absent, because a truthful "not-configured" is a consistent state, not a failure.
 * Exits 1 when they disagree, which is the only thing this script is entitled to call
 * wrong: whether protection *should* exist is a human's decision, recorded in the
 * registry's `status`.
 */

import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { ACCEPTED_GAP_MAX_AGE_DAYS, daysSinceAccepted, isStale } from './lib/accepted-gap.mjs'

const REGISTRY = path.resolve(import.meta.dirname, '../docs/controls.json')
const REPO = process.env.GITHUB_REPOSITORY ?? 'sannguyen01/Healthy-Jewelry'
const API = process.env.GITHUB_API_URL ?? 'https://api.github.com'
const BRANCH = 'main'
/** Written on every run so the workflow's reporting step reads data, not prose. */
const OUTPUT = 'merge-gate.json'

/**
 * What GitHub must enforce beyond the contexts, for the registry's `configured` to be true.
 *
 * Not read from `docs/controls.json`, deliberately: these are the identity-separation
 * decision's consequences, not a per-repository preference, and a registry field that
 * could say `strict: false` would be a switch for turning the decision off in a JSON diff.
 * The runbook that creates the ruleset carries the same four properties, and
 * `main-ruleset-runbook.test.ts` holds the two together.
 */
export const ENFORCEABLE_SET = Object.freeze({
  strict: true,
  pullRequest: true,
  bypassActors: 0,
})

/**
 * Every finding code {@link evaluateProtection} can emit, reconciled both ways in
 * `probe-branch-protection.test.ts` — ADR 019: an enumeration nothing compares to anything is
 * a comment with a type annotation.
 */
export const PROTECTION_FINDINGS = /** @type {const} */ ([
  'contexts-mismatch',
  'not-strict',
  'no-pull-request-required',
  'bypass-actors-present',
  'admins-not-enforced',
  'bypass-actors-unreadable',
  'code-owner-review-off',
])

/** @returns {{ requiredContexts: string[], status: string }} */
function claimed() {
  const registry = JSON.parse(fs.readFileSync(REGISTRY, 'utf8'))
  const gate = registry.controls.find((c) => c.id === 'merge-gate')
  if (!gate) {
    throw new Error('docs/controls.json has no merge-gate control. Nothing to compare against.')
  }
  return {
    requiredContexts: gate.requiredContexts ?? [],
    status: gate.status,
    acceptedSince: gate.acceptedSince,
    humanAction: gate.humanAction,
  }
}

/**
 * @typedef {{ status: number, body?: any, error?: string }} Reading
 *   One API answer, as data. `status: 0` is a transport failure or a request not made.
 */

/**
 * What the classic endpoint's answer means.
 *
 * **Only a 404 that says so is "not protected".** The classic endpoint answers an
 * unprotected branch with `404 {"message":"Branch not protected"}`, and answers a request it
 * will not serve — a token without administration read, a repository it will not confirm
 * exists — with a 404 too, whose message is `Not Found`. The first is the finding this
 * probe exists for; the second is an inability to ask. Treating every 404 as the first is
 * how an under-scoped token would report "there is no gate" with total confidence.
 *
 * @param {Reading} reading
 * @returns {'present' | 'absent' | 'unreadable'}
 */
export function classifyClassic(reading) {
  if (reading?.status === 200) return 'present'
  if (reading?.status === 404 && /branch not protected/i.test(String(reading.body?.message ?? ''))) {
    return 'absent'
  }
  return 'unreadable'
}

/**
 * The status-check contexts a set of effective rules requires.
 *
 * Exported because `probe-merge-denial.mjs` asks the same question of the same rules, and a
 * second reading of the rules shape would be a second place for GitHub's schema to drift.
 *
 * @param {Array<any>} rules the body of `GET /repos/{repo}/rules/branches/{branch}`
 * @returns {string[]} sorted, de-duplicated
 */
export function requiredContextsFromRules(rules) {
  const contexts = new Set()
  for (const rule of Array.isArray(rules) ? rules : []) {
    if (rule?.type !== 'required_status_checks') continue
    for (const check of rule.parameters?.required_status_checks ?? []) {
      if (check?.context) contexts.add(String(check.context))
    }
  }
  return [...contexts].sort()
}

/**
 * One protection layer: classic protection, or one ruleset's contribution to `main`.
 *
 * @typedef {object} Layer
 * @property {string} source          `classic` or `ruleset:<id>`
 * @property {string[]} contexts
 * @property {boolean} strict
 * @property {boolean} pullRequest
 * @property {boolean} codeOwnerReview
 * @property {Array<object>} bypass   who may merge around this layer
 * @property {boolean} bypassKnown    false when the token could not read the bypass list
 */

/** @returns {Layer} */
function classicLayer(body) {
  const checks = body?.required_status_checks
  const contexts = new Set([
    ...(checks?.contexts ?? []),
    ...(checks?.checks ?? []).map((c) => c?.context).filter(Boolean),
  ])
  const reviews = body?.required_pull_request_reviews
  return {
    source: 'classic',
    contexts: [...contexts].map(String).sort(),
    strict: checks?.strict === true,
    pullRequest: reviews != null,
    codeOwnerReview: reviews?.require_code_owner_reviews === true,
    // `enforce_admins: false` is classic protection's bypass list, spelled differently: an
    // administrator — which is who every agent here acts as — merges around every rule.
    bypass:
      body?.enforce_admins?.enabled === true
        ? []
        : [{ actor_type: 'RepositoryRole', actor_id: 'admin', via: 'classic enforce_admins: false' }],
    bypassKnown: true,
  }
}

/** @returns {Layer[]} */
function rulesetLayers(rules, rulesets) {
  /** @type {Map<string, Layer>} */
  const layers = new Map()
  for (const rule of Array.isArray(rules) ? rules : []) {
    const id = String(rule?.ruleset_id ?? 'unknown')
    if (!layers.has(id)) {
      const reading = rulesets?.[id]
      const actors = reading?.status === 200 ? reading.body?.bypass_actors : undefined
      layers.set(id, {
        source: `ruleset:${id}`,
        contexts: [],
        strict: false,
        pullRequest: false,
        codeOwnerReview: false,
        // GitHub omits `bypass_actors` from a ruleset read by anyone without write access
        // to it. An absent list is "not shown to you", never "empty" — the difference
        // between a gate nobody can bypass and one this token cannot see into.
        bypass: Array.isArray(actors) ? actors : [],
        bypassKnown: Array.isArray(actors),
      })
    }
    const layer = /** @type {Layer} */ (layers.get(id))
    if (rule.type === 'required_status_checks') {
      layer.contexts = [...new Set([...layer.contexts, ...requiredContextsFromRules([rule])])].sort()
      if (rule.parameters?.strict_required_status_checks_policy === true) layer.strict = true
    }
    if (rule.type === 'pull_request') {
      layer.pullRequest = true
      if (rule.parameters?.require_code_owner_review === true) layer.codeOwnerReview = true
    }
  }
  return [...layers.values()]
}

const setOf = (xs) => new Set(xs)
const minus = (a, b) => [...a].filter((x) => !b.has(x)).sort()

/**
 * **Judge `main`'s protection, across both mechanisms, against the enforceable set.**
 *
 * Pure: three readings in, a verdict out. Every branch — a classic-only gate, a ruleset-only
 * gate, both, neither, a 403 — is reachable from a fixture, which is the only place most of
 * them will ever be seen before they matter (ADR 024).
 *
 * **Absence is only concluded from a complete reading.** Rulesets and classic protection
 * layer: each can only *add* requirements. So a requirement a readable layer demands is a
 * fact however little else could be read, while a requirement *missing* from what could be
 * read is only a finding when nothing unread could be supplying it. A `not-strict` from a
 * probe whose token cannot see classic protection is a guess; it is reported with severity
 * `unevaluable`, never `blocking`.
 *
 * @param {{ classic: Reading, rules: Reading, rulesets?: Record<string, Reading> }} readings
 * @param {{ requiredContexts: string[] }} claim
 */
export function evaluateProtection({ classic, rules, rulesets = {} }, claim) {
  const classicState = classifyClassic(classic)
  const rulesReadable = rules?.status === 200 && Array.isArray(rules.body)
  const nothing = { contexts: [], findings: [], sources: [], complete: false }

  if (classicState === 'unreadable' && !rulesReadable) {
    return {
      state: /** @type {const} */ ('unevaluable'),
      ...nothing,
      detail:
        `Neither mechanism could be read: classic protection answered ${describe(classic)}, ` +
        `the rules endpoint answered ${describe(rules)}. Classic protection needs ` +
        `administration read; a 401/403, or a 404 that does not say "Branch not protected", ` +
        `is an inability to ask — never evidence that main is unprotected.`,
    }
  }

  const layers = [
    ...(classicState === 'present' ? [classicLayer(classic.body)] : []),
    ...(rulesReadable ? rulesetLayers(rules.body, rulesets) : []),
  ]
  const complete = classicState !== 'unreadable' && rulesReadable

  if (layers.length === 0) {
    if (!complete) {
      return {
        state: /** @type {const} */ ('unevaluable'),
        ...nothing,
        detail:
          classicState === 'unreadable'
            ? `No ruleset applies to ${BRANCH}, and classic protection could not be read ` +
              `(${describe(classic)}). An unprotected branch and an unreadable one look ` +
              `identical from here, so this probe does not guess.`
            : `Classic protection is absent, and the rules endpoint could not be read ` +
              `(${describe(rules)}), so a ruleset may still govern ${BRANCH}.`,
      }
    }
    return {
      state: /** @type {const} */ ('absent'),
      ...nothing,
      complete: true,
      detail:
        `${BRANCH} has neither a classic protection rule (GitHub answers 404 "Branch not ` +
        `protected") nor any active ruleset (the rules endpoint lists none).`,
    }
  }

  const claimedSet = setOf(claim.requiredContexts ?? [])
  const effective = setOf(layers.flatMap((l) => l.contexts))
  const strict = layers.some((l) => l.strict)
  const pullRequest = layers.some((l) => l.pullRequest)
  const codeOwnerReview = layers.some((l) => l.codeOwnerReview)
  const conclusive = complete ? 'blocking' : 'unevaluable'

  // What the layers nobody can bypass enforce between them. A bypass on one layer is a hole
  // only when no bypass-free layer independently demands the same thing.
  const sealed = layers.filter((l) => l.bypassKnown && l.bypass.length === 0)
  const sealedContexts = setOf(sealed.flatMap((l) => l.contexts))
  const covered =
    minus(claimedSet, sealedContexts).length === 0 &&
    sealed.some((l) => l.strict) &&
    sealed.some((l) => l.pullRequest)

  /** @type {Array<{ code: string, severity: 'blocking' | 'unevaluable' | 'informational', detail: string, [k: string]: unknown }>} */
  const findings = []

  const missing = minus(claimedSet, effective)
  const extra = minus(effective, claimedSet)
  if (missing.length > 0 || extra.length > 0) {
    findings.push({
      code: 'contexts-mismatch',
      // A context required that no job publishes is a fact from any single layer. One
      // missing is only a fact once every layer has been read.
      severity: extra.length > 0 || complete ? 'blocking' : 'unevaluable',
      missing,
      extra,
      detail:
        `required by the registry but not by GitHub: ${missing.join(', ') || '(none)'}; ` +
        `required by GitHub but not by the registry: ${extra.join(', ') || '(none)'}. ` +
        `A context GitHub requires that no job publishes blocks every pull request forever.`,
    })
  }

  if (ENFORCEABLE_SET.strict && !strict) {
    findings.push({
      code: 'not-strict',
      severity: conclusive,
      detail:
        'No layer requires the branch to be up to date before merging (classic `strict`, ' +
        'or a ruleset\'s `strict_required_status_checks_policy`). Two pull requests green ' +
        'on their own can merge into a red main.',
    })
  }

  if (ENFORCEABLE_SET.pullRequest && !pullRequest) {
    findings.push({
      code: 'no-pull-request-required',
      severity: conclusive,
      detail:
        'No layer requires a pull request, so a direct push to main — which auto-deploys to ' +
        'production — is not stopped by any required check.',
    })
  }

  for (const layer of layers) {
    if (!layer.bypassKnown || layer.bypass.length === 0) continue
    const actors = layer.bypass.map((a) => ({
      layer: layer.source,
      actor_type: a?.actor_type ?? 'unknown',
      actor_id: a?.actor_id ?? null,
      bypass_mode: a?.bypass_mode ?? null,
    }))
    const names = actors.map((a) => `${a.actor_type}:${a.actor_id ?? '?'}`).join(', ')
    findings.push({
      code: layer.source === 'classic' ? 'admins-not-enforced' : 'bypass-actors-present',
      severity: covered ? 'informational' : 'blocking',
      actors,
      detail: covered
        ? `${layer.source} lets ${names} merge around it, but a bypass-free layer enforces the ` +
          `full set on its own, so nobody can merge around the checks.`
        : `${layer.source} lets ${names} merge around it, and no bypass-free layer enforces ` +
          `the full set. Agents here act as the owner, so a bypass actor is a bypass for them.`,
    })
  }

  const unknown = layers.filter((l) => !l.bypassKnown)
  if (unknown.length > 0 && !covered) {
    findings.push({
      code: 'bypass-actors-unreadable',
      severity: 'unevaluable',
      layers: unknown.map((l) => l.source),
      detail:
        `The bypass list of ${unknown.map((l) => l.source).join(', ')} was not returned — ` +
        `GitHub shows bypass_actors only to a token with write access to the ruleset. ` +
        `"Not shown" is not "empty".`,
    })
  }

  if (!codeOwnerReview) {
    findings.push({
      code: 'code-owner-review-off',
      severity: 'informational',
      detail:
        'Code-owner review is not required. Deliberate while this repository has one human ' +
        'maintainer: GitHub blocks self-approval, so requiring it deadlocks every merge. ' +
        'Turn it on when a second human reviewer exists (docs/runbooks/main-ruleset.md).',
    })
  }

  return {
    state: /** @type {const} */ ('protected'),
    sources: layers.map((l) => l.source),
    contexts: [...effective].sort(),
    strict,
    pullRequest,
    codeOwnerReview,
    bypassActors: layers.flatMap((l) =>
      l.bypass.map((a) => ({ layer: l.source, actor_type: a?.actor_type, actor_id: a?.actor_id }))
    ),
    complete,
    findings,
    detail:
      `${BRANCH} is protected by ${layers.map((l) => l.source).join(' + ')} and requires ` +
      `${effective.size} status check(s).` +
      (complete ? '' : ' Classic protection could not be read; it can only add requirements.'),
  }
}

/** A reading, in the words a log line needs. */
function describe(reading) {
  if (!reading) return 'nothing'
  if (reading.status === 0) return reading.error ?? 'no response'
  const message = reading.body?.message ? ` "${reading.body.message}"` : ''
  return `${reading.status}${message}`
}

/**
 * @param {{ requiredContexts: string[], status: string }} claim
 * @param {{ state: string, contexts: string[], detail: string, findings?: Array<{ code: string, severity: string, detail: string }> }} observed
 */
export function verdict(claim, observed) {
  if (observed.state === 'unevaluable') {
    return {
      verdict: 'unevaluable',
      agrees: null,
      summary: observed.detail,
    }
  }

  if (observed.state === 'absent') {
    const agrees = claim.status === 'not-configured'
    return {
      verdict: 'absent',
      agrees,
      summary: agrees
        ? 'No branch protection on main, and docs/controls.json says so. Consistent — and ' +
          'still the highest-value unclosed item in this repository: main auto-deploys to ' +
          'production, so the merge button is the deploy button with nothing in between.'
        : 'docs/controls.json claims the merge gate is configured. It is not. That is the ' +
          'exact failure ADR 015 recorded, reintroduced.',
    }
  }

  const expected = [...claim.requiredContexts].sort()
  const found = [...observed.contexts].sort()
  const same = expected.length === found.length && expected.every((c, i) => c === found[i])
  const findings = observed.findings ?? []

  if (!same && !findings.some((f) => f.code === 'contexts-mismatch' && f.severity !== 'blocking')) {
    return {
      verdict: 'mismatched',
      agrees: false,
      summary:
        `main is protected, but requires a different set of checks than the registry names.\n` +
        `  registry: ${expected.join(', ') || '(none)'}\n` +
        `  GitHub:   ${found.join(', ') || '(none)'}\n` +
        `A context GitHub requires that no job publishes blocks every pull request forever.`,
    }
  }

  // Protected, with the right contexts, and short of the enforceable set in some other way.
  // A half-configured gate is not "not configured" and not "configured": the registry is
  // wrong whichever it says, so this disagrees either way and exits 1.
  const blocking = findings.filter((f) => f.severity === 'blocking')
  if (blocking.length > 0) {
    return {
      verdict: 'mismatched',
      agrees: false,
      summary:
        `main is protected and requires the documented contexts, but falls short of the ` +
        `enforceable set:\n` +
        blocking.map((f) => `  · ${f.code} — ${f.detail}`).join('\n'),
    }
  }

  const open = findings.filter((f) => f.severity === 'unevaluable')
  if (open.length > 0 || !same) {
    return {
      verdict: 'unevaluable',
      agrees: null,
      summary:
        `main is protected (${observed.detail}), but this token could not answer every ` +
        `question the enforceable set asks:\n` +
        open.map((f) => `  · ${f.code} — ${f.detail}`).join('\n'),
    }
  }

  return {
    verdict: 'enforced',
    agrees: claim.status === 'configured',
    summary:
      claim.status === 'configured'
        ? `main requires exactly the documented contexts: ${found.join(', ')}, up to date, ` +
          `through a pull request, with nobody able to bypass.`
        : `main is correctly protected, but docs/controls.json still says "not-configured". ` +
          `Update the registry — a stale registry is the thing this probe exists to prevent.`,
  }
}

/**
 * Read every protection source for a branch, never throwing.
 *
 * Exported for `probe-merge-denial.mjs`, which snapshots the same rules as evidence. Always
 * `GET`; there is no parameter for a method, on purpose.
 *
 * @param {{ api?: string, repo?: string, branch?: string, token?: string | undefined, fetchImpl?: typeof fetch }} [options]
 * @returns {Promise<{ classic: Reading, rules: Reading, rulesets: Record<string, Reading> }>}
 */
export async function readProtection({
  api = API,
  repo = REPO,
  branch = BRANCH,
  token = process.env.GITHUB_TOKEN,
  fetchImpl = fetch,
} = {}) {
  const get = async (pathname) => {
    try {
      const response = await fetchImpl(`${api}${pathname}`, {
        method: 'GET',
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'healthy-jewelry-control-audit',
        },
      })
      let body = null
      try {
        body = await response.json()
      } catch {
        // An unparseable body leaves `status` as the whole answer.
      }
      return { status: response.status, body }
    } catch (error) {
      return { status: 0, error: `Request failed: ${error?.message ?? error}` }
    }
  }

  // Classic protection needs administration read, which no token-less request has; asking
  // anyway would spend a rate-limited request to learn nothing. The rules endpoint is
  // readable by anyone who can read the repository, so it is asked either way.
  const classic = token
    ? await get(`/repos/${repo}/branches/${branch}/protection`)
    : { status: 0, error: 'GITHUB_TOKEN is not set, so classic protection was not asked.' }
  const rules = await get(`/repos/${repo}/rules/branches/${branch}?per_page=100`)

  /** @type {Record<string, Reading>} */
  const rulesets = {}
  if (rules.status === 200 && Array.isArray(rules.body)) {
    const seen = new Map()
    for (const rule of rules.body) {
      if (rule?.ruleset_id == null) continue
      seen.set(String(rule.ruleset_id), rule)
    }
    for (const [id, rule] of seen) {
      // An organisation ruleset lives under the organisation, not the repository.
      const where =
        rule.ruleset_source_type === 'Organization'
          ? `/orgs/${rule.ruleset_source}/rulesets/${id}`
          : `/repos/${repo}/rulesets/${id}`
      rulesets[id] = await get(where)
    }
  }
  return { classic, rules, rulesets }
}

/**
 * How many consecutive green runs on `main` count as "there is now a passing run to enforce
 * against" — the precondition ADR 015 named for enabling protection at all.
 *
 * Four, not one. A single green run after a red streak is as likely to be the flake as the
 * recovery, and this alarm is only worth having if people believe it (ADR 011).
 */
export const PRECONDITION_GREEN_RUNS = 4

/**
 * **Whether the absence of a merge gate should reach a person right now.**
 *
 * Separate from `verdict()` on purpose, and it does not change the exit code. The probe's
 * exit semantics are correct as they stand: "absent, and the registry honestly says so" is a
 * *consistent* state, and failing a scheduled audit over a console action nobody in CI can
 * perform would make the audit a permanent red that people learn to ignore.
 *
 * But consistent is not the same as fine, and until now that finding went into a log file
 * and stopped. `smoke-liveness` and `ci-liveness` each open a labelled issue; the merge gate
 * — the single highest-value unclosed item in this repository, and the reason eleven commits
 * reached `main` unverified on 2026-08-29 — had no channel at all. This is that channel's
 * decision, extracted so it can be pointed at a known answer (ADR 024).
 *
 * Two reasons fire, and only on `absent`:
 *
 *   · `stale-acceptance`  — the gap has not been consciously restated inside
 *     ACCEPTED_GAP_MAX_AGE_DAYS. `control-registry.test.ts` already asserts this, but it
 *     asserts it *in the merge gate*, which is the thing that does not exist. A deadline
 *     enforced only by the absent control is not a deadline.
 *   · `precondition-met` — ADR 015 said protection was "only reasonable once a passing run
 *     existed to enforce against". That is now true, so the one stated blocker is gone and
 *     somebody should be told rather than left to notice.
 *
 * Never on `enforced` (nothing to say), `mismatched` (already exits 1 and fails loudly), or
 * `unevaluable` — ADR 010's separation of "this check failed" from "this check could not
 * run" has to survive here too, or an expired token becomes an alarm about branch protection.
 *
 * @param {{
 *   verdict: string,
 *   control: { acceptedSince?: string, humanAction?: string },
 *   ciConclusions: string[] | null,
 *   now?: Date,
 * }} input
 * @returns {{ escalate: boolean, reason: 'stale-acceptance' | 'precondition-met' | null, detail: string }}
 */
export function escalationDecision({ verdict: state, control, ciConclusions, now = new Date() }) {
  if (state !== 'absent') {
    return {
      escalate: false,
      reason: null,
      detail: `Verdict is "${state}". This alarm speaks only for an absent gate.`,
    }
  }

  if (isStale(control, now)) {
    const days = daysSinceAccepted(control, now)
    return {
      escalate: true,
      reason: 'stale-acceptance',
      detail:
        `The gap was last consciously accepted ${days} days ago, over the ` +
        `${ACCEPTED_GAP_MAX_AGE_DAYS}-day limit. "Accepted" that nobody restates is ` +
        `indistinguishable from "forgotten".`,
    }
  }

  // `null` means the run history could not be read. That is not evidence of anything, and
  // inventing a precondition from an absence is the laundering ADR 006 is about.
  if (Array.isArray(ciConclusions) && ciConclusions.length >= PRECONDITION_GREEN_RUNS) {
    const window = ciConclusions.slice(0, PRECONDITION_GREEN_RUNS)
    if (window.every((c) => c === 'success')) {
      return {
        escalate: true,
        reason: 'precondition-met',
        detail:
          `The last ${PRECONDITION_GREEN_RUNS} CI runs on ${BRANCH} all passed, so the one ` +
          `blocker ADR 015 named — "only reasonable once a passing run existed to enforce ` +
          `against" — no longer holds.`,
      }
    }
  }

  return {
    escalate: false,
    reason: null,
    detail:
      'The gap is absent, documented, recently restated, and there is no fresh run of green ' +
      'CI to enforce against. Nothing new to say.',
  }
}

/**
 * The conclusions of the most recent completed `ci.yml` runs on `main`, newest first.
 *
 * Returns `null` on any failure. A history that could not be read must not read as a
 * history of failures, and must not read as a history of successes either.
 *
 * @returns {Promise<string[] | null>}
 */
async function recentCiConclusions() {
  const token = process.env.GITHUB_TOKEN
  if (!token) return null

  try {
    const response = await fetch(
      `${API}/repos/${REPO}/actions/workflows/ci.yml/runs` +
        `?branch=${BRANCH}&status=completed&per_page=${PRECONDITION_GREEN_RUNS}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'healthy-jewelry-control-audit',
        },
      }
    )
    if (!response.ok) return null
    const body = await response.json()
    const runs = body?.workflow_runs
    if (!Array.isArray(runs)) return null
    return runs.map((run) => run?.conclusion ?? 'unknown')
  } catch {
    return null
  }
}

async function main() {
  const claim = claimed()
  const readings = await readProtection()
  const observed = evaluateProtection(readings, claim)
  const result = verdict(claim, observed)

  // Only asked when the answer can matter. An enforced or unreadable gate escalates
  // nothing, and a request made to decide nothing is a request that can only fail.
  const ciConclusions = result.verdict === 'absent' ? await recentCiConclusions() : null
  const escalation = escalationDecision({
    verdict: result.verdict,
    control: claim,
    ciConclusions,
  })

  const payload = {
    control: 'merge-gate',
    ...result,
    registryStatus: claim.status,
    registryContexts: claim.requiredContexts,
    observedState: observed.state,
    observedSources: observed.sources,
    observedContexts: observed.contexts,
    complete: observed.complete,
    findings: observed.findings,
    detail: observed.detail,
    escalation,
    humanAction: claim.humanAction ?? null,
    recentCiConclusions: ciConclusions,
    // Status codes and rule shapes only — never a header, never the token.
    readings: {
      classic: { status: readings.classic.status, message: readings.classic.body?.message ?? readings.classic.error ?? null },
      rules: { status: readings.rules.status, count: Array.isArray(readings.rules.body) ? readings.rules.body.length : null },
      rulesets: Object.fromEntries(
        Object.entries(readings.rulesets).map(([id, r]) => [
          id,
          { status: r.status, name: r.body?.name ?? null, bypassActorsShown: Array.isArray(r.body?.bypass_actors) },
        ])
      ),
    },
  }

  // Always written, whatever the verdict, and always as data. The reporting step in
  // control-audit.yml reads this file rather than scraping the human-readable output —
  // an alarm that parses prose is an alarm that goes quiet when the prose is reworded.
  fs.writeFileSync(OUTPUT, JSON.stringify(payload, null, 2))

  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(payload, null, 2))
  } else {
    const mark = result.agrees === false ? '✗' : result.agrees === null ? '?' : '✓'
    console.log(`${mark} merge-gate: ${result.verdict}`)
    console.log('')
    console.log(result.summary)
    // Not when the summary already is the detail — an unevaluable verdict carries it
    // verbatim, and a message printed twice reads as two findings.
    if (observed.detail && observed.state === 'absent') {
      console.log('')
      console.log(observed.detail)
    }
    const informational = observed.findings.filter((f) => f.severity === 'informational')
    for (const f of informational) console.log(`\n  (info) ${f.code} — ${f.detail}`)
    if (escalation.escalate) {
      console.log('')
      console.log(`ESCALATE (${escalation.reason}): ${escalation.detail}`)
    }
  }

  // Disagreement between the registry and reality is the only failure. "Absent and
  // honestly documented" exits 0 — enabling protection is a console action, and a
  // blocking check on a state only a human can change is a permanent merge freeze.
  process.exit(result.agrees === false ? 1 : 0)
}

// `pathToFileURL(realpathSync(...))`: the hand-built `file://` comparison never matched
// under a symlinked checkout or an encoded path, and a guard that never matches runs nothing.
if (process.argv[1] && import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href) {
  await main()
}
