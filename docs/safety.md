# Safety & Guardrails — Healthy-Jewelry loops

Prose mirror of `gate.yaml`, `loop-constraints.md`, and the four hard gates in
`~/.claude/loop/README.md`.

**Scope.** Everything here constrains *unattended loop* runs. None of it freezes
a path against human-directed work: `.github/workflows/**` and `next.config.ts`
are actively maintained (PRs #9 and #10 rebuilt CI). The rule is that an
autonomous run escalates instead of editing them on its own.

## Path denylist

```
.env / .env.*
**/secrets/** / **/credentials/**
**/*_key* / **/*_secret*
.vercel/**
**/migrations/**
.github/workflows/**
src/lib/shopify/**   (Storefront API client — version-pinned in production)
next.config.ts
```

## Auto-merge policy

**A loop never auto-merges its own work.** `gate.yaml`'s `autoMergeAllowlist` is
empty on purpose; the fix phase is disabled entirely at L1.

This is not the same thing as GitHub's auto-merge feature, which is enabled on
this repository for *human-opened* PRs: those land automatically once `verify`
and `e2e` — both required checks on `main` — go green. A human decided to open
the PR and the gate decided it was safe; no loop is merging anything unreviewed.

## Human gates (always required)

- Any push to `main` — auto-deploys to Vercel production
  (`prj_yXFNldDpw3O3r3BWnM0g5ExpfVmN`).
- Dependency major-version bumps (`next`, `react`, `react-dom`, `@shopify/*`)
  and high-severity CVE fixes.
- Changes touching more than 10 files.
- Third attempt failed on the same item.
- Any content change touching stones/gems/crystals/chakras/healing language —
  a brand-identity violation, not a routine content edit.

## MCP connector least privilege

No MCP connectors configured for this repo's loops currently.

## Secrets in prompts and logs

- Never paste Shopify tokens, Upstash/Resend keys, or webhook secrets into
  scheduler prompts.
- `STATE.md` is committed — no credentials in it, ever.

## Incident response

If a loop ever merges bad code or pushes to `main`:

1. Pause the schedule — disable the scheduled task or cron entry that runs the
   loop, whichever this machine uses.
2. Revert the push/merge.
3. Record what happened in `STATE.md` High Priority section.
4. Tighten `gate.yaml` or `loop-constraints.md` before re-enabling.
