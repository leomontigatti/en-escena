# Fallow audit tools

Fallow is both a commit gate and an investigation tool.

**As a gate**, `pnpm check:fallow` (`fallow audit --quiet --gate-marker agent`)
runs in the pre-commit hook and in the `checks` job of CI. This reverses the
earlier decision that Fallow was audit-only: an audit nobody was obliged to run
kept filing its findings as issues after the merge, when a gate would have raised
them while the branch was still open. The audit
takes roughly a second and a half on a normal changeset, which is noise next to the
`pnpm typecheck` already in the hook.

Duplication does not fail the gate. With no duplication `threshold` in
`.fallowrc.json`, a clone group the branch introduces turns the verdict to `warn`
and still exits 0. The `new-only` attribution means a _new_ file that copies an
idiom already repeated across the tree introduces a clone group, even though it
changed nothing about the duplication that was already there. Read that warning
anyway: the fix is usually to extract the idiom (as `scripts/source-files.ts` did
for the guardrails' directory walk), not to suppress it. `git commit --no-verify`
is the escape hatch for a hook that fails on something genuinely unrelated to your
change; CI has none, on purpose.

Read the gate by its **exit code**, unpiped: `pnpm check:fallow; echo $?`. A pipe
into `grep` or `tail` reports that command's status in Fallow's place, which is
how a session chased a failure that was not one. With exit 0, whatever
it printed is informational: the metrics line, functions over a threshold that
`master` already had, and clone groups. With exit 1, the findings it lists are
what this branch added. Exit 2 is not a verdict: Fallow could not run (a bad
config, or a base ref git cannot resolve, as in a shallow clone), so the branch
was never checked. Fix the cause; never treat it as a pass, in CI or locally.

**As an investigation tool**, run `pnpm exec fallow audit --format json --quiet
--explain --gate-marker agent` when auditing a changeset, preparing a PR handoff
or chasing maintainability findings. The task map below is the rest of the
surface.

The audit defaults to `gate=new-only`: only the findings introduced by the current
changeset affect the verdict. Inherited findings in touched files are reported
under `attribution` and annotated with `introduced: false`. A JSON body of
`{ "error": true, ... }` is the exit 2 above: the audit did not run, and its
absence of findings means nothing.

`--base origin/master` is not decoration. Left to itself the audit bases on the
merge base with `origin/<current-branch>` — the branch's own last pushed commit —
so the first `git merge master` into an open branch re-attributes everything
master merged meanwhile to whoever ran the merge. On this repo that meant 12
clone groups and 2 complexity findings inherited from master failing an unrelated
branch's hook. Pinning the base to the default branch keeps "introduced" meaning what the
gate says it means: what this branch adds on top of master.

## Fallow task map

| When the agent is about to...      | Run                                                                                  |
| ---------------------------------- | ------------------------------------------------------------------------------------ |
| delete an "unused" export or file  | `pnpm exec fallow dead-code --trace <file>:<export>`                                 |
| delete an "unused" dependency      | `pnpm exec fallow dead-code --trace-dependency <name>`                               |
| audit a changeset or PR handoff    | `pnpm exec fallow audit --base <ref>`                                                |
| prioritize refactoring             | `pnpm exec fallow health --hotspots --targets`                                       |
| ask who owns the code              | `pnpm exec fallow health --ownership`                                                |
| check reachable code without tests | `pnpm exec fallow health --coverage-gaps`                                            |
| consolidate duplication            | `pnpm exec fallow dupes --trace dup:<fingerprint>`                                   |
| find feature flags                 | `pnpm exec fallow flags`                                                             |
| surface security candidates        | `pnpm exec fallow security`                                                          |
| understand a finding               | `pnpm exec fallow explain <issue-type>`                                              |
| scope a monorepo                   | `--workspace <glob> / --changed-workspaces <ref>` (global flags, prefix the command) |
