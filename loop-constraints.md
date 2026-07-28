# Loop Constraints

> Add rules below with `/constraints <rule>` in your agent.
> The `loop-constraints` skill reads this file at the start of every run.
> Constraints here are **binding** — the agent MUST follow them.

## Push & Merge
- Don't push before telling me
- Never auto-merge to main without human approval
- Always create a draft PR first; let me review before marking ready

## Paths
- Never edit .env, .env.*, auth/, payments/, secrets/, credentials/
- Never edit infrastructure configs without human approval

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
- Never edit `.env`, `.env.*`, `.vercel/`, or any Vercel environment variable.
- Never edit `src/lib/shopify/**` (Storefront API client/queries/mutations),
  `.github/workflows/**`, or `next.config.ts`'s security headers.
- Dependency major-version bumps (`next`, `react`, `react-dom`, any `@shopify/*`
  package) and any high-severity CVE fix must escalate with written rationale.
- Always use `pnpm`, never `npm` — this repo has no package-lock.json.
- Brand content check: never approve or let through copy mentioning stones,
  gemstones, crystals, chakras, or healing/mystical language — this is a
  titanium/biocompatible-metal brand, not a crystal-healing brand.

<!-- Add your own rules below. Use plain English. The loop reads this verbatim. -->
