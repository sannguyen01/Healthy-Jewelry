# The weekly five minutes

**Run this once a week regardless of what any dashboard says.** That is the whole point: the
premise is that the dashboards may be lying, and every automated tier in this repository is code
in this repository checked by other code in this repository.

That chain has no self-supporting bottom rung, and it has already broken. `control-audit.yml` —
the workflow built to audit whether the controls work — was **invalid YAML from the commit that
created it**. GitHub rejected it before scheduling anything, so it produced runs with
`conclusion: failure` and **zero jobs**: no log, no summary, no annotation. Three entries in
`docs/controls.json` asserted their probe ran there. Two guardrails passed over it, because both
searched the file as text and a text search cannot tell a valid document from a broken one.

Nothing in this repository noticed. A person looking at the Actions tab did.

So this document is the floor. It is short on purpose — a checklist nobody finishes is the same
as no checklist. See [ADR 023](adr/023-the-last-link-is-a-person.md).

---

## The four checks

| # | Question | Where | Fine looks like |
|---|---|---|---|
| 1 | **Is the audit tier alive?** | [control-audit runs](https://github.com/sannguyen01/Healthy-Jewelry/actions/workflows/control-audit.yml) | The newest run has **at least one job**. Zero jobs means the workflow did not parse and *nothing in it ran* — including the probes that watch everything else. |
| 2 | **Is production actually being verified?** | [production-smoke runs](https://github.com/sannguyen01/Healthy-Jewelry/actions/workflows/production-smoke.yml) | The newest run shows `Live store and storefront: success`. `skipped` means the run happened and checked nothing. A red X whose cause is the preflight is *not* fine — it means every check after it was skipped. |
| 3 | **Is the merge gate on?** | Settings → Branches | A protection rule exists on `main`. There is no rule today, and `main` auto-deploys to production, so the merge button is the deploy button. |
| 4 | **Do the probes still fire?** | `node scripts/probe-assertion-liveness.mjs` | Every sentinel `alive`. Any `dead` means a test has stopped carrying information; any `unevaluable` means the probe could not measure anything and the run proved nothing. |

Checks 1 and 2 are the ones that cannot be automated away, because they ask whether the
automation ran at all.

## Then read the open gaps by age

```
node -e "const r=require('./docs/controls.json');const d=x=>Math.floor((Date.now()-new Date(x))/864e5);
for(const c of r.controls.filter(c=>c.status==='not-configured'))
  console.log(d(c.acceptedSince)+'d  '+c.id+'  —  '+c.humanAction)"
```

Each is a console action nobody can do from code. An acceptance older than **30 days** fails
`control-registry.test.ts` — not to force the fix, but to force the decision to be made again in
a diff a reviewer sees. If a gap is still a deliberate choice, say so by updating `acceptedSince`
and `acceptedWhy`. If it is not, it is time.

## When something is wrong

- **Check 1 fails** → the audit tier is dead and has been since whenever that run is dated. Every
  claim in `docs/controls.json` about a probe running there is false until it is fixed. Start with
  `pnpm exec vitest run workflow-validity`.
- **Check 2 fails** → open the run's summary. A leading `⚠ N of 2 live checks did not execute`
  line means the checks were skipped rather than failed; the cause is above it.
- **Check 3 fails** → run `pnpm exec vitest run required-checks-contract` **first**. That test
  proves which two strings GitHub publishes as check-run contexts. Typing the job IDs `verify` and
  `e2e` instead registers two contexts nothing ever reports, which blocks every pull request
  permanently and silently. See [ADR 015](adr/015-a-gate-that-was-only-ever-documented.md).
- **Check 4 fails** → `docs/adr/020-a-test-that-cannot-fail-is-documentation.md` explains what
  each state means. `dead` is a finding about a test; `unapplicable` and `unevaluable` are
  findings about the probe or the environment.

## What this document is not

It is not a substitute for any tier above it, and it is not a promise that a person will catch
what the machines miss. It is the honest end of the chain: **the last link is a person, and
writing that down is better than a fifth tier that also cannot watch itself.**
