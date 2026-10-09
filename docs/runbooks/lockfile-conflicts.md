# Runbook — a conflict in `pnpm-lock.yaml`

**Rule:** a lockfile conflict is resolved by regenerating the file from `package.json`, never by
editing it, and never with "Accept Both", "Accept Current" or "Accept Incoming".

**Why:** twice, a lockfile conflict was resolved by keeping both sides of every hunk:
- `1c0419c`, 2026-09-18, 7 hunks;
- `ed7594a`, 2026-10-03, 20 hunks.

Each time the file held ten duplicated keys, and pnpm, CI and Vercel refused it with
`ERR_PNPM_BROKEN_LOCKFILE`. See [ADR 046](../adr/046-a-resolved-conflict-is-a-write-nobody-reviewed.md).

## What you will see now

`.gitattributes` sets `pnpm-lock.yaml merge=binary`. When both sides changed the lockfile, git no
longer writes conflict markers into it. Instead it:
- keeps the current branch's copy;
- prints `warning: Cannot merge binary files: pnpm-lock.yaml`;
- marks the path conflicted (`UU` in `git status`).

`package.json` still merges as text. Resolve it first, by hand, because it is the source of truth.

## Resolving it

Run from the repository root, on the branch being merged into. The commands assume the base is
`main`; substitute the real base.

```sh
# 1. package.json first: resolve its markers by hand, keeping every dependency both sides meant.
# 2. Start the lockfile from the base branch's copy: it already holds the base's resolutions.
git checkout origin/main -- pnpm-lock.yaml
# 3. Let pnpm add this branch's changes to it, from the resolved package.json.
pnpm install --lockfile-only
# 4. Prove it is a lockfile pnpm accepts, and that the manifest agrees with it.
node scripts/audit-manifest-integrity.mjs
pnpm install --frozen-lockfile
git add package.json pnpm-lock.yaml
git commit
```

## Where the conflict appears

| Where | What to do |
|---|---|
| Local `git merge` / `git pull` | The steps above |
| Local `git rebase` | The steps above at each stopped commit that touches the lockfile, then `git rebase --continue` |
| GitHub "Resolve conflicts" (web editor) | Don't. Check the branch out locally and follow the steps above. The web editor is how `ed7594a` happened |
| GitHub "Update branch" refuses | The same: merge the base locally |
| A Dependabot pull request | Comment `@dependabot rebase`. It regenerates its own lockfile |

## If it already happened

The integrity step in CI names the result: `✗ pnpm-lock.yaml declares each key once`, followed by
each duplicate's path and line. Vercel's version is `ERR_PNPM_BROKEN_LOCKFILE ... duplicated
mapping key`. The repair is the same steps on the branch's current head. A lockfile that pnpm
already refuses has nothing worth keeping.
