#!/usr/bin/env bash
#
# Stop hook, blocking.
#
# A turn may not end on a red typecheck. Decided in #936, built in #982.
#
# The gate is `pnpm typecheck && pnpm lint` (~6.2 s measured: 5.1 s + 1.05 s;
# ~11.6 s once #986 makes `pnpm lint` type-aware). Tests are not in it — the
# suite is 81 s — and neither are the `check:*` scripts, which gate staged
# source and belong to pre-commit.
#
# It exits early on the three paths where it buys nothing:
#
# - `SKIP_STOP_CHECKS` set: the documented local bypass.
# - A GitHub workflow outside the AFK implement allowlist. Allowlisting by
#   workflow name rather than by `CI` keeps the exclusion explicit and greppable.
#   `AFK Review` is the case this protects: the reviewer authors no app code, so
#   blocking it spends its budget on a red typecheck it cannot fix.
# - No changed path — tracked or untracked — that typecheck or lint could read.
#
# On failure it exits 2 with the failing output on stderr, which is what Claude
# Code feeds back to the agent. It keeps blocking while the failure persists;
# Claude Code force-closes the turn after 8 consecutive blocks, and that is the
# backstop, which is why `stop_hook_active` only picks the trailing instruction.
#
# There is no `SubagentStop` hook: it is a distinct event, and `research`,
# `Explore` and `Plan` do not author app code.
#
# See docs/agents/workflows.md.

set -uo pipefail

input="$(cat)"

if [ -n "${SKIP_STOP_CHECKS:-}" ]; then
  exit 0
fi

if [ -n "${GITHUB_WORKFLOW:-}" ]; then
  case "$GITHUB_WORKFLOW" in
    "AFK Implement" | "AFK Implement PRD" | "AFK Implement PR") ;;
    *) exit 0 ;;
  esac
fi

cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0

# `--untracked-files=all` because the default collapses an untracked directory to
# `app/`, which hides every extension under it. `-z` so paths arrive unquoted and a rename's two paths arrive as two entries;
# the status prefix in front of each is harmless to a suffix match.
changed="$(git status --porcelain --untracked-files=all -z 2>/dev/null | tr '\0' '\n')"
if ! printf '%s\n' "$changed" | grep -Eq '\.(ts|tsx|mts|cts)$|(^|/| )tsconfig[^/]*\.json$|(^|/| )package\.json$'; then
  exit 0
fi

if output="$(pnpm typecheck 2>&1)" && output="$(pnpm lint 2>&1)"; then
  exit 0
fi

if [ "$(printf '%s' "$input" | jq -r '.stop_hook_active // false' 2>/dev/null)" = "true" ]; then
  instruction="If you cannot fix this, say so explicitly and report the work as blocked."
else
  instruction="Fix this before ending the turn."
fi

printf '%s\n\n%s\n' "$output" "$instruction" >&2
exit 2
