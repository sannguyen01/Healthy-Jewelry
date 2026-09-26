/**
 * Detectors for the premises this project's decisions rest on.
 *
 * ## Why this exists
 *
 * Every other guardrail here asserts **"the code still does X."** None asserted **"the
 * premise behind X still holds."** That gap is invisible while the premises hold, which is
 * exactly how it survived six rounds of audit: a decision made on good evidence quietly
 * becomes a decision made on stale evidence, and nothing goes red. See ADR 008.
 *
 * ## What this module held, and why it now holds one different premise
 *
 * Six premises lived here. Five took the commerce store's own data as input — its locales,
 * its collection set, a spec metafield, order and payment counts, app-owned webhook
 * subscriptions — and lost their subject when the read path went (WS-6). They were no longer
 * collected, but their evaluators stayed in this file for a further week, which is ADR 035's
 * outcome 2 in slow motion: code that reads as a detector and is called by nothing.
 *
 * The sixth was the pinned vendor API version against its published retirement date. It was
 * pure, so it survived WS-6 — and it lost its subject with `scripts/lib/api-version.mjs` in
 * WS-C, because a version pin with no vendor behind it is a clock measuring nothing.
 *
 * **Deleting all six and stopping there would have left a vacuous detector**: a
 * `premise-drift` channel that reads `premise-drift.json`, finds an empty array, and closes
 * every issue as "all premises hold" — about a list with nothing in it. A control whose
 * input set is empty passes by construction, and it would have looked healthier than ever.
 * The six are recorded by id in `scripts/verify-premises.mjs` (`RETIRED_PREMISES`), so their
 * removal is a record rather than an absence.
 *
 * What replaces them is a premise this site actually rests on *now*:
 * {@link checkoutHostPremise}, below.
 *
 * ## Pure on purpose
 *
 * Every evaluator takes already-fetched data and returns a verdict. The caller does the
 * network. That makes the **drifted** branch testable, and the drifted branch is the one
 * that never runs locally — so it is the one most likely to be wrong the day it finally
 * fires.
 *
 * ## Drift is not failure
 *
 * A drifted premise means a recorded decision has gone stale, not that the site is broken.
 * These report separately from the pass/fail checks and never turn the run red. Failing on
 * drift is how the 24-minute E2E suite became noise nobody read.
 *
 * ## Three states, not two
 *
 * `holds: true`, `holds: false`, and `evaluable: false`. The third was missing from every
 * premise this module ever held, because every one of them evaluated a value the caller had
 * already fetched successfully. A DNS lookup does not have that luxury: SERVFAIL, a timeout,
 * or a runner with no resolver at all are "could not ask", and reporting any of them as
 * drift would open a `premise-drift` issue claiming somebody changed DNS when nobody did.
 * ADR 010's separation of "this check failed" from "this check could not run", applied to a
 * premise.
 */

import { isVendorHost } from './browse-only.mjs'

/**
 * @typedef {object} Premise
 * @property {string} id          Stable identifier, matching the decision it guards.
 * @property {string} decision    Where the decision is written down.
 * @property {boolean} holds      True when reality still matches the assumption. False on
 *                                drift *and* when unevaluable — read `evaluable` first.
 * @property {boolean} evaluable  False when the premise could not be asked at all.
 * @property {string} detail      One line, actionable, naming what changed.
 * @property {'blocking' | 'opportunity'} kind
 *   `blocking` — drift means something is broken or unsafe right now.
 *   `opportunity` — drift means a deferred decision is now worth revisiting.
 */

/**
 * The decision the checkout-hostname premise guards.
 *
 * The masterplan records it and the runbook carries its steps. Both are named, because a
 * reader of a `premise-drift` issue needs the reasoning and the procedure, and they live in
 * different places for good reason.
 */
export const CHECKOUT_HOST_DECISION =
  'docs/commerce-elimination-masterplan.md — WS-E step 3; procedure in docs/runbooks/ws-e-dns.md'

/**
 * Resolver outcomes that mean *the name does not exist* or *has no CNAME*, as opposed to
 * *the resolver could not answer*.
 *
 * Node's `dns.promises` reports c-ares status codes. `ENOTFOUND` is NXDOMAIN; `ENODATA` is
 * "the name exists and has no record of the type asked for" — for `resolveCname`, that the
 * hostname is now an A/AAAA record rather than an alias. Both are **answers**. Everything
 * else — `ESERVFAIL`, `ETIMEOUT`, `ECONNREFUSED`, `EREFUSED`, `ENOTINITIALIZED`, and codes
 * nobody anticipated — is treated as an inability to ask, because the unsafe direction for a
 * premise is inventing drift out of a broken resolver.
 */
export const DNS_ANSWER_CODES = /** @type {const} */ (['ENOTFOUND', 'ENODATA'])

/**
 * `checkout.<apex>` still CNAMEs to the vendor.
 *
 * ## The decision this guards
 *
 * WS-E retires the checkout hostname on a clock rather than on a whim: ship browse-only,
 * confirm nothing links to it, wait 30 days, then attach it to Vercel and serve the same 410
 * that `/checkouts/*` serves. Every step of that plan — the observation window, the order of
 * the CAA change, the decision to attach rather than delete — rests on one fact that nobody
 * in this repository controls: **the hostname still points at the vendor's shops host.**
 *
 * If that stops being true outside the plan, the clock is measuring the wrong thing. Either
 * somebody changed DNS without the runbook (and the "nothing links to it" confirmation may
 * never have happened), or the vendor side released the name, or the record now aims at
 * something else entirely — which, for a hostname old emails still link to, is the shape of
 * a subdomain nobody is watching.
 *
 * ## Why a DNS lookup, and why it needs no credential
 *
 * The five retired premises all needed the store's Admin API, and the connector reads
 * `needs_reconnect`. This needs a public resolver and nothing else, so it runs on a smoke
 * tier whose secrets were emptied — the property that kept the browse-only check alive
 * through the same outage.
 *
 * ## The control lookup
 *
 * `control` is the resolution of something that must exist — the apex's own NS records.
 * A resolver that answers NXDOMAIN for *everything* (some sandboxes and captive middleboxes
 * do) would otherwise read as "the checkout hostname was deleted". If the control could not
 * be answered, nothing below it can be trusted, and the verdict is `evaluable: false`. Same
 * reasoning as `isAttributable` in `browse-only.mjs`: attribution before judgement.
 *
 * @param {object} input
 * @param {string} input.host  e.g. `checkout.healthyjewellery.com`
 * @param {{ ok: true, records: string[] } | { ok: false, code: string }} input.cname
 * @param {{ ok: true, records: string[] } | { ok: false, code: string }} input.control
 * @returns {Premise}
 */
export function checkoutHostPremise({ host, cname, control }) {
  const base = {
    id: 'CHECKOUT-HOST-CNAME',
    decision: CHECKOUT_HOST_DECISION,
    // Blocking, not opportunity: a hostname carried in old emails and bookmarks that now
    // resolves somewhere unplanned is a safety question today, not a decision to revisit
    // at leisure. It still never fails the run — premise drift reports, it does not block.
    kind: /** @type {const} */ ('blocking'),
  }

  if (!control || control.ok !== true || control.records.length === 0) {
    const why = control && control.ok === false ? control.code : 'no records'
    return {
      ...base,
      holds: false,
      evaluable: false,
      detail:
        `Could not evaluate: the control lookup (the apex's NS records) failed with ${why}. ` +
        `A resolver that cannot find the apex cannot be believed about ${host}, so nothing ` +
        `was concluded. This is not drift.`,
    }
  }

  if (cname.ok === false && !DNS_ANSWER_CODES.includes(/** @type {any} */ (cname.code))) {
    return {
      ...base,
      holds: false,
      evaluable: false,
      detail:
        `Could not evaluate: resolving ${host} returned ${cname.code}, which is the resolver ` +
        `failing rather than answering. The control lookup succeeded, so this is specific to ` +
        `this name — worth a second look if it persists, and not evidence that DNS changed.`,
    }
  }

  if (cname.ok === false) {
    const meaning =
      cname.code === 'ENOTFOUND'
        ? `${host} no longer exists (NXDOMAIN)`
        : `${host} exists but is no longer a CNAME (ENODATA) — it is now an address record`
    return {
      ...base,
      holds: false,
      evaluable: true,
      detail:
        `${meaning}. The WS-E plan retires this hostname only after confirming nothing links ` +
        `to it and waiting 30 days; a change outside that plan means the clock is measuring ` +
        `a premise that is gone. Find out who changed it, and whether the "nothing links to ` +
        `it" confirmation was ever made, before resuming the runbook.`,
    }
  }

  const targets = cname.records.map((r) => String(r).toLowerCase().replace(/\.$/, ''))
  const vendor = targets.filter(isVendorHost)
  if (vendor.length > 0) {
    return {
      ...base,
      holds: true,
      evaluable: true,
      detail:
        `${host} still CNAMEs to ${vendor.join(', ')}, the vendor's shops host. The WS-E ` +
        `30-day clock rests on current evidence.`,
    }
  }

  return {
    ...base,
    holds: false,
    evaluable: true,
    detail:
      `${host} now CNAMEs to ${targets.join(', ') || '(an empty answer)'}, which is not the ` +
      `vendor. Nobody ran the WS-E runbook's last step, or this repository would have ` +
      `recorded it: somebody changed DNS outside the plan. Confirm the new target is ours ` +
      `and intended — a hostname old checkout links still point at, aimed somewhere ` +
      `unreviewed, is how a subdomain gets taken over.`,
  }
}

/**
 * What `premise-drift.json` should contain, or `null` when it must not be written.
 *
 * The reporting step in `production-smoke.yml` reads that file with a three-way contract:
 *
 *   · a **non-empty array** opens or updates the `premise-drift` issue;
 *   · an **empty array** closes it — "all premises hold again";
 *   · a **missing file** returns early — "premises could not be evaluated".
 *
 * Every premise this module used to hold was always evaluable, so the old writer produced
 * only the first two. A DNS premise can produce the third, and writing `[]` for it would
 * announce "all premises hold again" about a resolver that never answered — closing a real
 * drift issue on the strength of a timeout. So: drifted premises are always written (an
 * unevaluable neighbour does not hide them); an empty drift list is written only when every
 * premise was actually asked.
 *
 * @param {Premise[]} premises
 * @returns {Premise[] | null}
 */
export function driftFileContent(premises) {
  const drifted = premises.filter((p) => p.evaluable !== false && !p.holds)
  if (drifted.length > 0) return drifted
  if (premises.some((p) => p.evaluable === false)) return null
  return []
}

/**
 * Format for the console and the job summary.
 *
 * @param {Premise[]} premises
 */
export function formatPremises(premises) {
  const drifted = premises.filter((p) => p.evaluable !== false && !p.holds)
  const unevaluable = premises.filter((p) => p.evaluable === false)
  const mark = (p) => (p.evaluable === false ? '?' : p.holds ? '·' : '!')
  const lines = premises.map((p) => `${mark(p)} ${p.id} — ${p.detail}`)

  const parts = []
  if (drifted.length > 0) {
    parts.push(
      `${drifted.length} of ${premises.length} premises have drifted: ` +
        drifted.map((p) => p.id).join(', ')
    )
  }
  if (unevaluable.length > 0) {
    parts.push(
      `${unevaluable.length} of ${premises.length} could not be evaluated: ` +
        unevaluable.map((p) => p.id).join(', ')
    )
  }

  return {
    drifted,
    unevaluable,
    lines,
    summary: parts.length === 0 ? `All ${premises.length} premises hold.` : `${parts.join('. ')}.`,
  }
}
