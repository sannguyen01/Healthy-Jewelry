# Loop Configuration — Minimal Triage (Claude Code)

## Active Loops

| Pattern | Cadence | Status | Command |
|---------|---------|--------|---------|
| Daily Triage | 1d, 08:00 | L1 report-only | `run-loop --pattern daily-triage` |
| Dependency Sweeper | Weekly | L1 report-only | `run-loop --pattern dependency-sweeper` |

Scheduling is machine-local — a scheduled task, cron entry, or the runner's own
scheduler, whichever this checkout runs on. Nothing in this repo registers it.

## Human Gates

- No auto-fix until L2 checklist complete (see `~/.claude/loop/README.md` promotion criteria).
- All high-risk paths: human review required — see `gate.yaml` denylist and
  `loop-constraints.md`'s repo-specific hard gates section.
- Never push to `main` — a merge auto-deploys to Vercel production.

## Worktrees

- Use `isolation: worktree` when spawning implementer sub-agents (L2+).
- One worktree per fix attempt; discard after verifier REJECT.

## Connectors (MCP)

- MCP optional for L1 report-only loops.
- For L2+: GitHub MCP to read CI/issues; scope connectors to read + comment only until trusted.

## Budget

- Max sub-agent spawns per run: 0 (L1)
- Review STATE.md daily

## Links

- Pattern: [daily-triage](../../patterns/daily-triage.md)
- Checklist: [loop-design-checklist](../../docs/loop-design-checklist.md)