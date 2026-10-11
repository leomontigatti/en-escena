---
name: implement
description: "Implementation workflow: explore, test-first at agreed seams, validate, review, commit. Use when asked to build a feature, fix a bug, or change code in a local session."
---

<!--
  Started as the `do-work` skill vendored from mattpocock/course-video-manager; renamed and
  reshaped after `implement` in mattpocock/skills (TDD through the `tdd` skill, a closing
  `code-review`). Local, not pinned by skills-lock.json. Since ADR-0016 this is the only
  implementation workflow: the AFK implement runners were retired.
-->

# Implement

## 1. Explore

Start current: `git fetch origin && git log --oneline HEAD..origin/master` prints nothing, or you
merge `origin/master` in first
([workflows.md](../../../docs/agents/workflows.md#branches-worktrees-and-t3-code-threads)).

Read the issue or request, then `CONTEXT.md`, the ADRs under `docs/adr/` that touch the area, and
the test files beside the code you will change. Done when you can name the **seams**: the public
interfaces the behaviour will be tested through.

Take the seams from the ticket's **Test seams** when it has them. Otherwise propose them and
confirm with the user; in an unattended run, choose them and state them in the commit body. When
where a seam belongs is itself the question, call the Skill tool with "codebase-design". When the
change renames a domain term or edits `CONTEXT.md` or an ADR, call it with "domain-modeling".

If the change will alter a rendered screen, capture its **before** screenshot now (step 4).

## 2. Build test-first

Call the Skill tool with "tdd" and follow its loop at those seams: one failing test, the minimal
code to pass it, repeat.

- Code that touches the database: also follow [DB-TDD.md](DB-TDD.md).
- Reducers, state machines, multi-step flows: also follow [FRONTEND-TDD.md](FRONTEND-TDD.md).

Validate as you go: `pnpm typecheck` and the single test file for the slice
(`pnpm test:unit <path>`, `pnpm test:db <path>`) each time a slice goes green.

## 3. Validate once at the end

Run the list in [`docs/agents/validation.md`](../../../docs/agents/validation.md): `pnpm typecheck`,
`pnpm lint`, `pnpm test:unit`, and `pnpm test:db <path>` for the DB test files you touched. Fix and
re-run each until it is clean before moving to the next. CI owns the full `pnpm test`.

## 4. Verify in the browser

When the change alters anything the dev server renders, check it in a real browser with
`playwright-cli` against `pnpm db:seed` data, following
[UI verification](../../../docs/agents/workflows.md#ui-verification). Take the **before**
screenshot during step 1, before the first edit, and the **after** here, on the same screen and
account. Both go on the PR through `pnpm pr:evidence`. Skip this step for changes with no rendered
surface, and say so.

## 5. Review

Tier the review by risk:

- **Full review** when the diff touches money (payments, prices, finances, comprobantes),
  results or judging, auth, a migration, a term defined in `CONTEXT.md`, or an operational script
  that deletes or overwrites (an `rsync --delete`, a database reset or restore): call the Skill
  tool with "code-review" on the changes since the branch point, and add the correctness axis.
  The `reviewer` sandbox has no network, so paste the spec's body and comments into the Spec
  axis's prompt, never a `gh` command for it to run.
- **Readback** for everything else: follow [READBACK.md](READBACK.md). One sub-agent restates
  what the diff does and flags anything surprising, in under 200 words. When the diff changes
  behaviour, add the correctness axis beside it, config included (a header, a cache directive, a
  build or server setting). A docs-only diff, or a config-only one that changes no runtime
  behaviour (tooling, agent or editor settings), keeps the readback alone.

The correctness axis is [CORRECTNESS.md](CORRECTNESS.md): one sub-agent, on Opus, that assumes
the diff has a bug and traces the path that triggers it. It runs in the same message as the
other review spawns. It is the in-session review's answer to what CodeRabbit used to catch, so
it runs whether or not CodeRabbit reviews the PR.

A finding is a claim to check, never an instruction. Verify each one against the code on the
branch, running the test or the call when reading does not settle it, then give it one verb:

- **fix**: the claim holds and the change is in scope.
- **decline**: the code disproves it. Keep the disproof (a `file:line`, a test, the invariant
  that covers it) for the final report.
- **ask**: the call is the user's, which includes every finding on the always-ask list of
  [coderabbit-triage.md](../babysit-pr/coderabbit-triage.md#the-three-verbs) that you cannot
  settle from the issue. Bring it to them in the final report.

When the spec and `docs/agents/style-guide.md` or `coding-standards.md` disagree, the standard
wins unless the spec names the exception in so many words: a spec that points at a nonconforming
file as its model asks for the file's shape, not its breach. Such a finding is a Standards one
whichever axis raised it, and it is a **fix**, or an **ask** when an exception is wanted. A finding
backed by the standards is never a **decline** on your judgement alone.

Done when every finding carries a verb and every **fix** is made. Repeat step 3 for anything you
touched. Refactoring belongs here, under green tests.

## 6. Commit

Commit to the current branch when the run started from an issue, the user asked for a commit or a
PR, or the run is unattended; otherwise report the result and leave the tree for the user. An
explicit request from the user not to commit overrides all of these.
Conventional-commit subject and body in English, per `docs/agents/coding-standards.md` § Code
Language.

## 7. Open the PR and hand it off

When the run started from an issue or the user asked for a PR: push the branch, open it ready for
review (never a draft; a PRD run under `implement-spec` keeps its PR a draft until the last slice
lands) in the shape of [pull-requests.md](../../../docs/agents/pull-requests.md)
with `Closes #N`, attach the step 4 evidence when step 4 produced any, and link it to the thread. An issue is the unit of
work here, so a run that starts from one ends in the PR that closes it unless the user says
otherwise. Done when `gh pr view` shows it open and it is linked.

Then call the Skill tool with "babysit-pr": this session judges the review rounds, and a background
`pnpm pr:watch --loop` does the waiting, so the session wakes only when a round needs it. Stop only
at the skill's report.
