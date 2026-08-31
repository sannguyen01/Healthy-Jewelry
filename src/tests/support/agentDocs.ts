import { readdirSync, statSync, existsSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

export const ROOT = resolve(__dirname, '../../..')

/**
 * **Documents written to steer an agent's or a contributor's judgement**, as opposed to the
 * product itself. These are the ones whose errors propagate into decisions rather than into
 * pixels.
 *
 * ## Why this is a shared module and not a list in one test
 *
 * It was a list in one test, and the *scope* of that list was the defect.
 *
 * `.claude/skills/project-conventions/SKILL.md` — the file an agent reads before judging this
 * repository — was wrong for a month in two independent ways, and was invisible to both
 * guardrails that should have caught it:
 *
 * - `required-checks-contract.test.ts` walked every markdown file and **excluded `.claude` by
 *   name**, beside `node_modules` and `.next` — vendored and generated trees, which
 *   hand-written agent guidance is not.
 * - `doc-numeric-claims.test.ts` scanned a **two-item allowlist**: `CLAUDE.md` and
 *   `docs/testing-strategy.md`.
 *
 * So it asserted a merge gate that does not exist, and carried "443 unit tests" for four
 * weeks past the point the real figure was 1913. Neither check was wrong about what it
 * covered. They covered different sets, and the file sat in the gap.
 *
 * Two reconcilers reading two hand-maintained scopes is the same defect one level up. They
 * read this instead, so the control-claim sweep and the numeric sweep cannot again disagree
 * about which documents are worth checking.
 *
 * ## What belongs here
 *
 * A document a reader consults to learn how to act on this repository *right now*. Not
 * ADRs, `STATE.md` or `CHANGELOG.md` — those are historical by construction, and
 * re-measuring their numbers would falsify the account rather than correct it.
 */
export const EXPLICIT_AGENT_DOCS = [
  'CLAUDE.md',
  'AGENTS.md',
  'LOOP.md',
  'loop-constraints.md',
  'CONTRIBUTING.md',
  'docs/testing-strategy.md',
  'docs/go-live-runbook.md',
  'docs/weekly-verification.md',
] as const

export function agentFacingDocuments(): string[] {
  const found: string[] = [...EXPLICIT_AGENT_DOCS]

  const skills = join(ROOT, '.claude/skills')
  if (existsSync(skills)) {
    for (const entry of readdirSync(skills)) {
      const skillFile = join(skills, entry, 'SKILL.md')
      if (statSync(join(skills, entry)).isDirectory() && existsSync(skillFile)) {
        found.push(relative(ROOT, skillFile))
      }
    }
  }
  return found
}

/**
 * Named documents that are not on disk.
 *
 * The list above used to be filtered by `existsSync`, which meant renaming a document
 * silently removed it from every sweep that reads this — the scope quietly shrinking to fit
 * whatever still happened to be there. That is the same failure as a parser that returns an
 * empty set: nothing fails, and the check simply stops covering what it was written for.
 *
 * Both consumers assert this is empty. Discovered skill files are excluded on purpose: the
 * `.claude/skills` walk has no fixed expectation to violate.
 */
export function missingAgentDocuments(): string[] {
  return EXPLICIT_AGENT_DOCS.filter((f) => !existsSync(join(ROOT, f)))
}
