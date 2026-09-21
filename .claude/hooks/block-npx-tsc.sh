#!/usr/bin/env bash
#
# PreToolUse hook (matcher: Bash).
#
# Blocks the TypeScript compiler called directly (`npx tsc`, `pnpm exec tsc`,
# `pnpm dlx tsc`) and points at `pnpm typecheck` instead.
#
# `pnpm typecheck` runs `react-router typegen` first, so the generated route
# types exist before TypeScript checks the app. Calling `tsc` directly
# type-checks against stale route types and reports spurious errors.
#
# See docs/agents/workflows.md.

set -euo pipefail

input="$(cat)"
command="$(printf '%s' "$input" | jq -r '.tool_input.command // ""')"

# npx tsc | pnpm exec tsc | pnpm dlx tsc (with or without flags after it)
if printf '%s' "$command" | grep -Eq '(^|[[:space:]]|[&|;])(npx|pnpm[[:space:]]+(exec|dlx))[[:space:]]+tsc([[:space:]]|$)'; then
  echo "Use 'pnpm typecheck', not 'tsc' directly. 'pnpm typecheck' runs 'react-router typegen' before tsc, so the React Router route types exist when it checks. See docs/agents/workflows.md." >&2
  exit 2
fi

exit 0
