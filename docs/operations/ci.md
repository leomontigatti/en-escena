# Continuous integration

What gates a PR to `master`, how a session waits on it, and how the pins and
dependencies behind it are bumped. Why the gates exist, and what was rejected,
is [ADR-0015](../adr/0015-deterministic-guardrails.md); each job's rationale
lives in the comments of its workflow file.

## Required contexts

Six contexts are required on `master`. Required contexts are a repo setting
outside the repo: renaming a job, or adding one, does not update branch
protection, so making a job required is a human step in the repo settings.

- `checks` (`ci.yml`): `format:check`, `lint`, gitleaks over
  `origin/master..HEAD`, the `check:*` scripts, the migration checks,
  `typecheck`, `test:unit` and `build`, with no database.
- `db-gate` (`ci.yml`): the full `*.db.test.ts` suite against real Postgres 17,
  split across the four runners of the `db-shard` matrix, each with its own
  Postgres service, each running
  `pnpm db:test:reset && pnpm exec vitest --config vitest.db.config.ts --run --shard=<i>/4`.
  `db-gate` runs nothing itself: it `needs` the matrix and fails unless every
  shard succeeded, and it is named exactly that because branch protection
  requires the name. `--shard` splits by file, so a shard runs whole files and
  never shares a database with another; the isolation model of
  [ADR-0007](../adr/0007-db-test-isolation-model.md) holds within each runner.
  Only CI shards, so there is no script for it: locally the suite is
  `pnpm test:db` (PGlite) or `pnpm test:db:postgres` (real Postgres).
- `docs-gate` (`ci.yml`): mapped code changed, so its current-state document
  must change too (`pnpm check:doc-map`).
- `actions-gate` (`ci.yml`): zizmor and actionlint over `.github/workflows/`,
  [below](#the-actions-gate).
- `pr-title` (`pr-title.yml`): `pnpm check:pr-title` over the PR title. It
  lives in its own file because it needs the `edited` event, which fires on a
  body edit too, and in `ci.yml` that would re-run the build and the Postgres
  shards on every description change. The title reaches the script through
  `env: PR_TITLE`, never interpolated into a `run:` block.
- `review-record` (`review-record.yml`): the shared workflow's `review-record`
  action over the PR body's `## Review` record (the shared `pr` skill): the
  reviewers the diff's tier requires are named, by the `review-paths` block of
  [review.md](../agents/review.md), and no code commit landed after the
  reviewed one. Its own file for the same `edited` reason; it skips drafts and
  Dependabot's PRs. The action is pinned to a commit of
  leomontigatti/agent-workflow; bump the SHA to take a change to its rules.

The commit gate before any of these is `.husky/pre-commit`: gitleaks on the
staged diff, `lint-staged`, `check:comment-language`, `typecheck`,
`check:file-tokens` and `check:fallow`. Hooks can be skipped, so it is the
minimum, not the validation of a session's work. What joins it stays fast and
deterministic: formatting staged files through `lint-staged` is the model.

gitleaks is not a pnpm dependency: when the binary is not on `PATH`, the
pre-commit line warns and continues, and CI's `checks` step is the blocking
half. Installing it locally is optional; pin the version `GITLEAKS_VERSION`
names in `ci.yml` (on macOS `brew install gitleaks` tracks the latest instead,
which is close enough):

```sh
curl -fsSL -o /tmp/gitleaks.tar.gz \
  https://github.com/gitleaks/gitleaks/releases/download/v<version>/gitleaks_<version>_linux_x64.tar.gz
tar -xzf /tmp/gitleaks.tar.gz -C /tmp gitleaks && sudo mv /tmp/gitleaks /usr/local/bin/
```

## Waiting on CI from a session

A session never polls by hand. `gh pr checks <n> --watch` blocks until every
check on the PR is terminal and exits non-zero when one failed; run it as a
background command and act when it returns. After a force-push, the run it
watches may be the cancelled one; check the run id it reports against
`gh run list --branch <branch>` before reading a cancelled `db-gate` as red.

## Stacked PRs

CI runs only on PRs whose base is `master`. A PR stacked on another branch gets
no run of its own unless it is part of a GitHub stack: link the chain, bottom
to top, with the `gh-stack` extension (`gh extension install github/gh-stack`,
then `gh stack link <pr> <pr> ...`), and every layer is evaluated as if it
targeted `master`, so `ci.yml` and `pr-title.yml` run for each one and their
checks count towards branch protection. `gh workflow run ci.yml --ref <branch>`
is the fallback for a single PR that is not stacked.

Merging a stack is `gh stack merge <stack> --yes --squash`: one atomic
operation from the bottom up, refused unless every layer is green and the stack
is linear. The trunk moving, or a lower layer receiving a commit after the
layer above it branched, breaks linearity; `gh stack checkout <stack>`,
`gh stack rebase` and `gh stack push` restore it, and the push is a force-push
of every rebased branch, which needs the user's sign-off first. Never merge a
branch into a stacked layer by hand: a merge commit breaks linearity too.

Merge a standalone PR with `gh pr merge --squash --delete-branch` only when its
branch is a leaf. Deleting a branch that other open PRs use as their base
closes those PRs.

## The actions gate

Two tools, both version-pinned in `ci.yml`, neither from the Marketplace:

- **zizmor**, configured by `.github/zizmor.yml`, owns the Actions security
  posture: unpinned `uses:`, dangerous triggers, template injection, over-broad
  `permissions:`, `$GITHUB_ENV` writes. Its online audits (`known-vulnerable-actions`,
  `impostor-commit`, `ref-version-mismatch`) are what let the SHA pins be bumped
  by hand: a pin that goes stale, or no longer matches the tag its comment
  names, turns the gate red on the next PR.
- **actionlint** owns workflow syntax, `${{ }}` expression types, job and step
  references, and shellcheck over `run:` blocks at `--severity=warning`.

A suppression a workflow can justify on its own is an inline
`# zizmor: ignore[<audit>]` with its reason beside it; `.github/zizmor.yml`
holds only those that cannot, each naming the issue that decided or removes it.

### Bumping the pins

Dependabot opens a weekly grouped PR for minor and patch action releases; the
rest is by hand:

1. `pinact run --update` rewrites every `uses:` in `.github/workflows/` to the
   newest release of its action, SHA plus a `# vN` comment. pinact is not a
   repo dependency: take the release binary from `suzuki-shunsuke/pinact`, or
   `go install github.com/suzuki-shunsuke/pinact/cmd/pinact@latest`.
2. Bump `zizmor==<version>`, and `ACTIONLINT_VERSION` and `GITLEAKS_VERSION`
   **together with** their `ACTIONLINT_SHA256` / `GITLEAKS_SHA256`: version and
   checksum are one pin, and the checksum comes from
   `<tool>_<version>_checksums.txt` on the release page.
3. `pnpm format`, then push and read the gate: its online audits are the only
   check that a rewritten pin points at the tag its comment names.

## The Node version

`.nvmrc` holds the Node version as an exact patch. Every `actions/setup-node`
step reads it with `node-version-file: .nvmrc`; `package.json`'s `engines.node`
is `^<that version>`, so pnpm warns (it does not refuse) when a local Node sits
below what CI runs; the Dockerfile's `FROM node:<that version>-bookworm-slim`
repeats the number because `FROM` cannot read a file. Bumping Node is four
edits: `.nvmrc`, `engines.node`, the `FROM` line, and `@types/node`'s range
when the major moves. `tests/workflows/node-version-single-source.test.ts` names any
copy you missed.

## Dependencies

`pnpm check:dependency-audit` fails on the high and critical advisories the
branch **introduces**, comparing its tree with the base ref's; one the base
already carries is inherited, since auditing the whole tree would redden every
open PR the day a CVE lands on a dependency nobody touched. Dependabot alerts
cover that case.

- **To accept an advisory** (no fix published, and the vulnerable path is
  unreachable from this app), add its GHSA to `audit.ignore` in
  `pnpm-workspace.yaml`, with a comment giving the reason and when to recheck.
- **`minimumReleaseAge: 4320`** in `pnpm-workspace.yaml` makes a published
  version wait three days before this repo resolves it. The escape hatch for an
  urgent patch is a `minimumReleaseAgeExclude` entry for that one package, with
  a reason and a date to remove it, never a lower `minimumReleaseAge`.
- **Dependabot** (`.github/dependabot.yml`) opens weekly version-update PRs for
  minor and patch releases only, one grouped PR per ecosystem, with a seven-day
  `cooldown` that stays above `minimumReleaseAge`. A major is a hand-written
  issue whose release notes are checked against this repo (ADR-0015 §5), and so
  is a better-auth minor, which can require a schema migration (#984). A
  major, or any bump by hand, targets the newest release at least three days
  old, not the version an issue's title names.
