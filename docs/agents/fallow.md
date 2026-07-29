# Fallow audit tools

Use Fallow as an audit and investigation tool, not as a mandatory local commit or
push gate. Run `pnpm exec fallow audit --format json --quiet --explain
--gate-marker agent` when explicitly auditing a changeset, preparing a PR handoff
or investigating maintainability findings.

The audit defaults to `gate=new-only`: only the findings introduced by the current
changeset affect the verdict. Inherited findings in touched files are reported
under `attribution` and annotated with `introduced: false`. Treat runtime JSON
errors such as `{ "error": true, ... }` as non-blocking.

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
