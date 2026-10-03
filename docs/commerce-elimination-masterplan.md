# Commerce elimination masterplan — v2

The execution plan for finishing the removal of Shopify commerce from Healthy Jewellery without
breaking the browse-only website, its contact path, or the relationship between a visitor and
the street ambassador they met. It does not propose replacing Shopify with another online
transaction system.

**This file is the plan of record.** v1 merged with PR #88 on 2026-09-25 and is superseded by
this revision (PR #90). Where this file disagrees with a *measurement*, the measurement wins and
this file is wrong — and v1 is the proof that it happens: it was wrong about its own burn-down
on the day it merged (§3, finding F1).

**Classification, unchanged from v1.** Historical by construction for the numeric sweep —
outside `EXPLICIT_AGENT_DOCS`, so its figures are dated observations rather than standing
claims — and ordinary `executable` prose under the contract, carried by a WS-I register row
that deletes it when the last row closes. **A plan for work that is finished is a plan somebody
will start.** Every live count below is also printed by
`pnpm verify:commerce-contract --summary`; read that, not this, for today's figure.

---

## 0. What changed, and why

A brief arrived proposing a revised plan: protect `main` first, resolve a live-site
discrepancy, strengthen the computational boundary, and coordinate nine workstreams to an
evidence-based definition of done. It was **measured against the repository rather than read
against v1**. The measurement found 25 defects, omissions and false premises — some in the
brief, some in v1, some in the controls PR #88 had just shipped, and five live on the site
that day. The brief was directionally right about almost everything and wrong about several
things that mattered, most of all about the order of operations and about what one of its own
exit tests would do to production.

v2 adopts the brief where it was right, corrects it where the tree disagreed, and **executes
every part a repository can execute**. The rest — console settings, platform credentials, DNS,
legal review — is turned into runbooks with read-only commands first and empty evidence cells.

The owner decided three questions on 2026-09-25:

| Question | Decision |
|---|---|
| Unevidenced skin-safety, biocompatibility, medical and corrosion claims | **Enforce now** — render a neutral factual fallback until a named reviewer approves each against a document |
| Arc · Halo · Orbit · Facet · Disc · Bar · Cuff · Split · Hoop | **Design taxonomy** — forms classify pieces, they do not name them; nothing is renamed |
| Branch protection versus agent work | **Work now, gate the merge** — isolated branches may proceed; nothing merges until `main` carries a ruleset and a refusal is proven read-only |

---

## 1. Target architecture and invariants

```
Visitor ──► canonical HTTPS domain ──► Vercel / Next.js, browse-only
                                          ├─ versioned catalogue records (src/content/catalog)
                                          ├─ reviewed material facts; claims only with evidence (src/content/claims)
                                          ├─ low-pressure ambassador and Company contact paths
                                          └─ privacy-limited, first-party measurement

Forbidden:  visitor → cart, checkout, account, payment, order, price, stock
            runtime → any commerce, payment, shipping, tax or inventory service
            deploy  → active commerce credentials or transaction webhooks
```

The brief's six invariants are adopted as written — no transaction, no commerce dependency,
evidence before claims, controlled data, honest retirement, enforced change control — and each
now has a check that can fail (§4, §10).

---

## 2. Ground truth, measured 2026-09-27

| Fact | Value | Source |
|---|---|---|
| Unit tests | **107 files · 3244 passed · 6 skipped · 0 failed** (98.49% statements) | `pnpm exec vitest run --coverage` |
| E2E | **696 passed · 8 skipped · 0 failed** (chromium + mobile, production build) | `pnpm e2e` |
| E2E before this work | 462 passed | same, at `1b6ae81` |
| Registered controls | **45** (29 before) | `docs/controls.json` |
| Mutation sentinels | **33** — all **31** vitest sentinels proven `alive` | `node scripts/probe-assertion-liveness.mjs` |
| Build-output scan | 238 client assets · 317 server files · 149 source maps inspected · **0 blocking** | `node scripts/scan-build-artifacts.mjs` |
| Register rows | **53 → 34** | `pnpm verify:commerce-contract --summary` |
| CI on PR #90 | all three required contexts green at each pushed integration step | GitHub checks |

Register burn-down by workstream:

| WS | Before | After | What closed or opened |
|---|---|---|---|
| A | 12 | 1 | revalidate route, vendor config, API-version module and their tests; version route rewritten |
| B | 1 | 0 | the handle-contract test's built-in exemption left with its subject |
| C | 21 | 12 | diagnose-deployment, the API-version pin and premise, their tests; then the escalation caveat's vendor-specific cause and the Playwright web server's commerce env, the only two rows a row-by-row audit found closable before WS-F |
| D | 2 | 3 | +1 runbook |
| E | 1 | 2 | +1 runbook |
| F | 8 | 9 | +1 runbook; the webhook route and its HMAC utilities stay, by design |
| G | 1 | 0 | `docs/analytics.md` rewritten without a funnel |
| I | 7 | 7 | this file and the agent guidance still describe what is standing |

---

## 3. Diagnostic review of the brief — 25 findings

Every finding was measured, and each says where it stands now.

### A. Governance and the merge gate

| # | Finding | Now |
|---|---|---|
| A1 | The brief blocks all agent work until `main` is protected. The risk is the **merge**, not the work: isolated branches merged by one integrator into one draft PR need no protection until that PR merges. | Adopted as S1. Work proceeded; the merge waits on the ruleset. |
| A2 | Its exit test — open a known-bad PR and have GitHub refuse the merge — means **pressing merge**. If the rule is misconfigured, the bad PR lands on `main`, and `main` auto-deploys to production. | Replaced by a read-only proof: `scripts/probe-merge-denial.mjs` reads mergeability and the failing required check, and cannot merge by construction. |
| A3 | "Checks against a candidate merge result" means a merge queue, and `ci.yml` had no `merge_group:` trigger — a queue would wait forever. `Dependency scope` is `if: pull_request`, and a skipped required check reports success. | `merge_group:` wired; the skip documented at the job and in the runbook; strict mode recommended over a queue. |
| A4 | The protection probe read only the classic endpoint and compared only contexts: a **ruleset** — the brief's own recommendation — read as `absent`; strict mode, bypass actors and required reviews were never checked. Its fixture carried two contexts against a registry of three. | Probe reads rulesets and classic protection and judges all of it; fixture carries three. |
| A5 | No `CODEOWNERS` existed. | Added, with a test that every rule has a subject. |
| A6 | Agents act through the owner's identity, so "agents may not bypass" cannot be a bypass list; required code-owner review deadlocks a one-maintainer repository, because GitHub blocks self-approval. | Decision recorded (§7): no bypass actors, strict required checks, a pull request required, agents never merge; code-owner review switches on with a second human reviewer. |

### B. The live-site discrepancy

| # | Finding | Now |
|---|---|---|
| B1 | Part of the "purchase-era material" was **in the current source**, not a stale cache: free worldwide shipping and thirty-day returns in `/shipping`'s search snippet, a lifetime corrosion warranty and free returns in `/terms`'s, "How do I buy something?" in the FAQ. The retrieval may simply have been right. | Snippets neutralised; the contractual body text held in an equality-pinned legal-review inventory for the adviser (WS-H), not rewritten by engineers. |
| B2 | The live probe matched only JSON-LD and control markers — it would have called a page showing a rendered price clean — and recorded no headers, digest or build identity, never probing the deployment URL. | `commerce-visible-price` finding; `scripts/probe-live-surface.mjs` with a pure `classifyDiscrepancy()` encoding the brief's four diagnostic rules, wired report-only into `control-audit.yml`. |

### C. The boundary PR #88 had just shipped

| # | Finding | Now |
|---|---|---|
| C1 | The register reconciled **by path**; the Identifiers column was parsed and never read. Two rows had already drifted; duplicate rows collapsed into a `Set`. | Exact-set reconciliation, four new finding codes, mutation-tested. [ADR 037](adr/037-a-reconciliation-at-the-wrong-grain.md). |
| C2 | The lexer was worse than documented: a `/*` inside a string swallowed the lines after it; 661 lines in 67 files were misread; one misread hid an absolute finding. The "safe direction" it claimed was never safe for a prohibition scanner. | String-, template-, regex- and JSX-aware lexer, checked line by line against the TypeScript compiler over every tracked script. |
| C3 | The `excluded` class skipped the credential-value rule. | The value rule reads every tracked text file. |
| C4 | The negative-control exemption was earned by the word "expect" in a comment, and negative-control and specification files were whole-file exemptions. | Evidence must be in code; §4 `Carries` declares exactly what each exemption covers, reconciled as a set. It caught real drift twice on its first day. |
| C5 | The contract was not the single source it claimed: §8 was parsed and enforced nowhere; §7's statuses were never compared with the E2E spec. | The catalogue test reads §8; the retired-route matrix is generated from §7 and reconciled both ways. |
| C6 | `register.length >= 20` and "every class has files" would have failed on completion day. | A stated phase (`active`/`complete`) and an equality-pinned row count; flipping the phase to pass a count fails both ways. |
| C7 | `--draft` exited 0 on credential values; the entry guard no-oped under a symlink. | Both fixed and tested. |

### D. Controls that did not exist

| # | Finding | Now |
|---|---|---|
| D1 | No build-output scan; `build-info.ts` deliberately inlined the store domain into the **client bundle**, and CI restored the build cache on every run including `main`. | The inlining is gone; the scan runs inside the existing `verify` context (no new required check to register), with a derived allowance for the one retained route; `main` builds cold. |
| D2 | No egress interception, **no Content-Security-Policy at all** (so "strip commerce origins from `connect-src`" had nothing to act on), nothing checking storage or service workers. | Automatic Playwright fixture on every spec (egress + CSP violations), a server-side `fetch` harness, a CSP with `connect-src 'self'`, and a fresh-session spec. |
| D3 | Retired routes were tested with GET only, POST only on the 410s, no HEAD, no trailing-slash or encoded variants, no cache assertions. | The matrix covers all of them, generated from the contract. |

### E. Live defects

| # | Finding | Now |
|---|---|---|
| E1 | `/api/contact` answered `{ success: true }` when the mail provider **refused** the message: the SDK returns an error rather than throwing, and the route ignored it. Its log wrote the raw error object. | Honest 502; logs name and status code only; the mock now returns the SDK's real shape. |
| E2 | The privacy page said IPs were "hashed" while the raw address was the rate-limit key in Redis; it described cookies the site never sets; the consent banner named an event that no longer exists; a coverage fixture carried a price. | Keys are HMAC (or salted SHA-256, reported as such); privacy page and banner say what the code does. The analytics sink also stopped logging undeclared fields, including price-shaped ones. |
| E3 | Skin-safety, biocompatibility, imaging and regulatory claims rendered across the site with no evidence model — including "nickel-free" on 316L, which is nickel-bearing by specification, and "pure titanium" for a mixed collection. | Claims registry and enforce-now copy; a lexicon test fails on the wording anywhere outside approved claims. |

### F. Records and controls that had outlived their subject

| # | Finding | Now |
|---|---|---|
| F1 | v1 said 58 register rows (WS-C 30) on the day the register held 53 (WS-C 21). | This file carries no burn-down number that nothing reads except §2's dated table. |
| F2 | The ledger dated `ordersCount: 0` to a day its source does not carry; sentinel counts disagreed in four places; `control-audit.yml` claimed to install nothing while installing; `docs/safety.md` had lost `vercel.json` and nothing compared it. | All corrected; the counts and the denylist are now reconciled by tests. |
| F3 | `diagnose-deployment` reported finding the store domain in the bundle as `ok`; once the API-version pin went, the premise detectors held **zero premises**. | The diagnostic is deleted; `CHECKOUT-HOST-CNAME` replaces the premise — a DNS lookup the WS-E clock actually rests on. |
| F4 | Deleting `src/config/shopify.ts` needed an edit to the WS-F-owned webhook route; the mock environment shrinks rather than vanishes after WS-A. | Handoff made explicitly; the mock environment now holds only what the webhook route reads. |

---

## 4. The design that replaces the brief's

| # | Choice | Where it lives |
|---|---|---|
| S1 | Protection gates the merge, not the work; one integrator owns every hot file; each branch merges alone with the full gate after it | this PR's history |
| S2 | Refusal proven read-only | `scripts/probe-merge-denial.mjs` |
| S3 | Rulesets and classic protection, judged together | `scripts/probe-branch-protection.mjs` |
| S4 | One exact-set rule for register rows and whole-file exemptions | `scripts/lib/commerce-contract.mjs`, contract §4 |
| S5 | Two independent lexers that must agree | `commerce-lexer-differential.test.ts` |
| S6 | Phase state and an equality ratchet | contract `state` section, `commerce-contract.test.ts` |
| S7 | The contract as single source for routes, fields and egress | §7, §8, §12, §13 |
| S8 | Enforce, not only observe: a CSP | `next.config.ts`, `csp-contract.test.ts` |
| S9 | Build-output scan inside an existing required context | `scripts/scan-build-artifacts.mjs` |
| S10 | Live-surface evidence with a pure classifier | `scripts/probe-live-surface.mjs` |
| S11 | Claims registry; expiry changes what renders, never fails a build (ADR 029) | `src/content/claims/`, `src/lib/catalog/claims.ts` |
| S12 | Honest contact path; pseudonymised rate-limit keys | `/api/contact`, `src/lib/utils/rateLimit.ts` |
| S13 | A premise with a subject | `scripts/lib/premise-checks.mjs` |
| S14 | No hand-typed burn-down | `--summary` / `--json` |

Every control above is registered in `docs/controls.json` with its known limit and proven able to
fail by a sentinel in `scripts/lib/sentinels.mjs`.

---

## 5. Workstream status

| WS | Done in the repository | What remains | Blocked by |
|---|---|---|---|
| **A** Application | revalidate route, vendor config and API-version module deleted; version route keeps the fingerprint; contact honesty; IP pseudonymisation; the 308 families are route handlers, so a stale action ends on its 410 page rather than re-posting to the successor (2026-10-02) | the webhook route and `cacheTags.ts` | WS-F ordering |
| **B** Content | claims registry; enforce-now copy; form taxonomy (17 unassigned); §8 read from the contract; legal-review inventory; an expired approval leaves the served page within `CLAIM_WITHDRAWAL_BOUND_SECONDS` plus one request, measured by build-and-serve experiment (2026-10-02) | a named reviewer approving claims against documents; a person assigning forms; an expiry reminder to that reviewer, built with the first approval | evidence and reviewers |
| **C** CI/CD | exact-set scanner; differential lexer; phase state; artifact scan; egress, CSP, route matrix, fresh session; ruleset-aware probe; merge-denial proof; live-surface probe; premise; CODEOWNERS; `merge_group`; denial withheld on draft, conflict, behind or head/merge disagreement; live surface read under a streaming cap and attributed after identity, with an issue a person must `/ack` (2026-10-02) | the canary, once the ruleset exists; retire the production-smoke vendor tier (`preflight-secrets.mjs`) with WS-F | the owner's ruleset; WS-F |
| **D** Infrastructure | mock environment reduced to what code reads; runbook | remove variables from Vercel in all three environments; cold rebuild and scan | dashboard access |
| **E** DNS | premise watching the checkout host; runbook | apex/`www` fix; the thirty-day checkout-host clock; CAA | dashboard access |
| **F** Third-party | read-only inventory runbook | reconnect; inventory; reconcile 22 vs 17 products; delete subscriptions; delete the route; revoke by blast radius | connector re-authentication |
| **G** Privacy | privacy page and banner truthful; analytics without a funnel; data-flow record with empty sign-off; one strict schema per analytics event, search recorded as facets and never text; consent withdrawn from every footer and `/privacy` as easily as it is given (2026-10-02) | a named privacy owner's sign-off | a person |
| **H** Retention | the finding (`ordersCount: 0`, dated correctly) | a Vietnam-qualified adviser's decision on retention, commercial terms and account closure | an adviser |
| **I** Documentation | this file; ADR 037; agent guidance; records | closes with the last register row | every other WS |

---

## 6. The release, as a state machine

Revised 2026-09-27 after a release review of PR #90 (ADR 038). The order is unchanged; what is
new is that **a transition needs a recorded observation**, and an observation that could not be
made is `unknown`, never healthy. A probe that cannot reach a deployment has learned nothing; a
canary blocked because it is a draft or conflicted has not proved the required-check rule; a
mail provider returning a message id has accepted a message, not delivered it.

```
UNPROTECTED                 main deploys with nothing required                ← today (ruleset 24077858 holds only a deletion rule; canary #94 NOT-DENIED, then merged)
  │ ruleset active, read back `enforced`, bypass list empty   (owner; runbooks/main-ruleset.md 1–2)
GATE_UNPROVEN
  │ ready-for-review canary fails `verify`; probe-merge-denial reads `denied` with draft:false,
  │ mergeable:true, behind_by 0 and head/merge agreement; closed unmerged   (agent, with permission)
GATE_PROVEN
  │ PR #90 + this review's PR reviewed on their current heads; the four release questions answered
  │ (retired actions end on a page, forged beacons log nothing, an expired claim leaves the served
  │ page within the bound, the live surface is attributed after identity)
PREVIEW_VERIFIED
  │ preview probed: routes, claims, contact (provider acceptance, then a human-confirmed delivery
  │ and reply), egress, storage; merged only with every required context green on its head
PRODUCTION_VERIFIED
  │ apex serves production and www 308s to it; live-surface `clean` on apex, www and the
  │ deployment URL with one commit; RATE_LIMIT_KEY_SECRET set and /api/health reports `keyed`
  │ then, in dependency order: read-only platform inventory → delete webhook subscriptions →
  │ observe no deliveries → delete the receiver → remove its variables (the public store-domain
  │ variable last) → cold build and artifact scan → retire the checkout host on its clock
DECOMMISSION_COMPLETE
    empty register under the phase rule, plus dated external evidence and human sign-offs
    (privacy, claims, retention)
```

What may happen in each state:

| State | Allowed | Forbidden |
|---|---|---|
| `UNPROTECTED` | draft work, previews, read-only diagnostics | merging, revoking, deleting subscriptions, DNS changes |
| `GATE_UNPROVEN` | the canary procedure only | merging anything, the canary included |
| `GATE_PROVEN` | ready-for-review PRs, review, small targeted fixes | external removals |
| `PREVIEW_VERIFIED` | taking PRs out of draft, a human merge | external removals before production is verified |
| `PRODUCTION_VERIFIED` | the external sequence above, in order, by people | skipping or reordering it |

**One exception, recorded because it was needed on 2026-10-02.** In `UNPROTECTED`, the owner
may merge a *recovery* pull request: one whose only effect is to remove a defect that an admission
failure let onto `main`, after its head checks are green. #95 is that pull request; it deletes the
canary test #94 put on `main`. Nothing else rides on the exception, and an agent still never
merges.

**The release is already live.** #93 (this review) was merged at 16:16:44 UTC on 2026-10-02 and
auto-deployed to production while `main` was `UNPROTECTED`, so `PREVIEW_VERIFIED` was skipped, not
reached. Production now serves the release (routes, analytics, claims). The production checks
§6 puts after `PREVIEW_VERIFIED` (live surface, contact, egress) are owed now, not later.

No agent performs a forbidden action, or any of `AGENTS.md`'s human-only actions, because a
test or this plan says it is next.

## 7. Human-only actions, in order

Each runbook starts with read-only commands and ends with an evidence table whose cells are
empty. **An empty cell is the honest state.**

| # | Action | Runbook | Evidence |
|---|---|---|---|
| 1 | Create the `main` ruleset: the three exact contexts, strict, a pull request required, **no bypass actors** | `docs/runbooks/main-ruleset.md` | |
| 2 | Grant permission to push a canary branch; the read-only denial proof is then run and recorded | same, step 3 | |
| 3 | Clear the apex redirect, then set `www` → apex (in that order — the reverse loops) | `docs/runbooks/ws-e-dns.md` | |
| 4 | Re-authenticate the commerce connector; run the read-only inventory; reconcile 22 vs 17 | `docs/runbooks/ws-f-read-only-inventory.md` | |
| 5 | Delete webhook subscriptions; confirm no delivery is expected | same | |
| 6 | Remove the retired variables from Vercel in every environment; cold rebuild | `docs/runbooks/ws-d-vercel-env.md` | |
| 7 | Adviser review of retention, commercial terms and account closure | — | |
| 8 | Privacy owner's sign-off on `docs/data-flow-record.md` | — | |
| 9 | Claims reviewer approves or rejects each pending claim against a document | `src/content/claims/` | |

**Platform state the owner observed on 2026-09-27** (the owner's review, reading the Vercel
project directly; recorded here as *their* observation, because this session's Vercel connector
answered 403 for the team scope and could not confirm it):

| Observation | Consequence |
|---|---|
| The apex answers **307 → www**, while the code and the runbook declare the apex canonical | Clear the apex redirect, confirm the apex serves production, then set www → apex 308 (runbook WS-E; the reverse order loops). Re-run `probe-canonical-domain` and `probe-live-surface` after |
| Commerce variables still set in Vercel: the storefront token (Preview, Production), the webhook secret (Preview, Production), the revalidation secret (Development, Production), the public store domain (all three) | Remove in dependency order only (§6): the store domain is the retained webhook route's shop check and goes **last**, after the route |
| `RATE_LIMIT_KEY_SECRET` not in the project-level inventory | Set it (32+ characters, generated locally, never pasted anywhere) in all three environments; until then the rate limiter runs in its weaker unkeyed mode |
| `RESEND_*` and `UPSTASH_*` not in the project-level inventory | Confirm whether they come from shared variables before concluding anything; the contact form and its limiter depend on them |
| No runtime-error clusters in seven days; no project firewall policy | "No observed error cluster", not "production verified"; the CSP remains the browser-egress control |
| The commerce connector needs re-authentication | Reconnect for the **read-only** inventory only — never as permission to reconnect the platform to the site |

**The identity-separation decision.** Agents act through the owner's GitHub identity, so a
bypass list cannot tell them apart from the owner. The enforceable set is therefore: a ruleset
with no bypass actors, required checks with strict mode, a pull request required, and an agent
policy of never calling merge. Required code-owner review deadlocks a one-maintainer
repository, because GitHub blocks self-approval; it switches on the day a second human
reviewer exists.

---

## 8. Security, claims and privacy gates

Adopted from the brief, with where each is now enforced.

- **Credentials.** Names, never values, in any document, ticket, prompt or log. Revoke by blast
  radius. The value rule reads every tracked text file, and the artifact scan redacts any
  credential shape it finds. A credential in history is an incident: rotate, then assess.
- **Contact integrity.** Validated on the server, bounded while reading, rate-limited with
  pseudonymised keys, logged without personal data — and a refused send is a failure, not a
  success.
- **Claim integrity.** `materialSpec` (what a piece is) is separate from a claim (what the
  brand says it does). Only an approved decision with applicable, current evidence renders the
  claim's wording; everything else renders the neutral fallback. "Grade 23 titanium" does not
  become "safe for sensitive skin" by itself.
- **Privacy integrity.** A delivered form proves transport, not appropriate collection.
  `docs/data-flow-record.md` holds fields, provider, storage, logs, access, deletion and
  retention per flow, with the sign-off left for a person.

---

## 9. Release and rollback

Each implementation pull request states its hypothesis, changed surface, known-bad fixture,
expected failure, expected behaviour, measured result, owner and rollback condition. Cheapest
checks first: contract and types, then unit tests and the build, then the artifact scan, then
production-build E2E, then preview probes.

- **Application regression:** restore the last known-good browse-only deployment and re-run the
  public-page, retired-route and contact checks. Never restore a transaction-enabled build
  because it once deployed.
- **External decommission action:** never reflexively restore a revoked webhook, credential or
  DNS record. Identify the dependent process and the data risk first.

---

## 10. Definition of done

| # | Statement | Demonstrated by | State |
|---|---|---|---|
| 1 | `main` refuses a pull request with a failing required check | `probe-merge-denial.mjs` against a canary, `denied` | waiting on the ruleset |
| 2 | A clean clone builds and tests without commerce credentials | CI on a fresh runner | met, except the webhook's mock secret |
| 3 | The register is empty under the phase rule | `verify:commerce-contract`, phase `complete` | 34 rows |
| 4 | Source, lockfile, build output, browser traffic and server calls show no commerce dependency | scanner, `auditPackages`, artifact scan, egress fixture, server harness | met, except the retained route |
| 5 | Every legacy path and the checkout host give the approved answer | retired-route matrix; live-surface probe | paths met; host waits on WS-E |
| 6 | No environment holds an unnecessary commerce variable | `vercel env ls` per runbook | waiting on WS-D |
| 7 | No webhook, app, channel, feed or automation expects this site | WS-F ledger, dated | waiting on WS-F |
| 8 | No transaction control, price, stock offer or unsupported claim renders | price-absence, claim-lexicon, legal inventory | met |
| 9 | Contact and analytics reach only approved, documented destinations | server egress; data-flow record | technical half met; sign-off open |
| 10 | Records, support ownership and account disposition approved in writing | the ledger, every row dated | waiting on WS-H |
| 11 | The site supports a genuine, unpressured encounter rather than imitating a reduced store | brand and operations reviewers | a person's judgement — no check can answer it |

A clean repository scan is necessary and not sufficient. Source, built artifacts, live hosts,
external consoles and human review must agree.

---

## 11. Execution record

Five workstream agents ran in isolated worktrees under a single integrator, with disjoint file
ownership and a shared lock on the E2E port. The account session limit stopped every agent,
repeatedly — five windows in two days — always with the same error and never through a defect
in the work. Three changes made that survivable rather than fatal: **checkpoint commits after
every deliverable** (a stop lost at most one), **pushing each gated integration** (a stop then
lost time, never work), and **fresh agents with focused briefs** in place of resuming agents
whose contexts had grown to several hundred thousand tokens. The last deliverable of the
artifact-and-egress workstream was finished by the integrator after its fifth stop.

The merge-correctness control held: every integration ran the full gate, and each merge's
recounts were made in the merge commit itself. Three conflicts arose, all delete-versus-modify
or adjacent-line, and all resolved in favour of the deletion or both intents.

---

### The release review (2026-09-27 → 2026-10-02)

Two workstream agents were started for the script-side packages and both were stopped by the
account session limit within minutes, leaving nothing; the owner then asked for no further agent
campaign and no new plan document. The review ran as one integrator, one question at a time, each
ending in its own validated commit on the PR that follows PR #90:

| Question | Falsified first (against the real artifact) | Fixed |
|---|---|---|
| Can an old visitor action end honestly? | a stale multipart form ended on "Server action not found." in Chromium | `retiredRoute()` handlers: GET/HEAD 308, every other method the 410 page |
| Can visitor text reach a log under the wrong event? | a forged beacon logged an email address | strict per-event schemas; search reports facets, never text; consent withdrawable from every page |
| Does an expired claim leave the served page? | 8/8 cache HITs kept the wording two days past expiry | claim-bearing segments revalidate hourly; the experiment PASSes on the fix and FAILs on the baseline |
| Is the live surface attributed to the right cause? | a 2 MB "bound" downloaded everything first; two builds read as one | streaming read cap with truncation; identity before cause; an issue a person must `/ack` |

The claim experiment's first design was wrong (it moved the wrong clock) and its first FAIL was
discarded; ADR 038 records why that is the same lesson as the four findings. A high-effort
code review then found ten defects in the review's own changes — among them a `/policies` 308
it had turned into a 404 — and all ten were fixed before the records were written.

**The close-out ran the instruments against themselves.** The full liveness probe found
`merge-denial-attribution` killed by the review's own rename. It was revived, and 38 of 38 vitest
sentinels were alive. The two browser sentinels were then run by hand.

`hero-card-bound` had been dead since 2026-08-28: a cap that never binds, read back by the spec
that measures against it. It is now two sentinels, one pinning the number and one proving the
measurement fires; 41 in all.

The claim experiment was made to name what it did not exercise. JSON-LD carries no claim, so a
PASS cannot speak for it. Its re-run on the final code PASSes and says so.

The preview of this review could not be probed: see §12.

## 12. What could not be verified here, and why

| Claim | Verifiable here? | Why not |
|---|---|---|
| Repository state, CI, route behaviour under a production build | **yes** | measured; §2 |
| The live site's HTML, headers and build identity | no | outbound requests to the domain are refused by this environment's proxy; the live-surface probe runs in GitHub Actions instead |
| The checkout hostname still aliases the vendor | **yes**, 2026-09-26 | DNS resolves here; the premise holds |
| Vercel variables, domains and deployment protection | no | no dashboard access; on 2026-10-02 the Vercel connector answered 403 for the team scope, so §7 records the owner's 2026-09-27 observations as theirs |
| This review's preview deployment (`PREVIEW_VERIFIED`'s evidence) | no, re-tried 2026-10-02 | the environment's proxy refuses the preview's `*.vercel.app` host as it refuses the apex and `www` (CONNECT 403), and the connector's protection bypass answered 403 for the same team scope. The preview is reported Ready by its own bot; that is the platform's word, not an observation, so `PREVIEW_VERIFIED` stays unreached |
| Webhook subscriptions, apps and the 22-vs-17 delta | no | the connector needs re-authentication |
| Whether any material claim is *true* | no | not a property of a repository; the claims reviewer's question |
