# Triage Labels

The skills speak in terms of five canonical triage roles. This file maps those roles to the actual label strings used in this repo's issue tracker.

| Label in mattpocock/skills | Label in our tracker | Meaning                                                            |
| -------------------------- | -------------------- | ------------------------------------------------------------------ |
| `needs-triage`             | `needs-triage`       | Maintainer needs to evaluate this issue                            |
| `needs-info`               | `needs-info`         | Waiting on reporter for more information                           |
| `ready-for-agent`          | `ready-for-agent`    | Fully specified & grabbable — triage state, **not** an AFK trigger |
| `ready-for-human`          | `ready-for-human`    | Requires human implementation                                      |
| `wontfix`                  | `wontfix`            | Will not be actioned                                               |

When a skill mentions a role (e.g. "apply the AFK-ready triage label"), use the corresponding label string from this table.

Edit the right-hand column to match whatever vocabulary you actually use.

## Priority and type

The five roles above say whether an issue can be picked up. They do not say how much it
matters. Triage also gives every issue exactly one priority label and at least one type
label, and removes `needs-triage` on the way out. An issue with no `priority:*` label has
not been triaged.

| Priority label    | Meaning                                                 | Test                                   |
| ----------------- | ------------------------------------------------------- | -------------------------------------- |
| `priority:urgent` | Breaks money, data or the live event                    | Would I drop what I am doing for this? |
| `priority:next`   | The short list to pull from next. Keep it to about 15   | Will I start this within two weeks?    |
| `priority:later`  | Worth doing, no blocker, not scheduled                  | Would I be sad to close it?            |
| `priority:parked` | Deliberately not now, and the issue names what wakes it | Is there a condition that reopens it?  |

`priority:urgent` is normally empty. A parked issue carries a comment stating its wake-up
trigger ("the first slice of #739 lands"); without one it is `priority:later`. `wontfix` is a
different thing: parked will be done when the trigger fires, `wontfix` was decided against.

| Type label    | Meaning                                                                   |
| ------------- | ------------------------------------------------------------------------- |
| `bug`         | Wrong behaviour today                                                     |
| `enhancement` | New capability or UX                                                      |
| `refactor`    | Internal structure, no behaviour change                                   |
| `chore`       | Dependencies, tooling, CI, docs or operations                             |
| `question`    | A decision to settle rather than work to do; pairs with `ready-for-human` |

An Architecture Review PRD that documents a confirmed defect carries `bug` next to
`refactor`. When the defect is cheap and the PRD is large, extract the defect into its own
`bug` issue so it can ship alone (#1063 out of #740 is the example).

The dispatch queue is `priority:next` plus `ready-for-agent`:
`gh issue list --label priority:next --label ready-for-agent`.

> **`ready-for-agent` does not trigger the AFK workflows.** It is a triage state
> ("specified and grabbable"). Agents trigger on the `agent:*` labels, which a
> human adds by hand to dispatch (PRD → `agent:to-issues`, single issue →
> `agent:implement`). Detail in
> [afk-setup.md → Dispatch](afk-setup.md#dispatch-from-ready-for-agent-triage-to-the-agent-trigger).
> On a reviewed PR, two outcome labels tell you what kind of attention it needs:
> `agent:needs-decision` (a call is yours; run `/review-triage`) and `agent:ready`
> (nothing to decide; merge or arm auto-merge).
