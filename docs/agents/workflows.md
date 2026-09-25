# Workflows

Project-local workflows for agents working on En Escena.

These workflows adapt useful ideas from `mattpocock/course-video-manager` to this repo. They are repo instructions for Claude Code and other agents that read `CLAUDE.md`.

## Where work starts

Implementation happens in a local T3 Code session (ADR-0016): a session has a
browser, the dev database and a human to ask, and the AFK implement runners had
none of those. Three entry points, by how much is still unknown:

- **Small and clear** (a bug, a UI tweak, a one-slice feature): say it in the
  thread, or write the issue with what to build and its acceptance criteria and
  label it `ready-for-agent`. No PRD, no map. A session grabs it and runs the
  `implement` skill.
- **Clear but big** (known shape, several slices): write one PRD with the
  [PRD workflow](#prd-workflow) and label it `agent:to-issues`, or slice it by
  hand. A session then implements the sub-issues in order onto one branch and
  one PR.
- **Foggy** (decisions nobody has made yet): `/wayfinder`. The map's tickets
  are grilling, research, prototype or task; a prototype is a throwaway
  artifact whose result is a decision on its ticket, never another PRD. The map
  ends with one or more PRDs, per the exit shapes in
  [issue-tracker.md](./issue-tracker.md#wayfinding-operations).

The PR is reviewed in the session before it is opened (`implement` step 4) and
babysat afterwards per [pull-requests.md](./pull-requests.md#babysitting-a-pr).

## Investigate before implementing

When the user asks to investigate, review, diagnose, audit, analyze, or explain
something, do not implement changes automatically. Return findings, relevant
context, options or tradeoffs, and a recommended next step, then wait for the
user to explicitly ask for implementation before editing files.

Start implementing right away only when the user clearly asks to implement, fix,
apply changes, or make the change.

## Delegating to subagents

A subagent costs a full orientation and returns only its summary, so delegate
by the size of the read, not the size of the task:

- Reading one to three files to decide or verify something is inline work.
- Understanding that needs four or more files is one narrow mapping subagent,
  which returns the conclusion, not the file dumps.
- Bulk output (a long diff, a log, a rendered page) is read by a subagent when
  only its conclusion is needed in the main thread.
- Bash for state (`git`, `gh`) stays inline.

Brief a subagent with the exact paths and skill files to read, never a digest
of them, and ask for its report as text with a fixed shape: status, one-line
summary, artifacts touched, next step, risks. A subagent whose last action is a
tool call returns the tool result instead of its report.

Reading outside the repo goes to the `research` agent (`.claude/agents/research.md`). It
fetches with `curl` and with the `firecrawl` CLI through the `firecrawl-search` and
`firecrawl-scrape` skills, and those two are **installed per machine**
(`~/.claude/skills`, `npm i -g firecrawl-cli`, then `firecrawl login`), not vendored here:
the built-in web tools are denied in the user settings, so firecrawl is the only way an agent
can search. On a machine without it the agent degrades to `curl` on plain-text sources and
says so.

## Investigate before recommending

The rule above is about not editing too early. This one is upstream of it: do
not put a recommendation to the user until the option you are ruling _out_ has
been researched as thoroughly as the one you are arguing _for_.

- **A recommendation that discards an option is a claim about that option.**
  Searching only the favoured branch and then re-searching when the
  recommendation is contested produces confident claims that get reversed a turn
  later.
- **Mark every claim as verified or inferred.** A statement about how the system
  behaves needs a `file:line` behind it. If there is none, say so explicitly
  instead of stating it flatly.
- **The docs are not evidence about the code.** They can be stale or contradict
  what is implemented; when a doc and the code disagree, the code is what the
  system does. Check both before building an argument on either, and report the
  divergence.

## Command Guardrail

This section covers validation only. The complete list of `pnpm` scripts — the
database, backup and AFK commands included — is
[Package Scripts](../operations/scripts.md), which links each one to its runbook.

Use `pnpm typecheck` for type validation.

Do not run `pnpm exec tsc` directly. `pnpm typecheck` runs `react-router typegen && tsc --noEmit`, so generated route types are present before TypeScript checks the app. A PreToolUse hook (`.claude/hooks/block-npx-tsc.sh`, wired in `.claude/settings.json`) enforces this: it blocks `npx tsc` / `pnpm exec tsc` / `pnpm dlx tsc` and points back here.

When reading React Router flat-route files with shell commands, quote paths that
contain `$` segments so the shell does not expand route params. For example, use
`sed -n '1,220p' 'app/routes/administracion.eventos_.$eventId.tsx'`.

Formatting commands:

- `pnpm format` runs `prettier --write .` and changes files in place.
- `pnpm format:check` runs `prettier --check .` and only verifies that the
  repo is already formatted.

Do not run both as a required pair during normal development. Run
`pnpm format` when you want the repo formatted, then continue with the next
validation command. Use `pnpm format:check` for final verification, CI-style
checks, or when formatting is already handled by a pre-commit hook such as
`lint-staged`.

Recommended final validation after code changes:

1. `pnpm format:check` when formatting was not just applied with
   `pnpm format`
2. `pnpm check:repo-styles` when the change adds or edits app UI code
3. `pnpm typecheck`
4. `pnpm lint`
5. `pnpm test` when the change affects runtime behavior, shared modules,
   route behavior, UI behavior with meaningful regression risk, database
   schema, repositories, loaders/actions that persist data, or
   persistence-backed business rules. `pnpm test` runs the unit/react suite
   and the DB suite on in-process PGlite, so it needs no local Postgres.
6. `pnpm build` when the change touches routing, server rendering, bundling,
   CSS, or deployment behavior

## Branches, worktrees and T3 Code threads

Local sessions run inside [T3 Code](https://github.com/pingdotgg/t3code). Every
T3 thread gets its own git worktree and branch: `t3.json` at the repo root sets
`defaultThreadEnvMode` to `worktree`, and its `runOnWorktreeCreate` script links
`.env` from the main checkout, installs and generates route types before the
agent starts. The main checkout stays on `master` and is nobody's working
directory.

Rules for a session:

- **Work where you started.** The thread's worktree is the working directory.
  Never `git checkout` or `git switch` in the main checkout, and never create a
  worktree of your own (`git worktree add`, Claude's `EnterWorktree`): T3 only
  tracks the branch and pull request of the worktree it created, so a private
  worktree loses the PR badge and the automatic settling of the thread.
- **Branch prefixes.** T3 names the worktree's branch when it creates the
  thread; when a session renames it or creates one, human-driven work uses
  `feat/`, `fix/`, `docs/`, `chore/`, `refactor/`, `research/` or
  `prototype/`. The `agent/` prefix belonged to the retired AFK implement
  runners (ADR-0016); a session never creates one.
- **One thread, one branch, one PR.** After `gh pr create`, register the PR with
  the thread through the `link_pull_request` tool so T3 shows its status and
  settles the thread when it merges. To keep working on an existing PR, start
  the thread on that branch (or link the PR) instead of checking it out in
  another worktree. What goes in the PR body, and how UI evidence is attached,
  is in [pull-requests.md](./pull-requests.md).
- **Read-only threads** (writing issues, triage, reviewing a PR without editing
  code) can be started with the "local" workspace mode to skip the install; they
  must not change branches.
- **Leaving a worktree behind is fine; abandoning a branch is not.** Push the
  branch or delete it. Remove stale worktrees with `git worktree remove <path>`
  and confirm with `git worktree list`; the `/tmp/fallow-audit-base-cache-*`
  entries are caches `pnpm check:fallow` recreates on demand and can be removed
  at any time.

The Automatically pull option in T3's Source Control settings keeps the main
checkout's `master` current. It only runs when that checkout is clean and on
`master`, which the rules above guarantee.

## Continuous integration

`.github/workflows/ci.yml` runs on every PR to `master`, as four required
contexts: `checks`, `db-gate`, `docs-gate` and `actions-gate`. `pr-title`, from
`pr-title.yml` and described below, is the fifth required context on `master`.
Why the gates in
this section and the next exist at all, and what was considered and rejected, is
[ADR-0015](../adr/0015-deterministic-guardrails.md). The rationale for each job
lives in that file's comments; what follows is the shape a reader needs before
running anything locally:

- `checks`: `format:check`, `lint`, the `check:*` scripts, the migration
  drift/order/immutability/safety checks, `typecheck`, `test:unit` and `build`,
  with no database.
- `db-gate`: the full `*.db.test.ts` suite against real Postgres 17. The tests
  run in the `db-shard` matrix — four runners, each with its own Postgres
  service container, each running
  `pnpm db:test:reset && pnpm exec vitest --config vitest.db.config.ts --run --shard=<i>/4`
  (#962). `db-gate` itself runs nothing: it `needs` the matrix and fails unless
  every shard succeeded. There is no `package.json` script for the sharded
  command, because only CI passes `--shard`; locally the DB suite is still
  `pnpm test:db` (PGlite) or `pnpm test:db:postgres` (real Postgres).
- `docs-gate`: mapped code changed, so its current-state document must change
  too (`pnpm check:doc-map`).
- `actions-gate`: [zizmor](https://docs.zizmor.sh) and
  [actionlint](https://github.com/rhysd/actionlint) over every file in
  `.github/workflows/`. Neither has a `package.json` script — they are Actions
  tooling, they only ever look at that directory, and CI is the only place they
  run. See below for what they own and how to bump them.

`--shard` splits by file, so a shard always runs whole files and never shares a
database with another shard; the serial-within-a-runner isolation model of
`docs/adr/0007-db-test-isolation-model.md` is unchanged. Required contexts are a
repo setting, not part of this file: renaming a job does not update branch
protection, which is why the aggregator is named exactly `db-gate`.

`test:unit` (`vitest.config.ts`) runs as two Vitest projects. A test file that
calls `vi.mock`, `vi.doMock`, `vi.hoisted`, `vi.stubGlobal` or `vi.stubEnv`, or
imports a local helper that does, runs in `unit-isolated` with a fresh module
graph per file; every other file runs in `unit-shared` with `isolate: false`,
sharing a worker and its already-imported modules with the files before it.
The split is computed from file contents when the config loads, so there is no
list to maintain, but a test in `unit-shared` must not rely on module-level
state (a module's `let`, a `Set` or a cache) being reset between files: reset
it in the test, or the next file on that worker sees what this one left.

`.github/workflows/pr-title.yml` is a fifth gate, in its own file (#1007): one
job, `pr-title`, running `pnpm check:pr-title` over
`github.event.pull_request.title`. It is separate from `ci.yml` because it needs
the `edited` event — renaming a title has to re-run the gate — and `edited` fires
on the body too, so putting it in `ci.yml` would re-run build and the four
Postgres shards every time an AFK runner edits a PR description. The title
reaches the script through `env: PR_TITLE`, never interpolated into a `run:`
block. Like the other four it is a required context on `master`, which is a repo
setting outside the repo: this file does not add the requirement.

### The Node version

`.nvmrc` is where the Node version lives, as an exact patch (`22.23.2`). Nothing
else states it independently (#981):

- every `actions/setup-node` step in `.github/workflows/` uses
  `node-version-file: .nvmrc`, never a literal `node-version:`;
- `package.json`'s `engines.node` is `^<that version>`, so pnpm warns on install
  (`Unsupported engine: wanted … current …`) when the local Node sits below the
  floor. It only warns: no `engineStrict` is set in `pnpm-workspace.yaml`, so
  nothing is refused. The floor is deliberately the exact `.nvmrc` patch rather
  than the looser `^22.x` #981 sketched, so that a local Node tracks the one CI
  runs; after a patch bump, `nvm install` clears the warning;
- the Dockerfile's base is `FROM node:<that version>-bookworm-slim`. It repeats
  the number because `FROM` cannot read a file, and an `ARG` defaulted from one
  would still need the default written here; `tests/afk/node-version-single-source.test.ts`
  is what keeps it in step. The tag is deliberately not pinned by digest —
  images-by-digest is the actions gate's decision (#955), not this one.

Bumping Node is therefore four edits, not one: `.nvmrc`, `engines.node` and the
`FROM` line spell the same patch out — only the workflows read the file — plus
`@types/node`'s range whenever the major moves (the types have to describe the
runtime that runs). The point is not that one edit suffices; it is that the test
above names every copy you forgot, instead of a runner and a container quietly
disagreeing months later.

### Waiting on CI from a session

A session never polls by hand. `gh pr checks <n> --watch` blocks until every
check on the PR is terminal and exits non-zero when one failed; run it as a
background command and act when it returns.

### The actions gate

Two tools, both version-pinned in `ci.yml`, neither installed from the
Marketplace:

- **zizmor** (`pipx run zizmor==<version>` — `pipx` is on the runner image and
  `uv` is not), default persona, configured by
  `.github/zizmor.yml`. It owns the Actions security posture: unpinned `uses:`,
  dangerous triggers, template injection, over-broad `permissions:` and
  `$GITHUB_ENV` writes. **Online audits are on**, with
  `GH_TOKEN: ${{ github.token }}` — `known-vulnerable-actions`, `impostor-commit` and
  `ref-version-mismatch` only exist with a token, and they are the whole reason
  the SHA pins can be manual: a pin that goes stale, or that no longer matches
  the tag its comment claims, turns the gate red on the next PR instead of
  rotting quietly.
- **actionlint**, installed from its release tarball, pinned by version and by
  checksum — the same inline pattern as gitleaks in `checks`. It owns
  workflow syntax, `${{ }}` expression types, job/step references and shellcheck
  over `run:` blocks. Shellcheck runs at `--severity=warning`: at `info`/`style`
  the gate is a wall of SC2016 pointing at correct `jq '...'` filters.

There is no pinact step in CI. Pins are rewritten one-shot with `pinact run`
(not a repo dependency — grab the release binary from `suzuki-shunsuke/pinact`,
or `go install github.com/suzuki-shunsuke/pinact/cmd/pinact@latest`);
zizmor's `unpinned-uses` is what keeps them that way.

One suppression lives in `.github/zizmor.yml` instead of next to the code,
temporary and naming the issue that deletes it: `adhoc-packages` (#966, which
pins the agent CLI installs; the `artipacked` one #955 shipped with was removed
by #956). Everything else a workflow can justify on its own carries an inline `# zizmor: ignore[<audit>]` with the reason written next to it
— that is the preferred form, because the excuse and the code it excuses stay
together.

#### Bumping the pins

All of it is a manual edit; nothing here opens update PRs.

1. `pinact run --update` rewrites every `uses:` in `.github/workflows/` to the
   newest release of that action, SHA plus a `# vN` comment.
2. Bump `zizmor==<version>` by hand, and `ACTIONLINT_VERSION` in the
   `actions-gate` job and `GITLEAKS_VERSION` in the `checks` job **together
   with** their `ACTIONLINT_SHA256` / `GITLEAKS_SHA256` — version and checksum
   are one pin in both, and the checksum comes from
   `<tool>_<version>_checksums.txt` on the release page.
   The gitleaks install snippet under "Hook guidance" names that same version
   (there is no local actionlint install); bump it too so a local install keeps
   matching CI.
3. `pnpm format` (Prettier owns the YAML), then push and read the gate. Its
   online audits are the confirmation step: they are what tells you a rewritten
   pin really points at the tag its comment names, which is something you cannot
   check offline.

Adding or renaming a job here does not update branch protection — required
contexts are a repo setting, so making a new job required (as `actions-gate` was
made, by hand, once #955 merged) is a human step outside the repo.

## Linting

`pnpm lint` is [oxlint](https://oxc.rs), configured in `.oxlintrc.json`, which is
the list — do not restate it here. What it owns is React hook mistakes, import
cycles and un-awaited promises. It runs over the whole repo in about six and a
half seconds; the un-awaited-promise rules are type-aware (`oxlint-tsgolint`), so
the run builds a TypeScript program, which is the whole of the 1.5 s → 6.5 s
difference.

**It is deliberately not a style checker**, and rules must not be added to it
casually. The scope rule is that every concern already has exactly one owner:

| Concern                                                                                                                                                                                                                    | Owner                                                                           |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Formatting                                                                                                                                                                                                                 | Prettier (`pnpm format`)                                                        |
| Types, unused locals/parameters, unused labels, unreachable code, implicit returns, switch fallthrough, missing `override`, unresolved side-effect imports (not asset globs such as `*.css`, which `vite/client` declares) | `tsc` (`pnpm typecheck`; the flags live in `tsconfig.json`)                     |
| Hook mistakes, import cycles, un-awaited promises                                                                                                                                                                          | `pnpm lint`                                                                     |
| Repo conventions — doc map, repo styles, banned imports, file tokens, comment language, migration order and immutability, Fallow                                                                                           | the `check:*` scripts                                                           |
| Destructive or lock-hazardous DDL in migrations the branch adds                                                                                                                                                            | squawk (`pnpm check:migration-safety`)                                          |
| Secrets in commits                                                                                                                                                                                                         | gitleaks (`.husky/pre-commit` + the `checks` job), under GitHub push protection |
| High and critical advisories the branch introduces                                                                                                                                                                         | `pnpm audit` (`pnpm check:dependency-audit`)                                    |
| PR title — conventional-commit prefix, English subject                                                                                                                                                                     | `pnpm check:pr-title`, from `pr-title.yml`                                      |
| Workflow syntax and Actions security posture                                                                                                                                                                               | actionlint and zizmor (`actions-gate`)                                          |
| Judgement — design, naming, whether a test proves anything                                                                                                                                                                 | the reviewer, once every rule above has already been applied                    |

A rule that duplicates another owner turns the linter into a chore and gets
ignored, so it does not go in — the rationale is decision 2 of
[ADR-0015](../adr/0015-deterministic-guardrails.md). What justifies the ones
that are in is that nothing else can see them: a stale closure in `useEffect`
type-checks perfectly and misbehaves at runtime, TypeScript tolerates import
cycles until a module reads `undefined` during initialisation, and a promise
nothing awaits type-checks too while silently dropping whatever it would have
rejected with.

Two options on those promise rules are load-bearing, and neither is legible from
the rule name:

- `no-floating-promises` runs with `checkThenables: true`. Without it tsgolint
  only flags values typed as the global `Promise`, and Drizzle's query builders
  are thenables — a floating `db.insert(...).values(...)` inside an action would
  go unreported, which is most of the point of the rule here.
- `no-misused-promises` runs with `checksVoidReturn.attributes: false`, which
  exempts async functions passed to JSX props (`onClick={async () => …}`), normal
  in React. Object-property and argument positions stay checked.

When a promise legitimately goes unawaited, the mark is `void`, and which promises
may carry one is the `void` policy in `.sandcastle/VALIDATION.md`.

Fourteen files are exempt from `exhaustive-deps` via `overrides` in
`.oxlintrc.json`. They use a deliberate `resetKey = JSON.stringify(values)` idiom
to sync a prop into state, which the rule cannot see through; depending on the
object itself would re-run the effect on every render. The list is a **shrinking
allowlist** — do not add to it to make a change pass.

ESLint is not an option here: `typescript-eslint` refuses to run against this
repo's TypeScript 7 and throws on startup
([typescript-eslint#10940](https://github.com/typescript-eslint/typescript-eslint/issues/10940)).
oxlint has no dependency on the TypeScript compiler API, and resolves the `@/`
alias from `tsconfig.json` natively.

If a command fails, fix that failure and rerun the same command before moving to
the next one. Do not start a later validation command while an earlier command is
still failing or while formatting changes are unverified.

Run `pnpm typecheck` and `pnpm build` sequentially, never in parallel.
`pnpm build` cleans and regenerates `build/`, while TypeScript can include
generated files from that directory during `pnpm typecheck`; running both at the
same time can produce transient TS6053 missing-file errors that do not represent
application failures.

Hook guidance:

- Keep pre-commit hooks fast and deterministic. Formatting staged files through
  `lint-staged` is appropriate.
- The pre-commit hook runs `gitleaks git --pre-commit --staged`, `lint-staged`,
  `pnpm check:comment-language`, `pnpm typecheck`, `pnpm check:file-tokens` and
  `pnpm check:fallow`. Treat that as the minimum commit gate, not as the only
  validation path for agent work. Hooks can be skipped and may not run in every
  environment.
- The gitleaks line is the secrets gate (#978) and runs first: nothing else
  matters if the commit carries a credential. It reads `.gitleaks.toml` (the
  upstream ruleset plus the rules for what this repo can leak and the default
  set misses — passwords inside connection URLs, Resend `re_` keys and
  Backblaze `K00` application keys), adds roughly a second to a commit, and
  **warns instead of failing when the binary is not on `PATH`**:
  `gitleaks not installed, secret scan skipped; CI still runs it`. gitleaks is
  not a pnpm dependency, so that is the normal state of a fresh clone and of the
  AFK runners, which hold only tokens GitHub push protection already blocks.
  Installing it locally is optional but recommended; pin the version CI uses
  (8.30.1), for example:

  ```sh
  curl -fsSL -o /tmp/gitleaks.tar.gz \
    https://github.com/gitleaks/gitleaks/releases/download/v8.30.1/gitleaks_8.30.1_linux_x64.tar.gz
  tar -xzf /tmp/gitleaks.tar.gz -C /tmp gitleaks && sudo mv /tmp/gitleaks /usr/local/bin/
  ```

  macOS: `brew install gitleaks`, which tracks the latest release rather than the
  pin — close enough locally, since CI's pinned copy is the one that decides.
  The blocking half is the `gitleaks` step in the `checks` job, which downloads a
  checksum-verified 8.30.1 and scans `origin/master..HEAD`. Bumping it is a manual
  edit, and the procedure is the one in ["Bumping the pins"](#bumping-the-pins)
  above, alongside zizmor and actionlint.

- `pnpm check:comment-language` fails on Spanish prose in a comment or a test
  name anywhere under `.sandcastle/`, `app/`, `scripts/` or `tests/`, plus the
  repo-root configs (#592); on Spanish in the `.md` under `.claude/`,
  `.github/`, `.sandcastle/` and `docs/` — `docs/adr/` and `docs/research/` excepted,
  because both are records of something external (#792); on the `#` comments in
  the YAML under `.github/` and at the repo root (#793); and on the `#` comments
  and the stderr messages of the `.sh` under `.claude/` and `scripts/`, the hooks
  included (#947) — a hook's stderr is the sentence the agent reads back, so it
  is governed like a thrown error, whether it sits on the `>&2` line or in the
  variable that line prints. It reads three instruments: Spanish function words,
  any word carrying an accent or `ñ`, and every Spanish noun `CONTEXT.md` names. Prose is governed like an identifier,
  so `comprobante` is the only Spanish that survives bare; naming the Spanish
  term is still fine, marked as data. In code, quoted copy and backticked names
  are data; in markdown, only backticked ones are. See the Code Language section
  of `.sandcastle/CODING_STANDARDS.md`.
- `pnpm check:fallow` is the Fallow audit on its `new-only` gate; see
  [fallow.md](fallow.md) for what it gates and what it costs.
- `pnpm check:pr-title "<title>"` is the same language rule applied to a PR
  title, plus a conventional-commit prefix (#1007). PRs are squash-merged, so
  the title lands on `master` as the commit subject. The prefix is one of the
  ten types the history uses, an optional `(scope)`, an optional `!`, then `: `
  and the subject; the subject — not the scope, which is free-form and holds
  Spanish domain names like `feat(finanzas)` — goes through the
  `check:comment-language` detector, glossary included. It runs from
  `pr-title.yml` rather than from `ci.yml`; locally it takes the title as its
  first argument, or reads `PR_TITLE`.
- `pnpm check:migration-safety` is squawk over the migrations a branch _adds_,
  and reaches the network (`pnpm dlx`, pinned version) — one of the two
  `check:*` scripts that do, with `check:dependency-audit`. A drop or a rename
  fails the branch, because Coolify keeps the old
  container serving while the new one migrates; lock hazards only warn. The two
  tiers and the `-- squawk-ignore` exception are in
  [../db/migrations.md](../db/migrations.md).
- `pnpm check:dependency-audit` runs `pnpm audit --prod --audit-level=high`
  twice — over this branch's tree, and over the base ref's `package.json`,
  `pnpm-lock.yaml` and `pnpm-workspace.yaml` read with `git show` into a temp
  directory. Neither run installs anything, so the pair costs a couple of
  seconds. It fails on the high and critical advisories, keyed by GHSA, that
  the branch **introduces**; one the base already carries is printed as
  information and inherited. Auditing the whole tree would instead redden every
  open PR — AFK branches included — the day a CVE is disclosed against a
  dependency nobody touched, which is what Dependabot alerts are on for
  (security update PRs off, and there is deliberately no
  `.github/dependabot.yml`). Along with `check:migration-safety` it is one of
  the two `check:*` scripts that reach the network, and a registry failure
  fails the check rather than passing silently. The base ref is read with
  `git show`, so CI has to have fetched it: under Actions a base ref it cannot
  read is an error, because a run that compared nothing must not read as clean.
  Locally, where a clone may have no remote, that case just says so and passes.
  - **To accept an advisory** — no fix published, and the vulnerable path is
    unreachable from this app — add its GHSA to `auditConfig.ignoreGhsas` in
    `pnpm-workspace.yaml`, with a comment giving the reason and when to
    recheck, in the style of the `nwsapi` override. Both runs read that file,
    so the entry applies to the base side too. (The key becomes `audit.ignore`
    once `packageManager` reaches pnpm >= 11.16.0.)
  - **`minimumReleaseAge: 4320`**, also in `pnpm-workspace.yaml`, makes a
    published version wait three days before this repo will resolve it — the
    window most recent npm supply-chain compromises were caught and unpublished
    in. It is set explicitly so pnpm is strict about it: a version too new
    fails resolution instead of quietly falling back to an older one. The
    escape hatch for an urgent patch is a `minimumReleaseAgeExclude` entry for
    that one package, with a reason and a date to remove it — never a lower
    `minimumReleaseAge`.
- `pnpm check:file-tokens` is a staged-source commit gate, not a required
  validation command after every implementation. Run it before committing
  staged application source, before a PR handoff that depends on staged files,
  or while working on a file-size refactor.
- Prefer running `pnpm typecheck` explicitly before finishing. This command
  must stay as `pnpm typecheck`, not `pnpm exec tsc`, because it generates React
  Router route types before TypeScript runs.
- Two Claude Code hooks run inside the session itself (#982), and they fire in
  the AFK implement runners too — hooks are configuration, not a terminal
  feature, so a headless runner reads the same `.claude/settings.json` (#930):
  - **`PostToolUse` on `Write|Edit`** → `.claude/hooks/format-edited-file.sh`
    runs `node_modules/.bin/prettier --write --ignore-unknown` over the file the
    tool just wrote. It calls the binary directly rather than through
    `pnpm exec`, which costs 0.9 s wall against 93 ms of actual Prettier, and it
    always exits 0 without writing to stderr: `PostToolUse` stderr is fed back to
    Claude, and a reformat is not something to react to. An unsupported path — a
    `.png` — is a silent no-op. The matcher is exact-string alternation, so it
    does not cover `NotebookEdit`; this repo has no notebooks.
  - **`Stop`** → `.claude/hooks/stop-typecheck-lint.sh` runs
    `pnpm typecheck && pnpm lint` and **blocks** with exit 2, putting the failing
    output in front of the agent. It costs ~11.6 s (5.1 s typecheck + ~6.5 s
    lint, type-aware since #986). It exits 0 without running
    anything when `SKIP_STOP_CHECKS` is set, when `GITHUB_WORKFLOW` is set
    (no workflow authors app code since ADR-0016), or when no changed path — tracked or untracked — matches what either half
    of the gate reads: `.ts`/`.tsx`/`.mts`/`.cts` plus `tsconfig*.json` and
    `package.json` for typecheck, and `.js`/`.jsx`/`.mjs`/`.cjs` plus
    `.oxlintrc.json` for lint — type-aware lint reads `.ts`/`.tsx` as well, which
    the typecheck half of the union already covers. It reads the working tree only, on purpose:
    committed work has already passed `.husky/pre-commit`, which runs
    `pnpm typecheck` on every commit (#934, in the AFK runners too), so this gate
    owns the uncommitted remainder of a turn — the one thing that leaves
    uncovered is lint on committed changes, which CI's `checks` job owns. The
    allowlist is by
    workflow name rather than by `CI` so the exclusion stays explicit and
    greppable; `AFK Review` is the case it protects, since the reviewer authors
    no app code and would spend its budget on a red typecheck it cannot fix.
    There is no `SubagentStop` hook: it is a distinct event, and `research`,
    `Explore` and `Plan` do not author app code.

  `SKIP_STOP_CHECKS` is the documented local bypass: set to any value, it turns
  the gate off — `SKIP_STOP_CHECKS=1 claude`, or export it for the session. The gate keeps blocking while the failure
  persists; Claude Code force-closes the turn after 8 consecutive blocks, which is
  the backstop, so the wording of the last instruction is all `stop_hook_active`
  decides.

During the development loop, prefer focused validation for the area being
changed before running the broader final checks. The `Stop` gate above is the
backstop, not the plan: it catches a turn that would have ended red, but it runs
once at the end and knows nothing about which area you touched. Prefer:

- Run `pnpm check:repo-styles` when the change adds or edits app UI code.
  This repo-style check blocks hardcoded Tailwind color scales and `space-x/y-*`
  utilities in application source, while keeping explicit coded exceptions for
  intentional patterns such as the overlapping `AvatarGroup`.
- `pnpm check:file-tokens` is a strict file-token check for staged
  application source files, so it belongs to the commit or PR-handoff path
  rather than every normal implementation pass. It fails when a staged `app`
  module is above `5500` estimated tokens (`bytes / 4`). Refactor at a clear
  module boundary before committing instead of adding a large staged file. Run
  it earlier only when the change is likely to push a touched app file over the
  threshold or when validating a file-size refactor.
- Run the nearest relevant Vitest file or test name for small non-database
  changes, then run `pnpm test` before finishing when the change affects
  runtime behavior, shared modules, route behavior, or UI behavior with
  meaningful regression risk.
- Use `pnpm test:db <path-to-db-test>` while iterating on database
  schema, repositories, loaders/actions that persist data, or
  persistence-backed business rules. This runs the fast in-process PGlite
  harness against a single file.
- Run `pnpm test` before finishing when the change affects runtime behavior,
  shared modules, route behavior, UI behavior, schema, or persistence-backed
  business rules. It covers the unit/react suite and the DB suite on PGlite,
  and `pnpm build` for routing, server rendering, bundling, CSS, or deployment
  behavior.
- Do not use focused runs as the only final validation when the change touches
  a shared interface, cross-surface behavior, schema, or persistence-backed
  business rule.

`pnpm test` and `pnpm test:db` run on in-process PGlite and need no local
Postgres, so the AFK implementer and reviewer can run them on a GHA runner with
no Postgres service. Real Postgres is the high-fidelity path
`pnpm test:db:postgres`, for manual fidelity checks; CI covers the same suite
and the same config, sharded across `db-shard` (#305, #962). For Codex sessions inside the managed sandbox, that path still
needs elevated local permission because `TEST_DATABASE_URL` points at Postgres
over TCP on `localhost:5433`. When requesting persistent approval, use these
scoped prefixes:

- `pnpm test:db:postgres`
- `pnpm db:test:reset`
- `docker compose up -d postgres` when the local Postgres container must be
  started for the session

This approval is operational only; it does not change the reliable validation
target. `pnpm test:db:postgres` must continue to use `TEST_DATABASE_URL`,
not production or preview data.

To reset the local test database on demand — drop the `en_escena_%` tables and
enums, wipe the `drizzle` migration state, and re-apply the versioned migrations
from scratch — run `pnpm db:test:reset`. That is the canonical reset procedure
for the Postgres-backed test database.

## React Router Flat Routes

This repo uses `@react-router/fs-routes` flat route naming. When adding a
dedicated form or detail route under a list URL, make the form/detail route a
sibling of the list route unless the list component intentionally renders an
`<Outlet />`.

Use a trailing underscore on the list segment in child filenames to avoid
accidental parent/child nesting:

- List: `administracion.eventos.tsx`
- Detail sibling: `administracion.eventos_.$eventId.tsx`
- New-form sibling: `administracion.eventos_.nuevo.tsx`

Do not use `administracion.eventos.$eventId.tsx` or
`administracion.eventos.nuevo.tsx` unless
`administracion.eventos.tsx` renders `<Outlet />`. Without an outlet,
the child route matches but the user keeps seeing the parent list instead of the
detail or form screen.

After adding or renaming route files, run `pnpm typecheck` and inspect
`.react-router/types/+routes.ts` when route parentage matters. The target
form/detail route should not list the list route as its parent unless nesting is
intentional.

## App Code Placement

Keep React Router files in `app/routes` as thin route entrypoints. A route file
should own route metadata and adaptation only:

- `meta`
- `handle`
- `loader` and `action` functions that delegate to feature/server modules
- the default route component that wires route data/search params to a feature
  view
- route-only re-exports used by existing tests

Do not use route files as the long-term home for table definitions, modal flows,
form controllers, loader/action business logic, or route-local helper clusters.
When a route grows past simple adaptation, move the implementation behind a
feature module.

Use `app/features/<surface>/<feature>/<flow>/` for product-surface workflows
that belong to one area of the app. The first established pattern is:

```text
app/features/portal/choreographies/
|-- list/
|   |-- server.ts
|   `-- view.tsx
|-- create/
|   |-- server.ts
|   |-- flow.ts
|   |-- dialog.tsx
|   `-- ...
`-- detail/
    |-- server.ts
    |-- view.tsx
    |-- music-editor-form.tsx
    `-- ...
```

Inside a feature flow:

- Use `server.ts` for route loader/action implementation, route-specific
  orchestration, and request/form parsing.
- Use `view.tsx` for the route-level screen view when the folder name already
  supplies the context (`list/view.tsx`, `detail/view.tsx`).
- Use specific filenames for substantial submodules, such as
  `music-editor-form.tsx`, `flow.ts`, `fields.tsx`, or
  `formatters.ts`.
- Co-locate focused tests with the module they exercise when the behavior is
  feature-specific.

Use `app/lib/<domain>` for domain-neutral modules whose interface is useful
across product surfaces. Do not move a module from `app/lib` into a feature
only because one route imports it today. Keep modules such as choreography
registration resolution, event bases, auth/session policy, and storage adapters
in `app/lib` when their behavior is not owned by one product surface.

Use `app/components/ui` for shadcn/ui primitives and `app/components/shared`
for reusable cross-surface UI primitives. Avoid placing feature-specific screens,
dialogs, tables, or form flows in `app/components/shared`; keep those inside the
feature folder until at least two product surfaces need the same module through
a small stable interface.

Use English for code filenames, folder names, symbols, and technical module
names. Keep Spanish for user-facing UI copy, route path segments that are part
of the product URL contract, and canonical domain vocabulary documented in
`CONTEXT.md`.

## Portal Layout Routes

The academy portal intentionally uses a React Router layout route:

- `portal.tsx` owns `PortalShell`, loads shell-wide data, and renders
  `<Outlet />`.
- `portal._index.tsx` owns the `/portal` dashboard content.
- Portal child screens render only their screen content. Do not render
  `PortalShell` again from `portal.profesores.tsx`,
  `portal.bailarines.tsx`, `portal.coreografias.tsx`, detail routes, or other
  portal children.
- List/detail routes that should share the portal shell but not nest inside the
  list component use trailing-underscore sibling filenames:
  `portal.profesores_.$professorId.tsx`,
  `portal.bailarines_.$dancerId.tsx`, and
  `portal.coreografias_.$choreographyId.tsx`.
- Child loaders/actions still call `requireAcademyUser(request)` for
  authorization, even when they do not need shell data in their return value.
- Portal breadcrumbs come from `handle.portalBreadcrumbs` on child routes and
  are collected by `getPortalBreadcrumbItems(matches)` in `portal.tsx`.

Do not reintroduce `portal.profesores.$professorId.tsx`,
`portal.bailarines.$dancerId.tsx`, or
`portal.coreografias.$choreographyId.tsx` unless the corresponding list route
renders an `<Outlet />`; otherwise React Router will match a child URL while the
screen keeps rendering the list.

## Admin Layout Routes

The `Panel de administración` also uses a React Router layout route:

- `administracion.tsx` owns `AdminShell`, loads shell-wide user and Event
  active context, and renders `<Outlet />`.
- `administracion._index.tsx` owns the `/administracion` dashboard content.
- Administration child screens render only screen content. Do not render
  `AdminShell` again from `administracion.profesores.tsx`,
  `administracion.bailarines.tsx`, `administracion.eventos.tsx`,
  `administracion.usuarios.tsx`, detail routes, or event-base children.
- Administration route metadata comes from `handle.adminBreadcrumbs` and
  `handle.adminShell`. Collect it in `administracion.tsx` with
  `getAdminBreadcrumbItems(matches)` and `getAdminShellOptions(matches)`.
- Use `handle.adminShell.showEventSelector = false` for global user-management
  screens that should not show the active-event summary.
- List/detail/form routes that should share the administration shell but not
  nest inside the list component use trailing-underscore sibling filenames:
  `administracion.profesores_.$professorId.tsx`,
  `administracion.bailarines_.$dancerId.tsx`,
  `administracion.eventos_.$eventId.tsx`,
  `administracion.eventos_.nuevo.tsx`,
  `administracion.modalidades_.$modalityId.tsx`,
  `administracion.modalidades_.nueva.tsx`,
  `administracion.categorias_.$categoryId.tsx`,
  `administracion.categorias_.nueva.tsx`,
  `administracion.cronogramas_.$scheduleId.tsx`,
  `administracion.cronogramas_.nuevo.tsx`,
  `administracion.precios_.$priceId.tsx`,
  `administracion.precios_.nuevo.tsx`,
  `administracion.usuarios_.$userId.tsx`, and
  `administracion.usuarios_.nuevo.tsx`.

After adding or renaming administration route files, run `pnpm typecheck`
and inspect `.react-router/types/+routes.ts` when parentage matters. Child
administration routes should list `administracion` as their layout parent, and
list/detail/form routes should stay siblings of the list route unless the list
intentionally renders an outlet.

Do not reintroduce `administracion.eventos.$eventId.tsx`,
`administracion.eventos.nuevo.tsx`,
`administracion.usuarios.$userId.tsx`, or
`administracion.usuarios.nuevo.tsx` unless the corresponding list route renders
an `<Outlet />`; otherwise React Router will match the child URL while the
screen keeps rendering the list.

## Implement

Implementing a feature, fixing a bug or changing code in a local session follows the
`implement` skill ([`.claude/skills/implement/SKILL.md`](../../.claude/skills/implement/SKILL.md)):
call the Skill tool with "implement" before editing. It is the same workflow the AFK implement
runners follow from their prompts — test-first through the `tdd` skill at the ticket's **Test
seams**, typecheck and single test files as you go, the list in
[`.sandcastle/VALIDATION.md`](../../.sandcastle/VALIDATION.md) once at the end, then `code-review`.

Two rules sit on top of it for a local session: keep the change scoped to the requested
behaviour, and do not commit unless the user explicitly asks for a commit.

The DB TDD and Frontend State TDD sections below are this repo's detail for the skill's two
sub-workflows.

## DB TDD

Use this when code interacts with the database, schema, repository functions, loaders/actions that persist data, or business rules backed by stored data.

Principles:

- Validate behavior through the interface the app uses.
- Prefer tests that exercise real queries against a test database over tests that assert implementation details.
- Do not test what TypeScript already proves.
- Focus tests on runtime behavior: ordering, relationships after mutation, constraints, conflict handling, and domain edge cases.
- Add one failing test at a time, make it pass, then continue.

The repo has two DB validation paths:

- `pnpm test:db` is the default suite. It runs `*.db.test.ts` on the
  in-process PGlite harness with a cached schema snapshot, needs no local
  Postgres, and is included in `pnpm test`. Pass a path to focus a single
  file: `pnpm test:db <path>`.
- `pnpm test:db:postgres` is the high-fidelity path. It creates the configured
  test database when needed, pushes the Drizzle schema, and runs `*.db.test.ts`
  against real Postgres through `TEST_DATABASE_URL`. Reserved for the CI gate
  on the PR (#305) and manual fidelity checks. Pass a path to focus a single
  file: `pnpm test:db:postgres <path>`.

For a focused DB test file during development, use:

```bash
pnpm test:db app/lib/example.db.test.ts
```

Use `pnpm test:db <path-to-db-test>` while iterating.
Run `pnpm test` before finishing work that must prove runtime, shared,
route, UI, schema, or persistence-backed behavior; it covers the unit and
PGlite DB suites.
When you need real Postgres for fidelity comparison, run
`pnpm test:db:postgres <path-to-db-test>`.

## Frontend State TDD

Use this when creating or changing reducers, state machines, multi-step flows, or non-trivial derived state.

Workflow:

1. Extract complex state logic into a pure module.
2. Put tests next to that module.
3. Write one failing test for one transition or edge case.
4. Make it pass with the smallest implementation.
5. Repeat until the behavior is covered.
6. Refactor while tests stay green.
7. Wire the tested logic into the component.

Do not introduce `use-effect-reducer` just because the reference repo uses it. Use it only if the project has already adopted it or the current task explicitly adds it.

## Loader Optimization

Use this when writing or reviewing React Router loaders/actions that call the database or service layer.

Watch for:

- Re-fetching records the caller already loaded.
- Loading full nested data when the route only needs a slim projection.
- Running independent queries sequentially when they can be safely parallelized.
- Hiding expensive behavior behind helper functions with broad names.

Prefer slim query variants when a route only needs IDs, labels, status flags, or counts. Keep route loaders focused on data needed by that route.

## Request Performance and Loading

Use this when a route, form, table, or navigation path feels slow.

Measure before diagnosing latency. Do not start with "the database is far from
the app" or "React Router is slow" until you have loader or action timing
around the real route seam. (Postgres has been co-located with the app since
#267, so distance to the database is a particularly poor first guess.)

Measure loader or action timing around the real route seam and separate the
major layers that can hide inside one request:

- auth
- event/context lookup
- main query or mutation
- serialization/readiness work
- revalidation follow-up

Record the route id, intent, and whether the request came from navigation,
`useSubmit`, `fetcher.submit`, or a native `<Form>` path. If a request triggers
revalidation, measure the follow-up loader separately instead of blaming the
original action for the whole wait.

Check duplicate work before deeper optimization:

- A layout loader and child loader both fetching the same event context.
- Independent queries running sequentially instead of in parallel.
- Loader helpers returning more nested data than the route renders.
- RHF forms validating in React and then calling `form.submit()` into a second
  full route cycle.

Current form-submit standard:

- RHF forms validate on the client and then submit through React Router, not
  through `form.submit()` or `HTMLFormElement.prototype.submit()`.
- Use `useSubmit` for route submissions that should navigate or redirect.
- Use `useFetcher.submit` for submissions that should keep the current route,
  modal, or dialog mounted on recoverable errors.
- Shared RHF + React Router submit helpers should pass `FormData`, not
  `Record<string, string>`, so repeated fields, arrays, checkboxes, and file
  inputs survive the abstraction.

Use `docs/agents/request-performance-refactor-plan.md` as the current route
inventory, submit-pattern inventory, and measurement starting point for this
refactor family. Keep it discoverable from child issues and update it when the
baseline assumptions materially change.

## PRD Workflow

Use this when the user asks to turn a conversation, plan, or feature idea into a PRD.

1. Read `CONTEXT.md` and relevant ADRs.
2. Explore the current code enough to avoid proposing stale or incompatible work.
3. Ask for clarification only when a reasonable assumption would create meaningful product or architecture risk.
4. Write the PRD as a GitHub issue in `leomontigatti/en-escena`.
5. Do not add implementation labels automatically.

PRD template:

```markdown
## Problem Statement

## Solution

## User Stories

## Implementation Decisions

## Testing Decisions

## Out of Scope

## Further Notes
```

**Testing Decisions** names the **test seams**: the public interfaces the behaviour is tested
through (a service function, a route's loader or action, a pure state module). The `tdd` skill
tests only at seams agreed up front, and the AFK implement agent has nobody to agree them with, so
the PRD is where that agreement is recorded.

The PRD should be concrete enough for a later agent to break into implementation issues without re-deriving core decisions.

## Issue Breakdown Workflow

Use this when the user asks to break a PRD into implementation issues.

1. Fetch the PRD with `gh issue view <number> --comments`.
2. Confirm whether implementation issues already exist for that PRD, starting with native GitHub sub-issues from `gh issue view <number> --json subIssues,subIssuesSummary` and then checking body links or comments as a fallback.
3. Draft a flat, ordered list of vertical slices.
4. Review the proposed slices with the user before creating issues.
5. Create GitHub issues only after approval. Use `gh issue create --parent <PRD_NUMBER>` so each implementation issue is a native sub-issue of the PRD.

Slice rules:

- Each issue should deliver a narrow but complete path through the stack.
- Each issue should be independently verifiable.
- Prefer vertical slices over horizontal layer-only tasks.
- Put prefactoring first when it makes later slices simpler.
- Keep each issue small enough for one focused agent session.
- Name each issue's test seams, taken from the PRD's **Testing Decisions**.

Issue body template:

```markdown
## Parent PRD

#<PRD_NUMBER>

## What to build

## Acceptance criteria

- [ ] Concrete, checkable outcome
- [ ] Tests cover the new behavior

## Test seams

## Depends on
```

## Architecture Review Workflow

Use this when the user asks to find architecture improvements.

1. Read existing architecture-related issues first so proposals are not duplicates.
2. Read `CONTEXT.md` and relevant ADRs.
3. Look for one high-leverage opportunity, not a list of cosmetic refactors.
4. Prefer changes that increase locality, reduce repeated domain knowledge, or create a clearer test surface.
5. Publish as a PRD only if the user asks to publish.

Useful filters:

- If deleting a module would make complexity disappear, it may be shallow.
- If deleting a module would spread complexity into callers, it may be earning its interface.
- If callers must know too many invariants, the interface may not be deep enough.
- If tests can only cover internals, the public interface may be wrong.
