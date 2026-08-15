# 010 — A control's reporting path is part of the control

## Context

`production-smoke.yml` is this project's third verification tier. It exists because the
merge gate is deliberately hermetic — it runs against `mock.myshopify.com` — so no
automated test had ever touched the real store, and every commerce outage this project has
had lived in exactly that blind spot.

It ran two real checks:

```yaml
run: node scripts/verify-production.mjs   | tee storefront.log
run: node scripts/verify-webhook-secret.mjs | tee webhook.log
```

**Neither could fail.**

GitHub's default shell on Linux is `bash -e {0}` — visible in every run log as
`shell: /usr/bin/bash -e {0}`. `-e` exits on error, but a *pipeline's* error is its **last**
command's, and `tee` always succeeds. Measured, not argued:

| Invocation | `node -e "process.exit(2)" \| cat` |
|---|---|
| `bash -e` (GitHub's default) | exits **0** |
| `bash --noprofile --norc -eo pipefail` (`shell: bash`) | exits **2** |

Run [31600442658](https://github.com/sannguyen01/Healthy-Jewelry/actions/runs/31600442658)
shows the consequence already in production: `verify-webhook-secret.mjs` printed a usage
error and exited 2, and the job summary published

```
| Webhook signing secret | success |
```

The run went red anyway — but only because the **preflight** step, the one step without a
pipe, failed for an unrelated reason (no secrets configured). That is what made this
invisible. **A workflow with one honest step and two mute ones is indistinguishable from a
working workflow**, right up until the honest step passes.

And it was about to. The preflight fails only until the `production-readonly` environment is
configured. The moment it is, the workflow becomes permanently green regardless of what
production does — and the `if: success()` step at the end would then have *closed* the
open failure issue with "Recovered — production smoke passed."

## The pattern

This is [ADR 006](006-controls-must-fail-loudly.md) again, and it is the third instance:

| # | Control | What it announced | What it provided |
|---|---|---|---|
| 006 | `environment: production-readonly` | Isolation | Nothing — GitHub auto-creates an unprotected environment, and repo secrets still reach the job |
| 007 | Regex source guardrails | Enforcement | Unknown coverage, in both directions |
| **010** | The smoke workflow | Live verification | **A green tick that could not go red** |

The sharpening 010 adds: in 006 and 007 the *check* was the weak part. Here the checks were
correct — `verify-production.mjs` genuinely tests the right things, and
`verify-webhook-secret.mjs` genuinely exited 2. What failed was the four characters that
carried the verdict from the script to the runner.

> **A control's own reporting path is part of the control.** Reviewing what a check tests
> says nothing about whether anyone will hear it fail.

## Decision

**Every workflow declares `pipefail` at workflow scope.**

```yaml
defaults:
  run:
    shell: bash        # → bash --noprofile --norc -eo pipefail {0}
```

Not on the two offending steps. At workflow scope, so it is inherited by every step —
including the ones nobody has written yet, which is where the next instance of this would
otherwise appear. Applied to `ci.yml` too, which has no pipes today and is one `| tee` away
from the same hole.

`src/tests/unit/workflow-shell-contract.test.ts` asserts the declaration exists in every
workflow file, and keeps the table above as four executable assertions.

**Why assert the declaration rather than scan for pipes.** A test hunting for `|` inside
`run:` blocks would be a regex guardrail with unknown coverage — precisely
[ADR 007](007-regex-guardrails-have-unknown-coverage.md)'s subject, and it would have to be
right about heredocs, YAML block scalars, `||`, and pipes inside quoted strings.
`defaults.run.shell` is a **structural** invariant: one line per file, complete by
construction. "Is the declaration present" is answerable; "did I find all the pipes" is not.

Job-scoped `defaults` is deliberately rejected by the test even though it works, because it
has to be repeated per job and the next job added is the one that will not have it.

## Consequences

- The smoke workflow can now fail, which it has never been able to do. Until it has actually
  been *observed* failing on a real defect, that is a claim rather than a fact — so the
  verification step for this change is to configure the secrets with a deliberately wrong
  `SHOPIFY_WEBHOOK_SECRET` and watch it go red.
- Adding checks to this workflow is worth something again. Everything in R2–R6 of this round
  depends on it.
- `| tee` stays. It is the right way to both stream output and capture it for the job
  summary; the bug was never `tee`, it was the shell.
- The three instances of this pattern now share a question worth asking of any new control:
  *what would I see if this failed?* If the answer is "the same thing I see now", the control
  is decoration.
