<!--
  The brief follows the reviewer prompt and rubric of `interrogate` in cursor/plugins
  (pstack/skills/interrogate), cut to one model.
-->

# Correctness

The bug-hunting axis of step 5 of the `implement` skill. It runs on every diff that changes
behaviour: beside the readback, or beside Standards and Spec in the full review. Standards asks
whether the code follows the repo's conventions and Spec whether it does what the issue asked;
this one asks whether it is **wrong**. It took over the job CodeRabbit did on every PR: the bugs it
caught that the in-session review missed fell in the areas the brief now names.

1. Use the fixed point, diff command and commit list pinned for `code-review`, or for the
   readback.
2. Spawn the reviewer on the model family that did not write the code: Sol when Claude
   implements, Opus when Codex does, so the hunt never shares the author's blind spots. In the
   `full` tier spawn both, with the same prompt: that is a trial comparing the two (below).
   "Spawning a reviewer" in [SKILL.md](SKILL.md) says how each harness reaches each model. Spawn
   in the same message as the other review spawns, with the diff command, the commit list, one
   paragraph stating what the change is meant to do, and the brief below.

   > Assume this diff has a bug its author's tests miss, and hunt for it. The stated intent is
   > correct; challenge the execution. Read the callers and callees of every changed function,
   > beyond the diff. Look where this codebase gets hurt: amounts that round, split or sum to
   > something other than the total; a loader or action reachable by a user who should be
   > refused; an action that runs twice, or stops halfway; a migration the previous container
   > runs against during the deploy; empty, zero, null and boundary values; an error caught and
   > dropped; a guard that hides a broken invariant where the invariant should be fixed; a rule
   > the client and the server each enforce, in two copies that disagree; a second write path
   > (another action, intent or route reaching the same row) missing the authz or validation
   > check the first one has; state that goes stale after a submit, a revalidation or a
   > navigation, an effect or a dialog that outlives what it belongs to, markup that differs
   > between the server render and hydration; an HTTP header, cookie or cache directive that
   > leaks, caches or blocks what it should not; a script that deletes or overwrites (an
   > `rsync --delete`, a reset, a restore) pointed at the wrong target or run with an empty
   > variable.
   >
   > For each finding give its severity (`critical`: a wrong result, lost or corrupt data, a
   > security hole; `warning`: holds today and breaks under a condition you can name), the hunk
   > (file and line), and the **path** that triggers it: the input or sequence of calls, traced
   > through the code, that makes it go wrong. A suspicion you could not trace to a path goes
   > under "Untraced", one line each. Style, naming and structure belong to another reviewer.
   >
   > End with one line: `Would merge: yes | after fixes | no`, and the finding that decides it.
   > "No findings" is a valid review. Under 400 words.

3. Report it under `## Correctness`, after `## Standards` and `## Spec` or after `## Readback`,
   verbatim or lightly cleaned, and add its count and worst finding to the closing summary line.
   With two reviewers, report each under its model's name, and mark each finding the other one
   also raised.

## The two-family trial

From 2026-10-15 the `full` tier runs correctness on Sol and on Opus, to learn whether one is
enough and which. The PR body's `## Review` record carries each reviewer's line: its findings,
how many were fixed and declined, and how many the other also found (the `pr` skill). Around
2026-11-15, or after 15 `full` PRs, read the records back
(`gh pr list --state merged --search '"Tier: full" in:body' --json number,body`) and compare: fixed
findings only one family raised, declines, and overlap. Then keep both, or keep one and change
the `full` tier's requirement in `scripts/review-record.ts` and this file.
