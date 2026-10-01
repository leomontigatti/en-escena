<!--
  Local, not vendored. The vendored `code-review` skill takes no local edits
  (docs/agents/afk-vendored-assets.md) and its two axes check conventions and requirements,
  so the axis that hunts for bugs is defined here. The brief follows the reviewer prompt and
  rubric of `interrogate` in cursor/plugins (pstack/skills/interrogate), cut to one model.
-->

# Correctness

The third axis of the full review in step 5 of the skill. Standards asks whether the code
follows the repo's conventions and Spec whether it does what the issue asked; this one asks
whether it is **wrong**.

1. Use the fixed point, diff command and commit list pinned for `code-review`.
2. Spawn **one** `reviewer` sub-agent, in the same message as the two `code-review` spawns, with
   the diff command, the commit list, one paragraph stating what the change is meant to do, and
   this brief:

   > Assume this diff has a bug its author's tests miss, and hunt for it. The stated intent is
   > correct; challenge the execution. Read the callers and callees of every changed function,
   > beyond the diff. Look where this codebase gets hurt: amounts that round, split or sum to
   > something other than the total; a loader or action reachable by a user who should be
   > refused; an action that runs twice, or stops halfway; a migration the previous container
   > runs against during the deploy; empty, zero, null and boundary values; an error caught and
   > dropped; a guard that hides a broken invariant where the invariant should be fixed.
   >
   > For each finding give its severity (`critical`: a wrong result, lost or corrupt data, a
   > security hole; `warning`: holds today and breaks under a condition you can name), the hunk
   > (file and line), and the **path** that triggers it: the input or sequence of calls, traced
   > through the code, that makes it go wrong. A suspicion you could not trace to a path goes
   > under "Untraced", one line each. Style, naming and structure belong to another reviewer.
   >
   > End with one line: `Would merge: yes | after fixes | no`, and the finding that decides it.
   > "No findings" is a valid review. Under 400 words.

3. Report it under `## Correctness`, after `## Standards` and `## Spec`, verbatim or lightly
   cleaned, and add its count and worst finding to the closing summary line.
