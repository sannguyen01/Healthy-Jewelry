# 031 — A clean merge is not a correct merge

## Context

On 2026-09-18, `main` was left un-installable twice in one day. Neither time did anyone
write a bad line, resolve a conflict wrongly, or skip a review. Both times git produced the
damage on its own, reported success, and nothing downstream disagreed.

### The lockfile

Dependabot PR #72 (`toolchain`) was brought up to date with `main` using GitHub's **Update
branch** button. That runs an ordinary text merge. `pnpm-lock.yaml` had two independent
dependency changes sitting on adjacent lines — `@testing-library/react` moving to 16.3.3 on
one side and to 16.3.2 with a different React peer on the other — so git interleaved the
hunks and emitted **no conflict marker**:

```yaml
'@testing-library/react':
  specifier: ^16.3.3
  version: 16.3.3(…react@19.2.8)
  specifier: ^16.3.2
  version: 16.3.2(…react@19.3.0)
```

The merge commit is `1c0419c`. The file held ten duplicated mapping keys across three
regions. `pnpm` refuses such a file outright:

```
ERR_PNPM_BROKEN_LOCKFILE  The lockfile at "pnpm-lock.yaml" is broken:
duplicated mapping key (63:9)
```

That merged to `main` as `4045b5a`. Every job then died at `Install dependencies`, and every
check after it reported `skipped` — which, from outside, is indistinguishable from passing.
That is [ADR 011](011-repeated-identical-failures-must-escalate.md)'s finding, arriving
again through a file nobody reads.

### The manifest

Hours later the same button did the same thing to `package.json` on PR #73 (`410e4d9`),
producing five duplicated keys:

```json
"next": "^16.3.4",
"react": "^19.2.8",
…
"next": "^15.5.24",
"react": "^19.3.0",
```

This half is the one that matters, and it is worse in every way that counts.

**JSON permits duplicate keys.** `JSON.parse` takes the last occurrence and reports nothing.
So on `main` at `4c7c5f6` every tool in the repository — pnpm, `tsc`, Next, this
repository's own manifest contracts — read `next: ^15.5.24` out of a file that also said
`^16.3.4`, while the source tree on that same commit called `revalidateTag(tag, PURGE_NOW)`,
the two-argument Next 16 signature. The manifest, the lockfile and the code each named a
different framework version, and the file that disagreed with the other two parsed without
a murmur.

Nothing in this repository would ever have said so. Not the merge gate, which cannot install.
Not `pnpm-version-contract.test.ts`, which reads the parsed object. Not code review: the
diff GitHub shows for a merge commit hides exactly the lines a merge resolved.

## Decision

**A file that git merged is not a file anyone wrote, and the two questions it cannot answer
about itself are asked before `pnpm install`.**

`scripts/audit-manifest-integrity.mjs` runs as the first step of `verify`, after Node is set
up and before dependencies are installed, and asks:

1. **Does `package.json` declare any key twice among its siblings?** Nothing else asks this.
   It is the silent half.
2. **Do `package.json` and `pnpm-lock.yaml` name the same ranges?** `pnpm install
   --frozen-lockfile` already refuses when they do not — but it refuses *by killing the
   install*, which turns every later check grey. Asking here gives the failure a name, a
   package and two version strings, in a step whose red is legible from the checks list.

Three properties follow from the incident rather than from taste:

- **Before the install.** On both commits the install is what broke. A check in the usual
  place would not have run.
- **No dependencies.** `node:fs` and nothing else, the same reasoning the control-audit
  probes use: a check on the dependency manifest cannot be installed by the manifest it is
  checking.
- **A tokeniser, not a regex.** "Which keys are siblings" is a question about structure. A
  line scanner cannot tell an object boundary from a brace inside a string, and would have
  unknown coverage — [ADR 007](007-regex-guardrails-have-unknown-coverage.md). JSON's
  grammar is small enough that scanning it exactly is about fifty lines, so the
  approximation buys nothing.

The decision module is `scripts/lib/manifest-integrity.mjs`, imported by the runner and by
`src/tests/unit/manifest-integrity.test.ts`, which points it at the real damaged bytes from
`410e4d9` — [ADR 024](024-a-tool-never-pointed-at-a-known-answer.md). It asserts, beside the
finding, that `JSON.parse` on that fixture really does return `^15.5.24`, because a duplicate
key is only interesting once you know which of the two won.

## Consequences

**What this catches.** Duplicate keys in `package.json` at any nesting depth, and any
disagreement between the manifest's effective ranges and the lockfile's recorded ones — on
every push and every pull request, named, before anything else can go grey.

**What it does not.** Duplicate keys in `pnpm-lock.yaml` are left to pnpm, which already
refuses them; this check would need a YAML parser it cannot have at that point in the job,
and a second detector for a failure that is already loud would be two things to keep in step.
The gap that remains is the one the incident actually exposed — that pnpm's refusal reads as
`skipped` — and the remedy for that is `scripts/probe-ci-liveness.mjs`, which already exists.

**A near-miss worth recording.** The first draft compared declared ranges and immediately
reported `postcss` divergent: declared `^8.5.28`, recorded `^8.5.23`, and
`pnpm install --frozen-lockfile` perfectly content. An entry in `pnpm.overrides` replaces the
effective range for the root importer, and the lockfile records what was applied. So the
comparison is against `overrides[name] ?? declared[name]`. A check that did not know this
would have been a permanent red on a correct repository, which is a check people mute — and
the obvious repair, exempting overridden packages, would have blinded it to the four CVE
floors most worth watching. Both the exemption and its limit are asserted.

**What a reviewer should take from this.** The lesson is not "watch lockfiles". It is that
*a merge is a write nobody reviewed*. GitHub's merge-commit diff hides the resolved lines,
the Update-branch button produces such commits by the dozen, and the files most exposed are
the generated ones a human never reads. Anywhere a generated file carries meaning, something
has to check the merge produced a file rather than a collage.
