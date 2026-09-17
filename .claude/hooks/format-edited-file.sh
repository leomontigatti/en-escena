#!/usr/bin/env bash
#
# PostToolUse hook (matcher: Write|Edit).
#
# Runs Prettier over the file the tool just wrote, so formatting stops being
# anyone's job. Decided in #936, built in #982.
#
# Three things about this hook are deliberate:
#
# - It calls the Prettier binary directly instead of `pnpm exec prettier`.
#   Measured: 0.9 s wall through pnpm versus 93 ms of actual Prettier. On a hook
#   that fires after every edit, that overhead is the whole cost.
# - It always exits 0 and never writes to stderr. PostToolUse stderr is fed back
#   to Claude, and a reformat is not something the agent should react to.
# - The matcher is exact-string alternation, not a regex, so it does not cover
#   `NotebookEdit`. Intended: this repo has no notebooks.
#
# See docs/agents/workflows.md.

set -uo pipefail

input="$(cat)"
file="$(printf '%s' "$input" | jq -r '.tool_input.file_path // ""' 2>/dev/null)"

[ -n "$file" ] || exit 0
[ -f "$file" ] || exit 0

prettier="${CLAUDE_PROJECT_DIR:-.}/node_modules/.bin/prettier"
[ -x "$prettier" ] || exit 0

# `--ignore-unknown` makes a `.png` or any other unsupported path a no-op rather
# than an error. Output is dropped either way; the exit code is never the hook's.
"$prettier" --write --ignore-unknown "$file" >/dev/null 2>&1

exit 0
