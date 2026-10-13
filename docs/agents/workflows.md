# Workflows

How work flows in a local session: where it starts, which checkout it happens
in, when to investigate instead of editing, when it needs a doc change, and how
a rendered change is checked.

## Where work starts

Implementation happens in a local T3 Code session (ADR-0016): a session has a
browser, the dev database and a human to ask, and the AFK implement runners had
none of those. Three entry points, by how much is still unknown:

- **Small and clear** (a bug, a UI tweak, a one-slice feature): say it in the
  thread, or write the issue with what to build and its acceptance criteria and
  label it `ready-for-agent`. No PRD, no map. A session grabs it and runs the
  `implement` skill.
- **Clear but big** (known shape, several slices): `/grilling` until the shape
  and the test seams are agreed, `/to-spec` to file the PRD
  ([PRD workflow](./issue-tracker.md#prd-workflow)), `/to-tickets` to slice it into sub-issues
  ([Ticket operations](./issue-tracker.md#ticket-operations)), then
  `/implement-spec <PRD>`. The session runs every unblocked sub-issue at once in
  `implementer` subagents, merges each onto its branch and one draft PR,
  ticking each in the PR body's `## Sub-issues` list as it lands
  ([pull-requests.md](./pull-requests.md#prd-prs)), and reviews and babysits
  the chain once at the end: a resumed session reads the list, never the
  scrollback.
- **Foggy** (decisions nobody has made yet): `/wayfinder`. The map's tickets
  are grilling, research, prototype or task; a prototype is a throwaway
  artifact whose result is a decision on its ticket, never another PRD. The map
  ends with one or more PRDs, per the exit shapes in
  [issue-tracker.md](./issue-tracker.md#wayfinding-operations).

A request in the thread names the finish line and the allowed stops, so the
session knows when it is done and when to ask:

```
Implement #1234, open the PR and babysit it.
Done means: the acceptance criteria pass, a regression test cites the issue,
and the PR is ready to merge. Stop only if the seams are unclear.
```

The PR is reviewed in the session before it is opened (`implement` step 5) and
babysat afterwards by the same session, with the waiting done by T3's
`watch_pull_request` (`implement` step 7, per
[pull-requests.md](./pull-requests.md#babysitting-a-pr)).

## Investigate before implementing

A request to investigate, review, diagnose, audit, analyze or explain is a
request for findings: return them with the relevant context, the options and
their tradeoffs, and a recommended next step, then wait. Editing starts when the
user asks to implement, fix, apply or make the change.

## Investigate before recommending

Put a recommendation to the user only once the option you are ruling _out_ has
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
- **An architecture proposal** starts from the open architecture issues, so it
  duplicates none, and names one high-leverage change in the `codebase-design`
  skill's vocabulary rather than a list of cosmetic refactors.

## Branches, worktrees and T3 Code threads

Local sessions run inside [T3 Code](https://github.com/pingdotgg/t3code). Every
T3 thread gets its own git worktree and branch: `t3.json` at the repo root sets
`defaultThreadEnvMode` to `worktree`, and its `runOnWorktreeCreate` script links
`.env` from the main checkout, installs and generates route types before the
agent starts. The worktree's own database and dev port come later, on its first
`pnpm dev`, `db:seed` or `db:migrate` ([local-auth.md](../local-auth.md#one-database-per-worktree)). T3 runs that script only once it is imported (project settings →
Actions → Import from t3.json), once per T3 install. `pnpm dev:info` reports
that state without opening `.env`, which agents are denied: no `.env` means the
script was never imported; `.env` but no `node_modules` means the install step
failed. It also prints the dev port, the database with the `pnpm db:sql` and `psql` lines, and
which tools the shell reaches. The main checkout stays on
`master` and is nobody's working directory.

Rules for a session:

- **Start current.** A thread can be older than the rules it builds against, and a
  worktree behind `master` reproduces what `master` already replaced. Before the
  first edit of an implementation or a prototype,
  `git fetch origin && git log --oneline HEAD..origin/master` prints nothing;
  when it lists commits, `git merge origin/master` first.
- **Work where you started.** The thread's worktree is the working directory.
  Never `git checkout` or `git switch` in the main checkout, and never create a
  worktree of your own (`git worktree add`, Claude's `EnterWorktree`): T3 only
  tracks the branch and pull request of the worktree it created, so a private
  worktree loses the PR badge and the automatic settling of the thread. The one
  exception is `implement-spec`'s implementer subagents, each in an Agent-tool
  worktree under `.claude/worktrees/`: their branches merge into the thread's,
  which keeps the PR, and the skill removes them.
- **Branch prefixes.** T3 names the worktree's branch when it creates the
  thread and renames it once the thread starts, so read it with
  `git branch --show-current`, never from the `t3code/<id>` worktree name. A
  session that renames it or creates one uses `feat/`, `fix/`, `docs/`,
  `chore/`, `refactor/`, `research/` or `prototype/`.
- **One thread, one branch, one PR.** After `gh pr create`, register the PR with
  the thread through the `link_pull_request` tool so T3 shows its status and
  settles the thread when it merges. To keep working on an existing PR, start
  the thread on that branch (or link the PR) instead of checking it out in
  another worktree. The PR body is written with the `pr` skill; how UI
  evidence is attached is in [pull-requests.md](./pull-requests.md).
- **Read-only threads** (writing issues, triage, reviewing a PR without editing
  code) can be started with the "local" workspace mode to skip the install; they
  must not change branches.
- **Leaving a worktree behind is fine; abandoning a branch is not.** Push the
  branch or delete it. Finished worktrees, their branches and databases, and the
  `/tmp/fallow-audit-base-cache-*` caches go with the `housekeeping` skill, which
  runs `pnpm worktree:sweep`.

The Automatically pull option in T3's Source Control settings keeps the main
checkout's `master` current. It only runs when that checkout is clean and on
`master`, which the rules above guarantee.

## Documentation

Most code changes need no documentation change: agents and maintainers read the code. Before
adding a paragraph anywhere under `docs/`, ask what a maintainer or a later session would get
wrong without it. If reading the relevant code answers the question, leave it out.

- `docs/agents/` holds operative rules and the traps that are hard to discover from the source.
  `docs/domain/` holds the model, and `check:doc-map` fails a PR that changes mapped code without
  touching its page or carrying a `Doc-Change-Not-Needed: <reason>` commit trailer
  ([coding-standards.md](coding-standards.md#documentation-gate)).
  `docs/adr/` holds decisions and their reasons.
- Do not enumerate fields or functions, narrate control flow, keep file catalogs, or append PR
  summaries. Types, tests and code already record the implementation. A local explanation goes
  in a nearby code comment; a doc page is for reasoning that crosses boundaries.
- When a documented decision or constraint changes, rewrite or remove the affected text. Do not
  append a second account of the new behaviour. ADRs are the exception: they are records, so a
  change is a dated amendment section, and a reversal is a new ADR that supersedes.
- A session's plan, research notes and scratch files stay out of the repo. The issue and the PR
  are the record of the work ([pull-requests.md](./pull-requests.md#prd-prs)). Only a plan that
  has to outlive its session is committed, as `docs/plans/<kebab-name>.md`, never under `docs/agents/`,
  and is deleted when its work lands: the decisions it produced move to an ADR or to the
  operative page that owns them. Research that is a durable primary source goes under
  `docs/research/` per [issue-tracker.md](./issue-tracker.md#research-tickets).

## UI verification

A change to anything the dev server renders — a route, a component, a loader's output, an
action's feedback — is checked in a real browser before it is reviewed. The browser is the
Playwright CLI (`@playwright/cli`, the `playwright-cli` binary), installed globally with a
headless Chromium ([local-auth.md](../local-auth.md#running-locally) has the two commands).

Use `playwright-cli` only, never a browser the harness ships, such as T3 Code's preview
(`mcp__t3-code__preview_*`): its screenshots blur mid-animation, it resizes itself off the
design width, and its clicks fail when a menu closes in between. If `playwright-cli` is
missing, stop and tell the user; do not fall back to another browser. It keeps its scratch files —
snapshots, console logs, default screenshots — in `.playwright-cli/` under the current
directory, which is gitignored. Skip this for what the browser cannot exercise: types, tests,
tooling, docs, server code with no rendered surface.

Data comes from `pnpm db:seed` against the worktree's own database, never from a database refreshed from
production (see [pull-requests.md](./pull-requests.md#ui-evidence)). The seed prints the demo
accounts and their shared password; [local-auth.md](../local-auth.md#demo-data) lists what it
creates.

The loop:

1. **Get a signed-in session:** `pnpm ui:session <role> <path>`, with `admin`, `academy`,
   `auditor` or `judge`. It starts `pnpm dev` in the background when nothing answers on the
   worktree's port (its log goes to `.playwright-cli/dev.log`), runs `pnpm db:seed` on a database
   with no users (one that has users but not the role's demo account, such as a production
   refresh, is refused, never seeded over), signs in through `/ingresar` in a `playwright-cli` session
   named for the role, sized 1440×900, and opens the path. Every later command names that
   session: `playwright-cli -s=academy snapshot`. The session's login is also saved to
   `.playwright-cli/<role>-state.json`, for `state-load`.

   The worktree has its own port, which `pnpm dev:info` prints; the examples below say 5173. A
   "Port … is already in use" error from `pnpm dev` usually means your own earlier server is
   still up: `pnpm dev:stop`. It stops only listeners running from this worktree; one from
   another directory is left alone and reported, with exit 1.

2. **Another account** than the four is signed in by hand: `open` `/ingresar` in a named
   session, `snapshot` for the field refs (they change between snapshots), `fill` the email and
   password, `click` the button.

3. **Capture the before** during exploration, before editing: `resize 1440 900`, `goto` the
   screen and `screenshot --filename=.playwright-cli/<what>-before.png`. After the edit there is no before left
   to take. Set the size rather than trusting the browser's default: 1440 is the design width
   in [style-guide.md](./style-guide.md#viewports). When the change touches a table or a dense
   row, also check it at `resize 1280 800`, the floor.
4. Drive the flow: `goto`, `click`, `fill`, `select`, `press`, and `snapshot` (or `find "<text>"`)
   to confirm the result. Prefer the snapshot for asserting text and structure; it is what the
   page actually exposes.
5. Diagnose from the page, not from guesses: `console` for errors, `requests` then
   `request <n>` or `response-body <n>` for the network. Fix the source and go back to step 4.
   A first load may log `504 (Outdated Optimize Dep)` while Vite pre-bundles; `reload` once.
   Done when `console` shows no error and no React warning on the screens the change touches: a
   warning (a missing `key`, a hydration mismatch) is a finding to fix, or to report on the PR with
   its reason when it predates the change.
6. **Capture the after** at the end, once the change is final: `resize 1440 900` again if the
   1280 check changed it, then `screenshot --filename=.playwright-cli/<what>-after.png`, same screen, same
   account, same size as the before.
7. Close: `playwright-cli -s=<session> close` (or `close-all`), and stop the dev server with
   `pnpm dev:stop`, which finds it by this worktree's port and says `stopped <pid> on <port>`. A
   session left open holds a Chromium for up to an hour.

Quote any URL with a `$`-segment route or a query string (`'http://localhost:5173/portal?evento=…'`)
so the shell does not expand it. Attach the two screenshots with `pnpm pr:evidence <pr>
.playwright-cli/<what>-before.png .playwright-cli/<what>-after.png`, as [pull-requests.md](./pull-requests.md#ui-evidence)
describes. Never ask the user to check a screen by hand: drive it and show the result.
