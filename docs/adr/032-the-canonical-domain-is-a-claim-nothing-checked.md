# 032 — The canonical domain is a claim nothing checked

## Context

Every live check this repository has ever run fetches `PRODUCTION_SITE_URL` and asserts
something about what came back. `verify-production.mjs` checks twenty properties of the
response. `diagnose-deployment.mjs` reads `/api/version` and reports which commit and which
Vercel environment answered. Both are pointed at a hostname supplied as a secret.

That proves *the thing at that name answers*. It cannot prove any of:

- that `healthyjewellery.com` and `www.healthyjewellery.com` reach the **same Vercel project**;
- that either is serving the **Production** deployment rather than a preview alias;
- that the two serve the **same commit**;
- that the hostname `src/config/site.ts` believes in is the hostname that is actually bound.

Each of those has already gone wrong here, in a way no browser tab could show you.

**`docs/dns-domain-setup.md`** records `account.healthyjewellery.com` resolving to a Vercel
anycast IP, answering HTTP 404, with **no project in the account claiming the hostname**. The
DNS panel looked correct. The record pointed at nothing.

**`src/config/build-info.ts`** records the other shape: a branch alias keeps serving whatever
last built on that branch, *forever*, including after the branch is deleted. It renders, it
navigates, the cart works, and it is a snapshot of an application that no longer exists.

And the domain itself has drifted before. `src/config/site.ts` throws on the single-L spelling,
because that domain belongs to an unrelated third party and is parked for resale, and it once
reached ~20 files as copy-pasted literals. (The literal is deliberately not written here:
`domain-consistency.test.ts` forbids it outside three files that must name it, and this ADR
does not need to be the fourth — see `docs/dns-domain-setup.md`, which does.)

None of this is visible from the site. That is the whole problem: a correct deployment on the
wrong hostname and a correct hostname on the wrong deployment both render a working shop.

## Decision

`scripts/probe-canonical-domain.mjs` asks, on the six-hourly `control-audit.yml` schedule, and
reports the answer whatever it is. Registered as the control `canonical-domain-binding`.

**The decision is a pure function.** `scripts/lib/canonical-domain.mjs` takes observations and
returns a verdict; the script is transport and printing. That split is ADR 030's rule, and it is
what lets every branch be driven from a fixture rather than from the weather (ADR 024).

**Three states, and the third is load-bearing.** `unevaluable` is kept rigidly apart from
`drifted`, because "the binding is wrong" and "I could not find out" demand different actions
and collapsing them is the laundering ADR 010 forbids:

| Signal | Verdict |
|---|---|
| `ENOTFOUND` — an authoritative NXDOMAIN | a finding. The name does not exist; that *is* the measurement |
| `EAI_AGAIN`, a timeout, a refused CONNECT | `unevaluable`. A failure to measure |

`fetch-error.mjs` groups those two codes, which is right for a hint to a human and wrong for a
verdict — so `classifyTransportFailure` splits them.

**A response is judged only when it can be attributed to an origin.** A response carrying a
`server` header or a readable `/api/version` body is ours, or is a real misbinding, and either
way gets judged. A `403` or `407` from something that identifies itself as nothing is evidence
of nothing. This rule exists because the first version of the probe reported five confident
findings about a domain it had never reached: the sandbox it was written in proxies egress and
answers blocked hosts with a bare 403. Attribution rather than proxy-detection, so the next
middlebox does not rediscover it.

**The probe reads the hostname out of `src/config/site.ts` and refuses to guess.** If the
pattern finds nothing it exits rather than falling back to a literal. A probe carrying its own
copy of the domain cannot notice the application drifting off it, which is the single thing
this join is for. `canonical-domain-decision.test.ts` imports the real `SITE_URL` and compares,
which is what makes a regex guardrail's coverage known rather than assumed (ADR 007).

## Consequences

The registry entry claims that **something asks and reports** — not that the domain is
currently bound. The verdict is not a field in `docs/controls.json`; it is the probe's output,
carried by `canonical-domain.json` and by one `domain-unbound` issue. Recording a live verdict
in a hand-edited registry would be a second copy of a fact, drifting from the first, which is
the shape ADR 018 exists to refuse.

This control cannot watch itself. Nothing probes `control-audit.yml`, so if that workflow stops
executing this check goes silent and its silence is indistinguishable from an all-clear — the
same gap `control-acceptance-freshness` records one tier up. `backstop: human:weekly` is what
covers it, via `docs/weekly-verification.md`.

The probe needs public-web egress. A sandboxed agent session does not have it and will report
`unevaluable`, exit 0, and say so; CI does have it. That asymmetry is deliberate and is why the
third state exists at all.

Referenced by: `scripts/probe-canonical-domain.mjs`, `scripts/lib/canonical-domain.mjs`,
`src/tests/unit/canonical-domain-decision.test.ts`, `docs/controls.json`,
`.github/workflows/control-audit.yml`, `docs/dns-domain-setup.md`.
