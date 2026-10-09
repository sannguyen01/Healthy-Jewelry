# ADR 046 — A resolved conflict is a write nobody reviewed

**Date**: 2026-10-04
**Status**: Accepted. Prompted by the owner's request to debug "the latest failed deployment";
amends [ADR 031](031-a-clean-merge-is-not-a-correct-merge.md), whose control this extends.

## Context

The latest failed Vercel deployment, `dpl_Fs9crbjE8nJ4M2uJvbVT41Apzje5`, built
`redesign-workstream-backup` at `ed7594a` and failed after 4.2 seconds with
`ERR_PNPM_BROKEN_LOCKFILE` at `pnpm install --frozen-lockfile`. The build log is not readable
through the connector (403 on the team scope). Replaying the install on that commit gives pnpm's
own message: `duplicated mapping key (84:9)`.

What the forensics established:

| Question | Finding |
|---|---|
| What is `ed7594a`? | The merge of `main` into PR #101, committed by `GitHub <noreply@github.com>`: a resolution made on github.com, not on a workstation |
| Did git report a conflict? | Yes. Replayed with `git merge-tree`, under every diff algorithm: 20 hunks in `pnpm-lock.yaml`, 2 in `Footer.tsx` |
| How was it resolved? | Both committed files are **byte-identical** to keeping both sides of every hunk |
| What did that leave? | Ten duplicated keys in the lockfile (pnpm refuses it), and a footer referencing `shopLinks` and `infoLinks`, which the other side had deleted (type-check fails with `TS2304`, hidden behind the install) |
| Did the repository's gate see it? | CI failed in 21 seconds. The step before the install, **named "Manifest and lockfile integrity"**, printed two ticks and exited 0 |
| Is PR #101 live work? | No. PR #103, merged as `0bcb55c`, "supersedes #100 and #101": it took #101's footer and dropped the two dev dependencies whose resolution caused the conflict |

It has happened before, and the first time was recorded differently. ADR 031 describes `1c0419c`
(Dependabot PR #72) as a *clean* text merge that "emitted no conflict marker". Replayed with git's
own merge, it is not: the lockfile conflicts in 7 hunks, and the committed file is the keep-both
resolution of all seven, less one line. GitHub's server-side merge may differ from local git, so
this is a disagreement on the record rather than a proof. But the two incidents now look like the
same act, not two different ones: a lockfile conflict resolved in a text editor.

Across the project's history, 9 of its 13 failed deployments are lockfile failures:
- 7 `ERR_PNPM_BROKEN_LOCKFILE`, the two incidents above;
- 2 `ERR_PNPM_OUTDATED_LOCKFILE`, PR #68.

Three of the nine were production builds of `main`, after PRs #68, #72 and #73.

## Decision

1. **Git never text-merges `pnpm-lock.yaml`.** `.gitattributes` declares
   `pnpm-lock.yaml merge=binary`. Replayed with the attribute, both incidents become a single
   unmergeable conflict: git keeps the current branch's copy, writes no markers, and marks the path
   conflicted. That holds in a working-tree merge and in a bare-repository `merge-tree` reading
   the attribute from `HEAD`, the server-side shape. There is nothing left to "accept both" of.
   Diffs are unaffected; only the merge driver changes.
2. **The integrity step answers what its name claims.** `audit-manifest-integrity.mjs` now asks
   four questions, not two:
   - conflict markers in either file;
   - duplicate keys in `package.json`;
   - duplicate keys in `pnpm-lock.yaml`;
   - range agreement.

   ADR 031 declined the lockfile question because it "needs a YAML parser". It needs the subset
   pnpm writes, which was measured rather than assumed: block keys, `key: scalar`, single-line
   flow collections and plain-scalar sequences, over 5,088 lines. The scanner reads exactly that
   and returns `unevaluable` (exit 2) on anything else. Its coverage is measured against the
   `yaml` package (ADR 007), which agreed on 200 of 200 seeded mutations of the real lockfile
   while prototyping; the test runs 120 of them.
3. **A lockfile conflict is resolved by regenerating, never by hand.**
   `docs/runbooks/lockfile-conflicts.md` gives the command for each place a conflict surfaces.
   The probe's failure message prints the same command.
4. **The failing deployment needs no platform change.** A preview of a broken commit *should* fail;
   Vercel did its job. The repair belongs to the branch, and here the branch is superseded, so the
   recommendation to the owner is to close PR #101. The verified alternative is recorded in
   `STATE.md`: regenerate the lockfile from `main`'s, then resolve the footer. With that lockfile
   the frozen install passes, and the build then fails on the footer exactly as predicted.

## Consequences

- **What the step now catches**, each with a test pointed at the real bytes (ADR 024):
  - the `ed7594a` and `1c0419c` lockfiles, reduced to their damaged blocks;
  - a manifest or lockfile carrying markers, which used to throw out of the probe;
  - a git merge, in a scratch repository, with and without the attribute.

  Two sentinels (`lockfile-duplicate-keys`, `lockfile-merge-binary`) prove those tests can fail.
- **The cost of `merge=binary`**: every concurrent lockfile change is now a conflict, including
  ones git could have merged correctly. That is accepted. A lockfile is regenerated in seconds,
  and a lockfile git "merged correctly" is still a file nobody checked against its manifest.
  Dependabot regenerates its own lockfiles and is unaffected.
- **Not yet observed**: how GitHub's web conflict editor and "Update branch" button present a
  conflict on a path with `merge=binary`. Git's behaviour is proven. GitHub's editor resolves a
  conflict by editing its marker text, and this conflict has none, but whether it declines or
  offers a choice of sides has not been seen. The first live lockfile conflict after this merges
  is the observation, and `STATE.md` holds the question.
- **What a reviewer should take from this**: ADR 031 said *a merge is a write nobody reviewed*.
  A resolution is the same write with a human's name on it, and the GitHub diff of a merge commit
  hides it just as well. "pnpm already refuses it" was true. The step named for the lockfile
  passing that lockfile was the defect.
