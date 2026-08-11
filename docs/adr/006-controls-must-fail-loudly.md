# 006 — A control that depends on manual setup must fail loudly without it

## Context

`production-smoke.yml` was given `environment: production-readonly` to move five CI
credentials off repository scope, because this repository is public and forkable. The
change read as hardening in the YAML, in `go-live-runbook.md`, and in
`testing-strategy.md`. An earlier revision of those docs went further and claimed a job
naming a missing environment "fails at dispatch," so the setup step could not be skipped.

**All of that was wrong**, and the way it was wrong is the interesting part.

Two GitHub behaviours, both documented, combine badly:

1. A workflow that references an environment which does not exist **creates it
   automatically** — with no protection rules and no secrets.
2. A job with an `environment:` key **still receives repository secrets**.

So the intended failure mode never happens. Set the five secrets at repository scope and
the workflow goes green: the environment silently springs into existence empty, the repo
secrets satisfy the job, and every artefact — the YAML, the docs, the green check —
asserts an isolation that is not there.

That is worse than having no control at all. With no control, nobody believes they are
protected. Here, a green run is read as evidence.

## Decision

**A control whose benefit depends on configuration someone has to remember must detect and
announce its own absence.**

Applied here as `scripts/preflight-secrets.mjs`, the first step of the smoke job:

- it reports **every** missing secret in one message rather than throwing on the first, so
  configuring from scratch costs one red run instead of five;
- it asserts `SMOKE_SECRETS_SOURCE=environment`, a marker set **only on the environment**.
  Secrets present but marker absent means they came from repository scope, and the run says
  so instead of going green.

The docs now state that the environment **self-creates**, so its existence proves nothing.
What only a human can do is add the protection rules and put the secrets on it.

## Consequences

- The marker is a **convention, not an enforcement**. GitHub gives a job no way to ask where
  a secret came from, so setting `SMOKE_SECRETS_SOURCE` at repository scope would defeat it.
  Recorded as a known limit rather than overclaimed — the goal is to make the default
  mistake visible, not to make misconfiguration impossible.
- The same test applies to every future control in this repo: *if the setup step never
  happens, does anything go red?* If the answer is no, the control is decoration.
- This is the second time this project shipped something that looked verified and was not.
  The first was a test suite running entirely against `mock.myshopify.com` while three
  commerce outages lived in the gap (see ADR 004). Both share a shape: **the artefact that
  was supposed to provide confidence was structurally incapable of producing it, and looked
  identical either way.**

Referenced by: `.github/workflows/production-smoke.yml`, `scripts/preflight-secrets.mjs`,
`docs/credential-inventory.md`, `docs/go-live-runbook.md`.
