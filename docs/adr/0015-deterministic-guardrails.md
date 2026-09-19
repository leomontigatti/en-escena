# ADR-0015: Deterministic guardrails before judgement

**Status**: accepted

Date: 2026-09-19

Source: the deterministic guardrails map, #929.

Over one map this repo grew an `actions-gate` job, a secrets gate, six tsconfig
strictness flags, a type-aware lint scope, a migration-safety gate, a dependency
audit gate, a PR-title gate and two Claude hooks. This ADR records **why** those
exist and why the alternatives were refused. It does **not** describe them: the
current setup lives in [docs/agents/workflows.md](../agents/workflows.md) (how
each gate is wired, and how to bump its pins) and in
[.sandcastle/VALIDATION.md](../../.sandcastle/VALIDATION.md) (the ownership
table, and what an agent runs before committing). Restating them here would
reproduce the defect #625 diagnosed — two topically identical documents of which
one is true.

## 1. Deterministic first, judgement second

Anything a tool can decide goes into a gate. A reviewer — human or LLM — is the
scarcest and least repeatable resource in the pipeline, and every finding a
linter could have produced is a finding the reviewer did not spend on design,
naming, or whether a test proves anything. Gates are also the only half of the
pipeline that is the same on every run: an LLM that catches an un-awaited promise
four times out of five is not a gate, it is a lottery.

So the split is: a rule that can be written down becomes a rule; the reviewer
keeps only what needs judgement. The reviewer's remaining scope is the follow-up
#946.

The corollary is that a gate must not be advisory. A warning nobody reads is
worse than no gate, because it still costs the run's time. The two deliberate
exceptions are argued where they live: squawk's lock-hazard tier warns because
the hazardous statement is often the correct one, and gitleaks warns when the
binary is absent because a fresh clone should not fail to commit over an optional
download that CI runs anyway.

## 2. One owner per concern

Every concern has exactly one owner, and a new rule enters only if it catches a
bug class **no existing owner can see**. Which owner holds what is the table in
[docs/agents/workflows.md](../agents/workflows.md) § Linting, and it is the table
that is current — this section records only why the split exists.

The reason is that a rule duplicating another owner turns its linter into a
chore and gets ignored wholesale, taking the rules that do matter with it. That
is the whole justification test, and it is why the rule count is not a target in
either direction: the count may grow, and the docs therefore point at
`.oxlintrc.json` rather than counting. A written-down count is a fact that goes
stale on the next PR; the config file cannot.

## 3. Pre-commit stays fast

No tests run on commit. The commit gate is formatting, the language check,
`typecheck`, the token ceiling, Fallow and gitleaks, and a gate that would cost
more than a few seconds needs a stated reason to join them. A slow hook is
bypassed with `--no-verify`, at which point it gates nothing; a fast one is
simply tolerated. The expensive suites belong to CI, which runs them on its own
runners in parallel — the arithmetic is in `.sandcastle/VALIDATION.md` § Why not
`pnpm test`.

The same reasoning sets the agent validation surface. An agent has a 50-minute
budget, and ~13 minutes of serial test suite spent reproducing what CI runs in
parallel is time not spent on the issue.

## 4. Gates judge what a PR adds, not the whole history

`check:migration-safety` reads only the migrations a branch adds.
`check:dependency-audit` fails only on advisories the branch's lockfile
introduces, and prints an inherited one as information. Fallow gates on
`new-only`.

Whole-tree gates have a failure mode that is fatal to trust: the day a CVE is
disclosed against a dependency nobody touched, or the day a rule is tightened,
every open PR goes red at once for reasons none of their authors caused. Teams
respond to that by ignoring the check, which is the one outcome a gate cannot
survive. Scoping to the diff means a red gate always names something the PR
itself did, so red always means act.

This is also what makes tightening cheap. A new rule or a new disclosure lands
without a repo-wide cleanup blocking unrelated work, and the backlog it leaves
behind (the `exhaustive-deps` allowlist, for instance) is an explicit shrinking
list rather than a permanently red pipeline.

## 5. No automated dependency-update PRs

Nothing in this repo opens version-bump PRs. Dependency risk is handled by
Dependabot **alerts** (security updates off, and deliberately no
`.github/dependabot.yml`), by `check:dependency-audit` on what a branch
introduces, and by pnpm's `minimumReleaseAge`, which refuses a release too fresh
to have been caught compromised. Action pins are rewritten one-shot with
`pinact run --update` and kept honest by zizmor's online audits.

A bot that opens bump PRs on a repo whose review capacity is one person plus
agents produces a queue of PRs that are individually unreviewable and collectively
the largest supply-chain surface in the repo — each one an invitation to merge
code nobody read. The alert tells us when a bump is actually needed; the audit
gate stops a branch from adding a known-vulnerable dependency; `minimumReleaseAge`
covers the window in which a compromised release is discovered. Bumps themselves
stay a deliberate act.

## Considered and rejected

Each of these was investigated against this repo, not dismissed in the abstract.
The ticket carries the evidence.

**Compiler and lint scope**

- The large tsconfig strictness flags (`noUncheckedIndexedAccess`,
  `exactOptionalPropertyTypes` and their neighbours) — #937: measured against the
  real tree they produced hundreds of diagnostics dominated by noise, with no
  bug among them worth the migration. The six zero-cost flags were taken instead
  (#995).
- `require-await` — #938: fires on async functions that are async for their
  signature, which is normal in route modules.
- `no-unnecessary-condition` — #938: flags defensive checks on data that is only
  typed as non-null, which is most boundary code here.
- The `correctness`, `perf` and `suspicious` oxlint categories — #938: enabling a
  category buys rules nobody chose, which is precisely what §2 refuses.
- The React Compiler rules — #938: the compiler is not enabled in this repo, so
  the rules gate against a build that does not run.

**Review-shaped gates**

- "Source changed without tests" as a gate — #943: a rule that cannot tell a
  refactor from a feature, and whose only escape is a bypass that then gets used
  by habit. It is a reviewer question (#946).
- PR size limits — #943: the honest cases are large (a generated migration, a
  vendored asset) and the dishonest ones are small.
- Hosted or generic LLM reviewers — the map's Out of scope: this repo's review is
  the AFK reviewer, which reads the repo's own standards; a generic reviewer
  contributes volume, not judgement.
- reviewdog and CODEOWNERS — Out of scope: both solve multi-reviewer routing, and
  there is one reviewer.

**Tooling that duplicates an owner**

- osv-scanner — #942: overlaps `pnpm audit` on the ecosystem that matters here,
  and adds a second advisory database to reconcile for the same finding.
- knip — Out of scope: unused code is `tsc`'s (§2), and knip's remaining surface
  is unused exports, which this repo's module layout makes noisy.
- commitlint — Out of scope: the subject that lands on `master` is the PR title,
  because PRs are squash-merged, so `check:pr-title` gates the artefact that
  actually survives (#1007).
- Changesets — Out of scope: a private, single-deployment app has no versioned
  releases to changelog.
- dependency-cruiser — Out of scope: import cycles already have an owner in
  `pnpm lint`.
- size-limit and coverage diffs — Out of scope: both gate a number that moves for
  legitimate reasons on most PRs, which makes them §4 violations in practice —
  red for reasons the PR did not cause.
- Renovate, and Dependabot version PRs — §5 above.
