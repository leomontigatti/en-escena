# Skills started from upstream

Most of the skills in `.agents/skills/` started as copies of someone else's, and all of them are
ours now. Until 2026-10-11 the ones from `mattpocock/skills` were pinned byte-identical to
upstream by content hash, with a "no local edits" rule; that rule was dropped, so a skill
is edited like any other doc, and checked like one by Prettier and `check:comment-language`.

## Where each came from

| Skill                                                                                                                                  | Upstream                                                                                                                                   |
| -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `code-review`, `codebase-design`, `diagnosing-bugs`, `domain-modeling`, `pr`, `prototype`, `tdd`, `to-spec`, `to-tickets`, `wayfinder` | [`mattpocock/skills`](https://github.com/mattpocock/skills) `skills/engineering/<name>`                                                    |
| `grilling`, `handoff`, `writing-for-agents`                                                                                            | `mattpocock/skills` `skills/productivity/<name>`                                                                                           |
| `resolving-merge-conflicts`                                                                                                            | `mattpocock/skills`, which has since deleted it; kept because `babysit-pr` and `implementer` use it                                        |
| `implement` (as `do-work`, with `DB-TDD.md` and `FRONTEND-TDD.md`)                                                                     | [`mattpocock/course-video-manager`](https://github.com/mattpocock/course-video-manager), reshaped after `implement` in `mattpocock/skills` |
| `implement-spec`                                                                                                                       | `mattpocock/skills` `skills/engineering/implement-spec`, adapted from the start                                                            |
| `babysit-pr`, `housekeeping`                                                                                                           | none                                                                                                                                       |

Last synced with `mattpocock/skills` at `49dd158d` (2026-10-09). The local changes that survived
that sync, beyond the `GLOSSARY.md` rename upstream made too:

- `code-review` names `docs/agents/issue-tracker.md` where upstream says "the tracker doc", and
  keeps the readback and correctness briefs `implement` step 5 uses (`READBACK.md`,
  `CORRECTNESS.md`).
- `wayfinder` resolves a research ticket with the `research` agent, not a `research` skill, and
  captures its findings the way [`issue-tracker.md`](./issue-tracker.md#research-tickets) says.
- `domain-modeling` describes this repo's single context and its glossary entry format
  (identifier, then `ui:`), which `app/lib/shared/domain-docs.test.ts` enforces.
- `diagnosing-bugs` stops at findings when asked to diagnose, and leaves the fix to `implement`.
- `pr` carries the body rules and the one-way doors of [`pull-requests.md`](./pull-requests.md).

## Pulling an upstream change

Nothing compares the skills with upstream: no script, CI job or schedule. To take an improvement,
read the upstream diff since the commit above, port what is wanted by hand into our copy, keep
our local changes where the two conflict, and move the commit and date above along. There is no
installer to re-run: `skills add` would overwrite the local changes.

## Not adopted

- `setup-matt-pocock-skills`: its output, [`issue-tracker.md`](./issue-tracker.md),
  [`triage-labels.md`](./triage-labels.md) and [`domain.md`](./domain.md), already exists.
- `triage`, `grill-me`, `grill-with-docs`, `improve-codebase-architecture`: rarely or never used,
  or covered by `grilling`, `domain-modeling` and the Architecture Review workflow.
- `research`: the `research` agent (`.agents/agents/research.md`) does that job.
