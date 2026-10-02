// Healthy Jewelry — the live-surface report has a person attached to it.
//
// ## Why
//
// `probe-live-surface.mjs` ran on the control-audit schedule, classified what the live site
// served, wrote a job summary and a 30-day artifact, and told nobody. A `multiple-causes` or
// `unevaluable` verdict was evidence that expired unread unless someone happened to open the
// run. A report with no reader is the ADR 023 failure: the last link in a control is a person,
// and this one had none.
//
// So every non-clean or unevaluable report becomes **one** issue, updated in place (never a
// comment per run — ADR 011), with a deadline. A named human acknowledges it by commenting
// `/ack <note>`; if nobody has within the window, the plan escalates exactly once, mentioning
// the people `.github/CODEOWNERS` names. A changed finding is a new finding: its fingerprint
// changes, the clock restarts and an earlier `/ack` no longer covers it. A clean report
// closes the issue.
//
// It never fails a merge. The site's state changes with no commit, and a scheduled clock that
// turns pull requests red reaches the person who cannot act (ADR 029).
//
// Pure: the workflow step in `control-audit.yml` lists issues and comments, calls this, and
// applies what it returns (ADR 030).

import { createHash } from 'node:crypto'

export const LIVE_SURFACE_LABEL = 'live-surface-report'
export const LIVE_SURFACE_OVERDUE_LABEL = 'live-surface-overdue'
export const LIVE_SURFACE_TITLE = 'The live site needs a person: the live-surface report is not clean'
export const ACK_WINDOW_HOURS = 72

/** Who may acknowledge: people with standing in the repository, never a drive-by commenter. */
export const ACK_ASSOCIATIONS = /** @type {const} */ (['OWNER', 'MEMBER', 'COLLABORATOR'])

const FINGERPRINT = /<!-- live-surface-fingerprint: ([0-9a-f]+) -->/
const SINCE = /<!-- live-surface-since: (\S+) -->/
const escalatedMarker = (fp) => `<!-- live-surface-escalated: ${fp} -->`

/**
 * Every distinct `@owner` CODEOWNERS names, sorted. The repository has no `*` rule — each rule
 * names a path — so "the owner" is the set of people any rule names, which today is one.
 *
 * @param {string} text
 * @returns {string[]}
 */
export function ownersFromCodeowners(text) {
  const owners = new Set()
  for (const line of String(text).split('\n')) {
    const content = line.replace(/#.*/, '').trim()
    if (!content) continue
    for (const token of content.split(/\s+/).slice(1)) if (token.startsWith('@')) owners.add(token)
  }
  return [...owners].sort()
}

/**
 * What makes two reports "the same finding": the classification, its reason, and which hosts are
 * involved in which way. Timestamps, run URLs, paths, commits and digests are not in it, so a
 * finding that persists keeps its fingerprint across runs and its acknowledgement with it.
 *
 * @param {{ classification: string, reason: string, edgeCommerce?: string[], differences?: object[], observation?: object }} c
 */
export function fingerprintOf(c) {
  // Hosts and kinds, never paths, commits or digests. A persisting problem whose details
  // fluctuate between six-hourly runs — a different path varying, a new deploy on the wrong
  // alias — is the same finding; fingerprinting the details would restart its clock every run
  // and it would never reach the escalation this plan exists to make.
  const o = c.observation ?? {}
  const hostsOf = (xs) => [...new Set((xs ?? []).map((x) => x.host))].sort()
  const facts = {
    classification: c.classification,
    reason: c.reason,
    edgeCommerce: [...new Set(c.edgeCommerce ?? [])].sort(),
    differences: [...new Set((c.differences ?? []).map((d) => `${d.host}|${d.kind}`))].sort(),
    identity: hostsOf(o.identityMismatch),
    variance: hostsOf(o.cacheVariance),
    truncated: hostsOf(o.truncated),
  }
  return createHash('sha256').update(JSON.stringify(facts)).digest('hex').slice(0, 16)
}

/** What a person does about each classification. Short: the evidence is in the run. */
export const NEXT_STEP = {
  'host-identity-mismatch': 'Vercel → Project → Domains: make the apex and www point at one Production deployment, then re-run the control audit.',
  'alias-dns-cdn': 'Compare x-vercel-cache and age in the run artifact; check which deployment each domain is assigned to; purge or reassign.',
  'multiple-causes': 'Two fixes: reassign the domain to the right deployment, and find why that deployment also serves commerce (its commit, then its build cache).',
  'source-build-deploy-chain': 'Read the deployed commit named in the detail; if its source is clean, the build reused a cache — redeploy with the build cache off.',
  'retrieval-or-indexing': 'Nothing in the repository. Request re-indexing of the pages the external retrieval showed.',
  unevaluable: 'Read the reason: a protected or unreachable host, a truncated body or no edge host at all. Fix what stopped the observation, or acknowledge why it is acceptable for now.',
}

/**
 * @param {object} input
 * @param {{ classification?: object } | null} input.evidence  the probe's JSON, or null when it produced none
 * @param {Array<{ number: number, body?: string | null }>} [input.openIssues]  open issues with LIVE_SURFACE_LABEL
 * @param {Array<{ body?: string | null, created_at: string, author_association?: string, user?: { login?: string } }>} [input.comments] the open issue's comments
 * @param {Date} input.now
 * @param {string} input.runUrl
 * @param {string[]} [input.owners]  from ownersFromCodeowners
 * @param {number} [input.ackWindowHours]
 */
export function liveSurfaceIssuePlan({ evidence, openIssues = [], comments = [], now, runUrl, owners = [], ackWindowHours = ACK_WINDOW_HOURS }) {
  const idle = {
    create: false,
    update: null,
    close: [],
    closeComment: '',
    title: LIVE_SURFACE_TITLE,
    labels: [LIVE_SURFACE_LABEL],
    body: '',
    escalationComment: null,
    addLabels: [],
    removeLabels: [],
    acknowledged: null,
  }

  // No verdict is not a finding about the site; the step's own outcome reports a probe that
  // died. Inventing a live-site finding from a missing file is the laundering ADR 010 forbids.
  const c = evidence?.classification
  if (!c || typeof c.classification !== 'string') return idle

  if (c.classification === 'clean') {
    return {
      ...idle,
      close: openIssues.map((i) => i.number),
      closeComment: `The live surface is clean again: ${c.detail}\n\nRun: ${runUrl}`,
    }
  }

  const fp = fingerprintOf(c)
  const existing = openIssues[0] ?? null
  const previousFp = existing?.body?.match(FINGERPRINT)?.[1] ?? null
  const previousSince = existing?.body?.match(SINCE)?.[1] ?? null
  const since = previousFp === fp && previousSince && !Number.isNaN(Date.parse(previousSince)) ? previousSince : now.toISOString()
  const deadline = new Date(Date.parse(since) + ackWindowHours * 3_600_000)

  const ack = comments
    .filter((cm) => ACK_ASSOCIATIONS.includes(/** @type {any} */ (cm.author_association)))
    .filter((cm) => /^\s*\/ack\b/m.test(cm.body ?? ''))
    .filter((cm) => Date.parse(cm.created_at) >= Date.parse(since))
    .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at))[0]
  const acknowledged = ack ? { by: ack.user?.login ? `@${ack.user.login}` : 'a maintainer', at: ack.created_at } : null

  const alreadyEscalated = comments.some((cm) => (cm.body ?? '').includes(escalatedMarker(fp)))
  const overdue = !acknowledged && now.getTime() > deadline.getTime()
  const people = owners.length > 0 ? owners.join(' ') : 'the repository owner'

  const body = [
    `**${c.classification}** — \`${c.reason}\``,
    '',
    c.detail,
    '',
    `**What to do:** ${NEXT_STEP[c.classification] ?? NEXT_STEP.unevaluable}`,
    '',
    acknowledged
      ? `**Acknowledged** by ${acknowledged.by} at ${acknowledged.at}. This issue stays open until the report is clean.`
      : `**Acknowledge by ${deadline.toISOString()}** (${ackWindowHours}h after this finding first appeared): comment \`/ack <what you are doing about it>\`. Only an owner, member or collaborator's \`/ack\` counts. A different finding restarts the clock.`,
    '',
    'Purchase-era copy the probe records (shipping, returns, warranty) is **not** part of this finding: it is in source pending legal review.',
    '',
    `Run (the JSON artifact is the per-request evidence): ${runUrl}`,
    '',
    `<!-- live-surface-fingerprint: ${fp} -->`,
    `<!-- live-surface-since: ${since} -->`,
  ].join('\n')

  return {
    ...idle,
    create: existing === null,
    update: existing?.number ?? null,
    body,
    acknowledged,
    escalationComment:
      overdue && !alreadyEscalated && existing !== null
        ? `${people}: this live-surface finding has not been acknowledged in ${ackWindowHours}h (deadline ${deadline.toISOString()}). ` +
          `Comment \`/ack <note>\` once someone owns it.\n\n${escalatedMarker(fp)}`
        : null,
    addLabels: overdue && existing !== null ? [LIVE_SURFACE_OVERDUE_LABEL] : [],
    // Whenever the current finding is not overdue — acknowledged, or a new finding whose clock has
    // just restarted — the label from an earlier one comes off. Removing an absent label is a no-op.
    removeLabels: !overdue && existing !== null ? [LIVE_SURFACE_OVERDUE_LABEL] : [],
  }
}
