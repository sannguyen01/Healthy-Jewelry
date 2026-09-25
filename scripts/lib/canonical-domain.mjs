// Healthy Jewelry — is the brand domain actually bound to the production deployment?
//
// ## The question nothing in this repository asks
//
// Every live check we have fetches `PRODUCTION_SITE_URL` and asserts something about what
// came back. That proves *the thing at that name answers*. It cannot prove:
//
//   · that the apex and `www` reach the same Vercel project;
//   · that either of them is serving the **Production** deployment rather than a preview;
//   · that the commit they serve is the commit `main` is on;
//   · that the hostname the code believes in (`SITE_URL` in `src/config/site.ts`) is the
//     hostname that is bound.
//
// Each of those has already gone wrong here in a way no browser could show you.
// `docs/dns-domain-setup.md` records `account.healthyjewellery.com` resolving to a Vercel
// anycast IP, returning 404, with **no project in the account claiming the hostname** — a
// record that looks correct in a DNS panel and is attached to nothing. And a branch alias
// keeps serving whatever last built on that branch forever, including after the branch is
// deleted: it renders, it navigates, and it is a snapshot of an app that no longer exists.
//
// ## Why the decision is a function and the network is somewhere else
//
// ADR 030. `escalation.mjs` exists because 110 lines of decision logic lived inside a YAML
// string, could not be imported, could not be tested, and was broken three separate ways
// for its entire life without once being observed. Everything below is pure: it takes
// observations and returns a verdict. `scripts/probe-canonical-domain.mjs` does the I/O and
// nothing else, so every branch here is reachable from a fixture (ADR 024).

/**
 * The verdicts. Three, not two — and the third is the point.
 *
 * `unevaluable` is kept rigidly distinct from `drifted` because "the binding is wrong" and
 * "I could not find out" are different facts that demand different actions, and collapsing
 * them is the laundering ADR 010 is about. A sandboxed agent session has no public-web
 * egress at all; that must never be reportable as a healthy domain, and equally must never
 * open an issue claiming the domain is broken.
 */
export const CANONICAL_STATES = /** @type {const} */ (['bound', 'drifted', 'unevaluable'])

/**
 * How a failed request should be read.
 *
 * `describeFetchError` in `./fetch-error.mjs` groups `ENOTFOUND` with `EAI_AGAIN`, which is
 * right for a *hint* to a human and wrong for a verdict. They mean opposite things here:
 *
 *   · `ENOTFOUND` is an authoritative NXDOMAIN. The name does not exist. That is not a
 *     failure to measure — it **is** the measurement, and the answer is "unbound".
 *   · `EAI_AGAIN` is the resolver declining to answer right now. So is a timeout, so is a
 *     proxy refusing CONNECT. Those are failures to measure.
 *
 * Reported as a finding in the first case and as `unevaluable` in the second.
 *
 * @param {string} description output of `describeFetchError`
 * @returns {'not-resolved' | 'unreachable'}
 */
export function classifyTransportFailure(description) {
  // ENOTFOUND first: a description can contain both codes when the cause chain is nested,
  // and the authoritative answer outranks the retryable one.
  if (description.includes('ENOTFOUND')) return 'not-resolved'
  return 'unreachable'
}

/**
 * Did this response actually come from our origin, or from something in between?
 *
 * Found by running the probe rather than by reasoning about it. A sandboxed agent session
 * routes egress through a proxy that answers blocked hosts with a bare **HTTP 403** — no
 * `server` header, no body — and the first version of this probe read that as "the brand
 * domain answered 403", producing five confident findings about a domain it had never
 * reached. That is ADR 010's laundering running backwards: an inability to measure,
 * reported as a measurement. A scheduled audit that does this opens a false issue about
 * production every six hours.
 *
 * The rule is attribution, not proxy-detection, because special-casing one proxy would
 * leave the next middlebox to rediscover the same bug:
 *
 *   · A response carrying `server: Vercel`, or a readable `/api/version` body, is **ours**.
 *     Judge it, whatever it says.
 *   · A response from some *other* identified server is also attributable — that is a real
 *     domain pointed at the wrong place, which is a finding this probe exists to make.
 *   · A refusal from something that identifies itself as nothing — 403 or 407 with no
 *     `server` header and nothing readable — is attributable to no origin at all, and is
 *     therefore evidence of nothing.
 *
 * 407 is included because it is unambiguously a proxy; 403 because that is the shape
 * observed. Both are narrowed by the absence of a `server` header, so a genuine Vercel
 * Deployment Protection 403 (which sends one) still reaches the decision as a finding.
 *
 * @param {{ status?: number, server?: string | null, version?: unknown }} response
 * @returns {'origin' | 'intercepted'}
 */
export function classifyResponseOrigin({ status, server, version }) {
  if (server) return 'origin'
  if (version && typeof version === 'object') return 'origin'
  if (status === 403 || status === 407) return 'intercepted'
  return 'origin'
}

/**
 * Every way this can be wrong, named.
 *
 * An enumeration rather than free text because `docs/failure-modes.md` reconciles union
 * types against prose in both directions (ADR 019), and because an issue body that says
 * `commit-mismatch` is greppable in a way that "the domains disagreed" is not.
 */
export const CANONICAL_FINDINGS = /** @type {const} */ ([
  'unresolved',
  'unreachable',
  'not-ok',
  'not-vercel',
  'version-unreadable',
  'not-production',
  'commit-mismatch',
  'commit-behind-main',
  'www-not-redirected',
  'apex-redirected',
  'off-domain-redirect',
  'config-host-mismatch',
])

/**
 * @typedef {object} HostObservation
 * @property {string} host the hostname that was requested
 * @property {'ok' | 'not-resolved' | 'unreachable'} transport
 *   `unreachable` also covers a response no origin can be held responsible for —
 *   see {@link classifyResponseOrigin}.
 * @property {string} [detail] transport failure description, when not `ok`
 * @property {number} [status] final HTTP status, after following redirects
 * @property {string[]} [chain] hostnames traversed in order, ending with the one that answered
 * @property {string | null} [server] the `server` response header
 * @property {{ build?: { commit?: string | null, vercelEnv?: string | null },
 *              runtime?: { vercelEnv?: string | null } } | null} [version]
 *           parsed `/api/version` body, or null when it could not be parsed
 */

/**
 * @typedef {object} CanonicalVerdict
 * @property {'bound' | 'drifted' | 'unevaluable'} state
 * @property {{ code: string, detail: string }[]} findings
 * @property {string} summary one line, safe for an issue title
 * @property {string | null} action what a person should do, or null when nothing is wrong
 */

/**
 * Decide whether the canonical domain is bound to production.
 *
 * @param {object} input
 * @param {HostObservation[]} input.observations one per hostname, apex first
 * @param {string} input.apexHost the hostname `src/config/site.ts` names — the join that
 *   stops this probe passing against a domain the application does not believe in (ADR 024)
 * @param {string | null} [input.expectedCommit] `main`'s tip, when the caller knows it
 * @returns {CanonicalVerdict}
 */
export function decideCanonicalDomain({ observations, apexHost, expectedCommit = null }) {
  /** @type {{ code: string, detail: string }[]} */
  const findings = []
  const add = (code, detail) => findings.push({ code, detail })

  if (!Array.isArray(observations) || observations.length === 0) {
    return {
      state: 'unevaluable',
      findings: [{ code: 'unreachable', detail: 'No observations were supplied.' }],
      summary: 'Domain binding could not be evaluated: nothing was observed.',
      action: null,
    }
  }

  const apex = observations.find((o) => o.host === apexHost)
  if (!apex) {
    // Not a domain problem — a probe pointed at the wrong thing. Loudly its own bug.
    return {
      state: 'unevaluable',
      findings: [
        {
          code: 'config-host-mismatch',
          detail:
            `No observation was made for ${apexHost}, which is the host src/config/site.ts ` +
            `names. Observed instead: ${observations.map((o) => o.host).join(', ') || 'nothing'}.`,
        },
      ],
      summary: `The probe did not observe ${apexHost}, the host this application believes in.`,
      action: 'Fix the probe, not the domain: its host list and src/config/site.ts disagree.',
    }
  }

  // ── Transport ────────────────────────────────────────────────────────────────────────
  // Split before anything else, because a host that never answered cannot contribute to a
  // commit comparison and must not be silently treated as agreeing.
  const unreachable = observations.filter((o) => o.transport === 'unreachable')
  const unresolved = observations.filter((o) => o.transport === 'not-resolved')
  const answered = observations.filter((o) => o.transport === 'ok')

  for (const o of unresolved) {
    add('unresolved', `${o.host} does not resolve (${o.detail ?? 'NXDOMAIN'}).`)
  }

  if (answered.length === 0) {
    if (unresolved.length > 0) {
      // Every host authoritatively does not exist. That is an answer, and a bad one.
      return {
        state: 'drifted',
        findings,
        summary: `Neither ${observations.map((o) => o.host).join(' nor ')} resolves.`,
        action:
          'Vercel → Project → Settings → Domains: the brand domain is not attached to this ' +
          'project. Add it and assign it to Production.',
      }
    }
    return {
      state: 'unevaluable',
      findings: unreachable.map((o) => ({
        code: 'unreachable',
        detail: `${o.host} could not be reached (${o.detail ?? 'no detail'}).`,
      })),
      summary: 'Domain binding could not be evaluated: no host answered.',
      action: null,
    }
  }

  // A host that could not be reached, while others answered, is a gap in the evidence
  // rather than a finding about the domain. Recorded so the verdict is never read as
  // covering more than it measured.
  for (const o of unreachable) {
    add('unreachable', `${o.host} could not be reached (${o.detail ?? 'no detail'}); not assessed.`)
  }

  // ── Each host that answered ──────────────────────────────────────────────────────────
  const hostSet = new Set(observations.map((o) => o.host))

  /**
   * Does the apex hand its traffic to the other hostname under test?
   *
   * **This question was not asked until 2026-09-21, and its absence is the finding.**
   *
   * The loop below walks each host's redirect chain, and the branch that judges a chain
   * ending somewhere else was written `o.host !== apexHost && landed !== apexHost` — a
   * condition about `www` that excludes the apex from its own check. So on 2026-09-20,
   * when `healthyjewellery.com` began answering 307 and handing every path to
   * `www.healthyjewellery.com`, this probe walked the chain, landed on a host it knew
   * about, found a healthy production deployment there, and reported exactly one problem:
   * that **www** was not redirecting to the apex.
   *
   * That is the symptom read backwards. It is true — www does serve its own response —
   * but it is true *because* the redirect is installed on the apex, in the wrong
   * direction. A person sent to Vercel by that issue is told to fix the hostname that is
   * behaving as configured, and is not told that the canonical origin, the one every
   * absolute URL in this application names, serves nothing but a hand-off.
   *
   * The cost was not only a confusing issue. `verify-browse-only.mjs` anchors on the same
   * apex and reported twenty-five findings about a catalogue that was being served
   * correctly, because nothing in either probe could say the words "the apex redirects".
   *
   * Suppressing `www-not-redirected` when this fires, because the two cannot both be
   * actionable: www cannot redirect to a host that redirects to www.
   */
  const apexChain = apex.chain ?? [apex.host]
  const apexLanded = apexChain[apexChain.length - 1]
  const apexHandsOver = apex.transport === 'ok' && apexLanded !== apexHost && hostSet.has(apexLanded)

  for (const o of answered) {
    if (o.status !== 200) {
      add('not-ok', `${o.host} answered ${o.status} rather than 200.`)
    }

    // Vercel identifies itself on every response it serves. Its absence means the name is
    // pointed somewhere else entirely — the shape `account.healthyjewellery.com` already has.
    if (o.server && o.server.toLowerCase() !== 'vercel') {
      add('not-vercel', `${o.host} is served by "${o.server}", not Vercel.`)
    }

    const chain = o.chain ?? [o.host]
    const landed = chain[chain.length - 1]
    if (!hostSet.has(landed)) {
      add(
        'off-domain-redirect',
        `${o.host} redirects to ${landed}, which is neither of the hostnames under test.`
      )
    } else if (o.host === apexHost && landed !== apexHost) {
      // The redirect is installed on the canonical origin, pointing away from it. Every
      // absolute URL this application emits — JSON-LD, the OG card, the sitemap, the
      // canonical link, every `SITE_URL` interpolation — names a host that serves nothing
      // but a hand-off, and a crawler following a 307 is told the move is temporary.
      add(
        'apex-redirected',
        `${apexHost} answers ${o.status} and redirects to ${landed}, so the canonical ` +
          `origin serves no content of its own. The redirect belongs on ${landed}, ` +
          `pointing at ${apexHost}, and it should be permanent (308).`
      )
    } else if (o.host !== apexHost && landed !== apexHost && !apexHandsOver) {
      // `www` is expected to hand over to the apex. Serving its own copy is not an outage,
      // but it is two canonical origins for one site, which is the duplicate-content
      // problem `SITE_URL` exists to prevent.
      //
      // Silent while the apex is the one redirecting: www cannot redirect to a host that
      // redirects to www, so reporting both would give a reader two instructions that
      // contradict each other.
      add(
        'www-not-redirected',
        `${o.host} serves its own response instead of redirecting to ${apexHost}.`
      )
    }

    if (!o.version || typeof o.version !== 'object') {
      add('version-unreadable', `${o.host} did not return a readable /api/version body.`)
      continue
    }

    // `runtime.vercelEnv` is read at request time; `build.vercelEnv` was inlined at build
    // time. Prefer runtime — a Production alias serving a bundle built as a preview is
    // precisely the confusion being hunted, and only the runtime value is about *now*.
    const env = o.version.runtime?.vercelEnv ?? o.version.build?.vercelEnv ?? null
    if (env !== 'production') {
      add(
        'not-production',
        `${o.host} is serving a deployment whose environment is ${env ?? 'unset'}, not production.`
      )
    }
  }

  // ── Agreement between hosts ──────────────────────────────────────────────────────────
  const commits = answered
    .map((o) => o.version?.build?.commit ?? null)
    .filter((c) => typeof c === 'string' && c.length > 0)

  if (new Set(commits).size > 1) {
    add(
      'commit-mismatch',
      `The hostnames serve different commits (${[...new Set(commits)].map((c) => c.slice(0, 7)).join(', ')}). ` +
        'They are bound to different deployments.'
    )
  }

  if (expectedCommit && commits.length > 0 && !commits.includes(expectedCommit)) {
    add(
      'commit-behind-main',
      `The served commit ${commits[0].slice(0, 7)} is not main's tip ${expectedCommit.slice(0, 7)}. ` +
        'Either a deploy has not finished, or production is pinned to an older deployment.'
    )
  }

  // ── Verdict ──────────────────────────────────────────────────────────────────────────
  // `unreachable` alone never condemns: it is missing evidence, not bad evidence.
  const substantive = findings.filter((f) => f.code !== 'unreachable')

  if (substantive.length === 0) {
    return {
      state: 'bound',
      findings,
      summary: `${apexHost} is bound to the production deployment.`,
      action: null,
    }
  }

  return {
    state: 'drifted',
    findings,
    summary: `${apexHost}: ${substantive.length} problem${substantive.length === 1 ? '' : 's'} with the production domain binding.`,
    action: apexHandsOver
      ? `Vercel → Project → Settings → Domains. The redirect is on the wrong hostname: ` +
        `${apexHost} is set to redirect to ${apexLanded}, and it must be the other way ` +
        `round. Clear the redirect on ${apexHost} so it serves the Production deployment ` +
        `directly, then set ${apexLanded} to redirect to ${apexHost} permanently (308). ` +
        `Do not change DNS at Shopify — see docs/dns-domain-setup.md.`
      : 'Vercel → Project → Settings → Domains. Both hostnames must be attached to this ' +
        'project and assigned to Production, with www redirecting permanently to the apex. ' +
        'Do not change DNS at Shopify — see docs/dns-domain-setup.md.',
  }
}

/**
 * Pull the canonical hostname out of `src/config/site.ts`.
 *
 * Reading a TypeScript constant from a dependency-free `.mjs` script means either a parser
 * or a pattern, and ADR 007 is blunt that a pattern has unknown coverage. The coverage is
 * made known instead of assumed: `src/tests/unit/canonical-domain-decision.test.ts` imports
 * the real `SITE_URL` and asserts this function returns its hostname. The regex is allowed
 * to be a regex because something compares it to the truth.
 *
 * @param {string} source contents of src/config/site.ts
 * @returns {string | null} the hostname, or null if the literal could not be found
 */
export function apexHostFromSiteConfig(source) {
  // Anchored on the export and the fallback literal specifically. `SITE_URL` is
  // `process.env.NEXT_PUBLIC_SITE_URL || '<literal>'`, and the literal is the value that
  // ships when the variable is unset — which is the one a probe should hold production to.
  const match = source.match(
    /export\s+const\s+SITE_URL\s*=[^\n]*?\|\|\s*['"]https?:\/\/([^'"/]+)['"]/
  )
  if (!match) return null
  try {
    return new URL(`https://${match[1]}`).hostname
  } catch {
    return null
  }
}

// ── Reporting ────────────────────────────────────────────────────────────────────────────
//
// What the audit workflow should do with a verdict, decided here rather than in YAML.
//
// `workflow-inline-script-budget.test.ts` rejected the first version of that step at 64
// lines against a 45-line budget, and it was right to: choosing when to open, update or
// close an issue is a decision, and a decision inside a YAML string cannot be imported, so
// no test can reach it. That is how the production-smoke escalation shipped three bugs and
// posted a hundred comments without ever escalating (ADR 030). The block left behind reads
// a file, lists issues, calls this, and applies what it returns.

export const DOMAIN_ISSUE_LABEL = 'domain-unbound'
export const DOMAIN_ISSUE_TITLE = 'The brand domain is not bound to the production deployment'

/**
 * @typedef {object} DomainIssuePlan
 * @property {number[]} close issue numbers to comment on and close
 * @property {string} closeComment the recovery note, when `close` is non-empty
 * @property {number | null} update an issue number to rewrite in place, or null
 * @property {boolean} create whether to open a new issue
 * @property {string} body the issue body, when updating or creating
 */

/**
 * Decide what the audit should do about a domain verdict.
 *
 * Updates in place rather than commenting, per ADR 011: issue #24 accumulated 111 identical
 * comments and taught everyone to mute the channel. One issue, rewritten.
 *
 * **Only `drifted` opens anything.** `unevaluable` deliberately does not: the probe exits 0
 * when it could not reach the public web, and a runner without egress must never file an
 * issue claiming the domain broke. It also does not *close* a standing issue, because not
 * being able to look is not evidence that the problem went away.
 *
 * @param {object} input
 * @param {{ state?: string, summary?: string, action?: string | null,
 *           findings?: { code: string, detail: string }[] } | null} input.probe
 *        parsed canonical-domain.json, or null when the probe produced none
 * @param {{ number: number }[]} input.openIssues currently-open issues carrying the label
 * @param {string} input.runUrl
 * @returns {DomainIssuePlan}
 */
export function domainIssuePlan({ probe, openIssues = [], runUrl }) {
  const idle = { close: [], closeComment: '', update: null, create: false, body: '' }

  // No verdict at all — the probe died before deciding. Say nothing; the step's own
  // outcome is what reports that, and inventing a domain finding from a missing file
  // would be the laundering this whole probe exists to avoid.
  if (!probe || typeof probe.state !== 'string') return idle
  if (probe.state === 'unevaluable') return idle

  if (probe.state !== 'drifted') {
    return {
      ...idle,
      close: openIssues.map((i) => i.number),
      closeComment: `Resolved: ${probe.summary ?? 'the canonical domain is bound again.'}\n\nRun: ${runUrl}`,
    }
  }

  const body = [
    probe.summary ?? 'The canonical domain is not bound as expected.',
    '',
    'This is a configuration fact, not an outage: a correct deployment on the wrong hostname',
    'and a correct hostname on the wrong deployment both render a working shop. See',
    '`docs/adr/032-the-canonical-domain-is-a-claim-nothing-checked.md`.',
    '',
    ...(probe.findings ?? []).map((f) => `- **${f.code}** — ${f.detail}`),
    '',
    probe.action ?? '',
    '',
    `Run: ${runUrl}`,
  ].join('\n')

  return {
    close: [],
    closeComment: '',
    update: openIssues.length > 0 ? openIssues[0].number : null,
    create: openIssues.length === 0,
    body,
  }
}
