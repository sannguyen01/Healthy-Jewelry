# Loop Constraints

> Add rules below with `/constraints <rule>` in your agent.
> The `loop-constraints` skill reads this file at the start of every run.
> Constraints here are **binding** — the agent MUST follow them.

## Push & Merge
- Don't push before telling me
- A loop never merges its own work to main. GitHub auto-merge on a human-opened
  PR is a different thing and is fine — but note the reason given here until
  2026-08-25 ("it lands only after `verify` and `e2e`, both required checks")
  was false: `main` is not branch-protected and nothing is required. The rule
  stands on its own; its old justification did not. See
  `docs/adr/015-a-gate-that-was-only-ever-documented.md`.
- Always create a draft PR first; let me review before marking ready

## Paths
- Never edit .env, .env.*, auth/, payments/, secrets/, credentials/
- Never edit infrastructure configs without human approval

## Credential check failures
- Never set, read, propose, or guess a credential value — not even a plausible-looking
  correction. `scripts/preflight-secrets.mjs` (`SHAPE_RULES`) already tells you exactly
  which secret is wrong and why (missing vs. present-but-wrong-shape, e.g. a Storefront
  token in the `SHOPIFY_ADMIN_ACCESS_TOKEN` slot, which must start with `shpat_`).
- If a preflight/smoke check fails on a credential: name the secret, quote the tool's own
  diagnosis, state which console it's fixed in (GitHub → Settings → Environments →
  `production-readonly`, or the relevant Shopify/Vercel page), and stop. This is a human
  console action, never a code change. See ADR 011 and `docs/go-live-runbook.md`.
- If `production-smoke` has been failing with the *same* diagnosis for 3+ runs, don't add
  another "still failing" comment — the workflow's own escalation step (ADR 011) already
  did that once. Check whether it's escalated (`human-required` label) before commenting.

## Code
- Always run tests before proposing a fix
- Never disable tests to make CI green
- Never refactor unrelated code — one fix per run
- Max 3 fix attempts per item; escalate after
- Enforce the attempt limit mechanically: log each try to `loop-ledger.json` and run `loop-context --check` before retrying (see the `loop-guard` skill)

## Communication
- Always tell me what you're about to do before doing it
- Never close an issue or PR without my approval

## Budget
- If token spend hits 80% of daily cap, switch to report-only
- If loop-pause-all is active, exit immediately

---

## Repo-specific hard gates (Healthy-Jewelry) — permanent, survive any future promotion to L2/L3

- Never push to `main`. A merge to `main` auto-deploys to Vercel production
  (project `prj_yXFNldDpw3O3r3BWnM0g5ExpfVmN`) via its native Git integration.
  `main` is **not** branch-protected and requires nothing — so the merge button
  is the deploy button, with no check between them. That makes this rule more
  load-bearing than it reads, not less.
- Never edit `.env`, `.env.*`, `.vercel/`, or any Vercel environment variable.
- Never *autonomously* edit the paths below — escalate instead. These are maintained,
  not frozen; a human-directed change to them is ordinary work.

  ```denylist-paths
  .env
  .env.*
  **/secrets/**
  **/credentials/**
  **/*_key*
  **/*_secret*
  .vercel/**
  **/migrations/**
  .github/workflows/**
  src/lib/shopify/**
  next.config.ts
  vercel.json
  ```

  That block is not a restatement of `gate.yaml` — it is checked against it by
  `src/tests/unit/gate-denylist-contract.test.ts`, in both directions. `gate.yaml`'s
  own header says it "mirrors loop-constraints.md", and a mirror nobody looks into
  drifts: `vercel.json` was added to the machine-readable policy by ADR 015 and never
  reached the prose, so the two disagreed about what a loop was allowed to rewrite.
  Whichever a reader found first was the answer they got.
- Dependency major-version bumps (`next`, `react`, `react-dom`, any `@shopify/*`
  package) and any high-severity CVE fix must escalate with written rationale.
- Always use `pnpm`, never `npm` — this repo has no package-lock.json.
- Brand content check: never approve or let through copy mentioning stones,
  gemstones, crystals, chakras, or healing/mystical language — this is a
  titanium/biocompatible-metal brand, not a crystal-healing brand.

<!-- Add your own rules below. Use plain English. The loop reads this verbatim. -->
