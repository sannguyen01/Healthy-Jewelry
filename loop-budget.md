# Loop Budget — Healthy-Jewelry

> Patterns: **Daily Triage** (daily) + **Dependency Sweeper** (weekly). Both
> L1 report-only. Figures from `patterns/registry.yaml` in
> `cobusgreyling/loop-engineering`.

## Daily limits

| Loop | Max runs/day | Max tokens/day | Max sub-agent spawns/run |
|------|--------------|----------------|--------------------------|
| Daily Triage | 1 | 100k | 0 (L1) / 2 (L2) |
| Dependency Sweeper | 1 (weekly, rotating) | 500k | 0 (L1) / 3 (L2) |

## On budget exceed

1. Pause schedulers (`scheduler_delete` or disable automations)
2. Append event to `loop-run-log.md`
3. Notify human (Slack / issue / STATE.md High Priority)

## Kill switch

- Command or issue label: `loop-pause-all`
- Resume only after human clears the flag in STATE.md

## Estimate spend

```bash
npx @cobusgreyling/loop-cost --pattern daily-triage
```
