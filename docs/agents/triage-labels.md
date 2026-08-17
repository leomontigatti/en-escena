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

> **`ready-for-agent` does not trigger the AFK workflows.** It is a triage state
> ("specified and grabbable"). Agents trigger on the `agent:*` labels, which a
> human adds by hand to dispatch (PRD → `agent:to-issues`, single issue →
> `agent:implement`). Detail in
> [afk-setup.md → Dispatch](afk-setup.md#dispatch-from-ready-for-agent-triage-to-the-agent-trigger).
