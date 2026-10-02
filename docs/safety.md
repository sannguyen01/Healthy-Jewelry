# Safety & Guardrails — Healthy-Jewelry loops

Prose mirror of `gate.yaml`, `loop-constraints.md`, and the four hard gates in
`~/.claude/loop/README.md`.

**Scope.** Everything here constrains *unattended loop* runs. None of it freezes
a path against human-directed work: `.github/workflows/**` and `next.config.ts`
are actively maintained (PRs #9 and #10 rebuilt CI). The rule is that an
autonomous run escalates instead of editing them on its own.

## Path denylist

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
COMMERCE-ELIMINATION-CONTRACT.md
docs/commerce-dependency-register.md
next.config.ts
vercel.json
```

`COMMERCE-ELIMINATION-CONTRACT.md` is the commerce boundary, parsed on every pull request, and
`docs/commerce-dependency-register.md` is its inventory — a row is closed by deleting it.
`vercel.json` holds `buildCommand` and is where any future deploy gate would live.

This list is one path per line, in a `denylist-paths` fence, so that
`src/tests/unit/safety-denylist-parity.test.ts` can compare it with `gate.yaml` in both
directions. Until 2026-09-26 it was a prose block that packed two globs per line and carried
annotations in parentheses — readable, and uncheckable — and it had silently lost
`vercel.json`, which ADR 015 added to `gate.yaml` a month earlier. A mirror nobody compares
to anything drifts; this one had.

## Auto-merge policy

**A loop never auto-merges its own work.** `gate.yaml`'s `autoMergeAllowlist` is
empty on purpose; the fix phase is disabled entirely at L1.

This is not the same thing as GitHub's auto-merge feature, which is enabled on
this repository for *human-opened* PRs.

**The justification that used to sit here was false, and it is worth stating why
rather than quietly rewriting it.** It read: those PRs land once `verify` and
`e2e` — "both required checks on `main`" — go green, so "a human decided to open
the PR and the gate decided it was safe". `main` is not branch-protected and
there are no required checks (verified 2026-08-25; see
`docs/adr/015-a-gate-that-was-only-ever-documented.md`). The permission was real
and the gate it rested on was not, which is the failure ADR 006 describes: a
control that announces protection it is not providing.

So the accurate statement is narrower. A human decides to open the PR, and a
human decides to merge it. CI runs and its result is the thing to read, but
nothing enforces it. Enabling enforcement is a console action — the exact
ruleset, its three contexts and the read-only proof that it refuses a bad pull request are
in `docs/runbooks/main-ruleset.md`.

## Human gates (always required)

- Any push to `main` — auto-deploys to Vercel production
  (`prj_yXFNldDpw3O3r3BWnM0g5ExpfVmN`).
- Dependency major-version bumps (`next`, `react`, `react-dom`) and
  high-severity CVE fixes.
- Changes touching more than 10 files.
- Third attempt failed on the same item.
- Any content change touching stones/gems/crystals/chakras/healing language —
  a brand-identity violation, not a routine content edit.

## MCP connector least privilege

No MCP connectors configured for this repo's loops currently.

## Secrets in prompts and logs

- Never paste a credential of any kind — Upstash, Resend, a webhook signing
  secret, or any surviving platform token — into a scheduler prompt. The rule is
  about the act, not about which vendor issued the value.
- `STATE.md` is committed — no credentials in it, ever.

## Incident response

If a loop ever merges bad code or pushes to `main`:

1. Pause the schedule — disable the scheduled task or cron entry that runs the
   loop, whichever this machine uses.
2. Revert the push/merge.
3. Record what happened in `STATE.md` High Priority section.
4. Tighten `gate.yaml` or `loop-constraints.md` before re-enabling.
