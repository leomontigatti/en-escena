#!/usr/bin/env bash
#
# PreToolUse hook (matcher: Bash).
#
# Bloquea invocaciones directas del compilador de TypeScript
# (`npx tsc`, `pnpm exec tsc`, `pnpm dlx tsc`) y sugiere `pnpm typecheck`.
#
# `pnpm typecheck` corre `react-router typegen` primero, así los tipos de rutas
# generados existen antes de que TypeScript chequee la app. Invocar `tsc` directo
# type-checkea contra tipos de rutas viejos y produce errores espurios.
#
# Ver docs/agents/workflows.md.

set -euo pipefail

input="$(cat)"
command="$(printf '%s' "$input" | jq -r '.tool_input.command // ""')"

# npx tsc | pnpm exec tsc | pnpm dlx tsc (con o sin flags a continuación)
if printf '%s' "$command" | grep -Eq '(^|[[:space:]]|[&|;])(npx|pnpm[[:space:]]+(exec|dlx))[[:space:]]+tsc([[:space:]]|$)'; then
  echo "Usá 'pnpm typecheck', no 'tsc' directo. 'pnpm typecheck' corre 'react-router typegen' antes que tsc, así existen los tipos de rutas de React Router al chequear. Ver docs/agents/workflows.md." >&2
  exit 2
fi

exit 0
