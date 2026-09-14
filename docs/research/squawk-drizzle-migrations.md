# squawk on Drizzle-generated Postgres migrations

Research for #932 (map #929). Squawk version tested: `squawk-cli@2.65.0` (npm
registry `dist-tags.latest`, published 2026-09-10 —
https://registry.npmjs.org/squawk-cli). Run with
`npx squawk-cli app/db/migrations/*.sql --pg-version 17.0` in a throwaway
worktree, no config file committed.

## 1. Baseline: what fires on the existing 19 migrations

557 warnings total (all level `Warning`, none `Error` — squawk has no severity
above Warning; `--fail-on-violations` on the action is what turns any warning
into a failing check). Counted from `--reporter json` output.

| Count | Rule | Docs |
|---:|---|---|
| 221 | `prefer-robust-stmts` | https://squawkhq.com/docs/prefer-robust-stmts |
| 76 | `prefer-text-field` | https://squawkhq.com/docs/prefer-text-field |
| 69 | `require-concurrent-index-creation` | https://squawkhq.com/docs/require-concurrent-index-creation |
| 52 | `constraint-missing-not-valid` | https://squawkhq.com/docs/constraint-missing-not-valid |
| 51 | `adding-foreign-key-constraint` | https://squawkhq.com/docs/adding-foreign-key-constraint |
| 29 | `prefer-bigint-over-int` | https://squawkhq.com/docs/prefer-bigint-over-int |
| 19 | `require-statement-timeout` | https://squawkhq.com/docs/require-statement-timeout |
| 18 | `require-lock-timeout` | https://squawkhq.com/docs/require-lock-timeout |
| 12 | `ban-drop-column` | https://squawkhq.com/docs/ban-drop-column |
| 4 | `require-concurrent-index-deletion` | https://squawkhq.com/docs/require-concurrent-index-deletion |
| 2 | `identifier-too-long` | https://squawkhq.com/docs/identifier-too-long |
| 2 | `ban-drop-table` | https://squawkhq.com/docs/ban-drop-table |
| 1 | `renaming-table` | https://squawkhq.com/docs/renaming-table |
| 1 | `adding-not-nullable-field` | https://squawkhq.com/docs/adding-not-nullable-field |

336 of the 557 (60%) are in `0000_baseline_production_schema.sql` alone — a
one-shot dump of the whole production schema, never re-run, so every warning
there is moot by construction (see §2, immutability makes this whole file
unlintable in practice regardless). The remaining 221 spread across the 18
"real" generated migrations, concentrated in ones with FKs/indexes
(`0017_add_seminar_inscription.sql`: 27, `0004_magical_marvel_boy.sql`: 47,
`0009_drop_inscription_snapshot_columns.sql`: 21, `0014_fast_jack_power.sql`: 21).

### Noise vs. real hazard, for this generator on Postgres 17

All ten rule categories fired are **structural, not row-count-dependent** —
squawk has no way to know a table is empty, so it always assumes worst case.
Interpreting for a Drizzle-only, no-manual-SQL repo:

- **Noise for this generator (recommend excluding):**
  - `prefer-robust-stmts` (221 hits) — wants `IF NOT EXISTS` / a wrapping
    transaction so a half-applied migration is re-runnable. Drizzle's own
    runner (`drizzle.__drizzle_migrations` + the hash check in
    `scripts/migrate.mjs`, see `docs/db/migrations.md`) already gives
    exactly-once, no-partial-retry semantics: a migration is applied inside
    the transaction Drizzle wraps it in, and a failed one blocks the
    container from starting rather than getting silently re-run. Squawk
    itself special-cases the pattern only for Alembic's version-update
    transaction (`CHANGELOG.md` v2.64.0, "prefer-robust-stmts aware of
    alembic version update transactions" — an Alembic-specific carve-out that
    does not extend to Drizzle), so this fires unconditionally against
    Drizzle output.
  - `prefer-text-field` (76) and `prefer-bigint-over-int` (29) — style/schema
    preferences (`text` over `varchar(n)`, `bigint` over `int`) that are
    `schema.ts`'s call, not a lint-time decision on generated SQL; changing
    them means editing the Drizzle column type, which is a schema change, not
    a migration-file fix.
  - `identifier-too-long` (2) — Drizzle already truncates/hashes identifiers
    that would exceed Postgres's 63-byte limit; a hit here likely means a
    name Drizzle already handled being re-flagged, **could not verify**
    against the two actual hits without deeper inspection (out of budget).
  - `require-lock-timeout` / `require-statement-timeout` (18 + 19) — useful in
    principle, but Drizzle emits no `SET` statements at all, so every single
    generated migration trips both; this is a blanket policy decision (add a
    `.squawk.toml` default) rather than a per-migration signal.

- **Real lock hazards worth keeping, but with caveats:**
  - `require-concurrent-index-creation` (69) — genuinely matters on a live
    Postgres 17 table: non-concurrent `CREATE INDEX` takes a lock that blocks
    writes. But Drizzle cannot emit `CREATE INDEX CONCURRENTLY` inside its
    generated file as-is, because `CONCURRENTLY` cannot run inside a
    transaction block and Drizzle's migrator wraps each migration in one
    (**could not verify** whether Drizzle has an escape hatch for this in the
    installed `drizzle-kit` version — not checked, out of budget). Worth
    keeping as a signal to eyeball on new tables with existing production
    rows; not worth gating CI on until that transaction question is answered.
  - `adding-foreign-key-constraint` (51) / `constraint-missing-not-valid`
    (52) — same story: real `SHARE ROW EXCLUSIVE`-lock-and-table-scan hazard
    on a populated table, easy to fix by hand (`NOT VALID` + separate
    `VALIDATE CONSTRAINT`) but not something Drizzle's generator does. Worth
    a human look on tables that already hold rows in production; the fix is
    a hand-edited migration, which is allowed only before it is merged
    (immutability freezes it after, per `docs/db/migrations.md`).
  - `ban-drop-column` (12) / `ban-drop-table` (2) / `renaming-table` (1) /
    `adding-not-nullable-field` (1) — these are Squawk's expand/contract
    warnings (drop or rename is dangerous while old app code may still read
    the column; adding `NOT NULL` without a default breaks in-flight writes).
    Real for this repo too, but the repo already has its own migration
    ordering/immutability gates and a "new migration, not a hand-edit" policy
    (`docs/db/migrations.md`) — squawk would be a second opinion here, not
    the only one.
  - `require-concurrent-index-deletion` (4) — same shape as the create-index
    rule, for `DROP INDEX`.

Net: of squawk's default rule set, `prefer-robust-stmts`,
`prefer-text-field`, and `prefer-bigint-over-int` account for 326 of 557
(59%) and are not actionable against Drizzle's output without either
changing `schema.ts` (the two `prefer-*` rules) or fighting the transaction
Drizzle already wraps things in (`prefer-robust-stmts`). Excluding those
three collapses the baseline to 231 warnings, concentrated in
`0000_baseline_production_schema.sql` (already frozen and irrelevant) and the
FK/index/timeout rules above, which is a plausible starting `--exclude` list:

```
--exclude=prefer-robust-stmts,prefer-text-field,prefer-bigint-over-int
```

## 2. Restricting the run to files added since `origin/master`

Squawk's own CLI takes `[path]...` — an explicit list of file paths, not just
a glob (`squawk --help`, tested locally: `npx squawk-cli <file> <file> ...`
works). There is no squawk flag that means "only files new vs. a git ref";
the intersection has to be computed with `git diff` and the result fed in as
explicit paths, matching exactly how `check-migration-immutability.mjs`
already computes its own file list:

```sh
git fetch --no-tags --depth=1 origin master
ADDED=$(git diff --name-status --diff-filter=A origin/master -- app/db/migrations '*.sql' | cut -f2)
if [ -n "$ADDED" ]; then
  npx squawk-cli --pg-version 17.0 --exclude=prefer-robust-stmts,prefer-text-field,prefer-bigint-over-int $ADDED
fi
```

This is the same diff shape `check-migration-immutability.mjs` already uses
(`git diff --name-status <baseRef> -- app/db/migrations`, filtering by
`.sql` and the `A` status) — see
`scripts/check-migration-immutability.mjs` and the shared helper
`scripts/migrations/journal.mjs`. A squawk step could reuse that same
`readMigrationChanges()`-style diff (or literally the same `git diff` line)
rather than inventing a second filter, and would compose naturally as one
more step in the existing "migration-order and immutability (vs. master)"
block in `.github/workflows/ci.yml`, which already does
`git fetch --no-tags --depth=1 origin master` once for both of today's
checks. `check-migration-order.mjs` and `check-migration-immutability.mjs`
both default `baseRef` to `origin/master` and both accept an override via
`process.argv[2]`, so a squawk step run the same way stays consistent with
the existing scripts if it is later promoted to its own `.mjs`.

No new-file case exists on `master` today (18 real migrations, all already
applied and frozen), so this could not be exercised end-to-end against a real
"add a migration" branch inside this research pass — the mechanism above was
validated by construction (squawk accepting an explicit file list; the git
diff shape already proven correct by the immutability check's own tests in
`scripts/migrations/journal.db.test.ts`), not by a live run producing a
non-empty `$ADDED`.

## 3. `sbdchd/squawk-action`

- Latest release: `v2.1.0`, published 2026-06-08
  (`gh api repos/sbdchd/squawk-action/releases` /
  https://github.com/sbdchd/squawk-action/releases). Tag `v2` (the floating
  major most workflows pin to) currently points at the same commit as
  `v2.1.0`: SHA `8d113898e16c6cfd417ceba848b0edad97882be3`
  (`gh api repos/sbdchd/squawk-action/tags`).
- **Can be pinned by SHA**: yes — it is a plain composite action
  (`action.yml`, fetched from
  `raw.githubusercontent.com/sbdchd/squawk-action/master/action.yml`), so
  `uses: sbdchd/squawk-action@8d113898e16c6cfd417ceba848b0edad97882be3 # v2.1.0`
  works like any other action; no Docker image or separate release artifact
  to pin.
- **PR-comment behaviour**: the action's `upload-to-github` input (default
  `"true"`) runs `squawk upload-to-github` only when
  `GITHUB_EVENT_NAME == pull_request`; a separate `fail-on-violations` input
  (default `"false"`) controls whether violations also fail the step. Both
  are independent toggles: comment-without-failing is the default. `files`
  (space-separated, explicit paths, **no globs**) or `pattern` (a glob,
  resolved with `find`) select what to lint; `files` is the fit for a
  new-files-only run, since the input already forbids globs and squawk's own
  CLI takes explicit paths anyway.
- **Composite action vs. a plain `npx`/binary step**: the action buys
  exactly two things over `npx squawk-cli` directly in `ci.yml`'s `checks`
  job — the `upload-to-github` PR comment, and installing a pinned
  `squawk-cli` npm version via `npm install -g`. Neither is a strong reason
  to prefer it here: `checks` runs on every PR already (not just ones that
  touch migrations) and none of its other steps comment on the PR (they
  annotate with `::error::`, matching the repo's existing convention in
  `check-migration-order.mjs` / `check-migration-immutability.mjs`); a plain
  `npx squawk-cli@<pinned-version> ... --exclude=...` step, gated on the
  `git diff` file list from §2, matches that convention, needs no extra
  `uses:` pin to track, and reuses the `node`/`pnpm` toolchain the job
  already sets up rather than the action's own `actions/setup-node@v6` step
  (which would install a second, redundant Node). Recommend the plain step.

## 4. Drizzle's `--> statement-breakpoint` markers

Squawk parses them without any stripping needed. `--> statement-breakpoint`
is valid SQL as written: `--` starts a standard SQL line comment, so
`> statement-breakpoint` is just comment text extending to end of line — it
is not a squawk-specific or Drizzle-specific token from the parser's point of
view, only a convention `drizzle-kit`'s own migrator looks for to split one
`.sql` file into separately-executed statements. Verified empirically: `npx
squawk-cli app/db/migrations/*.sql --pg-version 17.0` ran clean against all
19 files, including every `--> statement-breakpoint` line, with no parse
errors and no rule ever firing on the marker line itself (each violation
above points at the real SQL statement on the same or a preceding line, per
the JSON report's `file`/`line`/`column` fields). No config or preprocessing
needed before feeding Drizzle's raw output to squawk.

## What could not be verified

- Whether the 2 `identifier-too-long` hits are against identifiers Drizzle
  already truncated/hashed (i.e., false positives) or genuine 64+-byte names
  — not inspected line-by-line, out of budget.
- Whether the installed `drizzle-kit` version has any mechanism to emit
  `CREATE INDEX CONCURRENTLY` outside its wrapping transaction (relevant to
  whether `require-concurrent-index-creation` is actionable at all for this
  generator, or purely advisory) — not checked against `drizzle-kit`'s own
  docs/source.
- The new-files-only `git diff` + squawk composition was validated by
  construction, not exercised against a branch with an actual new migration
  (none exists on `master` right now).

## Recommendation summary

1. Baseline noise: exclude `prefer-robust-stmts`, `prefer-text-field`,
   `prefer-bigint-over-int` — collapses 557 warnings to 231, mostly in the
   frozen `0000_baseline_production_schema.sql`.
2. New-files-only: `git diff --name-status --diff-filter=A origin/master --
   app/db/migrations '*.sql'`, same shape as
   `scripts/check-migration-immutability.mjs`, feeding explicit paths to
   `npx squawk-cli`. No squawk flag does this natively.
3. Skip `sbdchd/squawk-action`; a plain pinned `npx squawk-cli@<version>`
   step in the existing `checks` job's "migration-order and immutability"
   block is simpler and matches the repo's `::error::`-annotation convention
   rather than adding a second PR-comment channel.
4. `--> statement-breakpoint` needs no stripping; it is ordinary SQL comment
   syntax and squawk parses the files as-is.
