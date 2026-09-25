<!--
  Local, not vendored. The two-axis review lives in the vendored `code-review` skill, which
  takes no local edits (docs/agents/afk-vendored-assets.md), so the lighter tier is defined
  here, beside the step that chooses between them.
-->

# Readback

The review tier for a diff that touches none of the risky areas in step 5 of the skill. It does
not check the standards or the spec; it catches a diff that does something other than what its
author thinks it does.

1. Pin the fixed point: the branch point against the base branch. Confirm the diff
   (`git diff <base>...HEAD`) is non-empty and note `git log <base>..HEAD --oneline`.
2. Spawn **one** sub-agent with the diff command and the commit list, and this brief:

   > Read the diff. Restate in plain words what it does, as a reviewer would explain it to the
   > author. Then list anything surprising: behaviour the commit messages do not mention, a
   > change that looks unrelated to the rest, code that contradicts its own comment or name,
   > anything you would ask about before approving. Say "nothing surprising" if there is
   > nothing. Under 200 words.

3. Report it under `## Readback`, verbatim or lightly cleaned, ending with one line: how many
   surprises it flagged.

When a surprise turns out to touch money, results or judging, auth, a migration or a
`CONTEXT.md` term, the diff was risky after all: run the full `code-review`.
