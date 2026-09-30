#!/usr/bin/env bash
#
# PostToolUse hook (matcher: Write|Edit), wired from both `.claude/settings.json`
# and `.codex/hooks.json`.
#
# Runs Prettier over the files the tool just wrote, so formatting stops being
# anyone's job. Decided in #936, built in #982.
#
# The two harnesses describe the edit differently. Claude Code's `Write`/`Edit`
# send `tool_input.file_path`. Codex matches `Write|Edit` against `apply_patch`,
# whose `tool_input.command` is the patch itself; its `*** Add File:`,
# `*** Update File:` and `*** Move to:` headers name the files, relative to the
# payload's `cwd`.
#
# Three things about this hook are deliberate:
#
# - It calls the Prettier binary directly instead of `pnpm exec prettier`.
#   Measured: 0.9 s wall through pnpm versus 93 ms of actual Prettier. On a hook
#   that fires after every edit, that overhead is the whole cost.
# - It always exits 0 and never writes to stderr. PostToolUse stderr is fed back
#   to the agent, and a reformat is not something the agent should react to.
# - The matcher is exact-string alternation, not a regex, so it does not cover
#   `NotebookEdit`. Intended: this repo has no notebooks.
#
# See docs/agents/workflows.md.

set -uo pipefail

input="$(cat)"
cwd="$(printf '%s' "$input" | jq -r '.cwd // ""' 2>/dev/null)"

# One path per line: Claude Code's `file_path`, or the file headers of a Codex
# patch. A deleted file has nothing to format, so `*** Delete File:` is skipped.
files="$(
  printf '%s' "$input" | jq -r '
    .tool_input.file_path // empty,
    (.tool_input.command // "" | strings
      | split("\n")[]
      | capture("^\\*\\*\\* (Add File|Update File|Move to): (?<path>.+)$")?
      | .path)
  ' 2>/dev/null
)"

[ -n "$files" ] || exit 0

project_dir="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"
prettier="$project_dir/node_modules/.bin/prettier"
[ -x "$prettier" ] || exit 0

while IFS= read -r file; do
  case "$file" in
    /*) ;;
    *) [ -n "$cwd" ] && file="$cwd/$file" ;;
  esac
  [ -f "$file" ] || continue

  # `--ignore-unknown` makes a `.png` or any other unsupported path a no-op
  # rather than an error. Output is dropped either way; the exit code is never
  # the hook's.
  "$prettier" --write --ignore-unknown "$file" >/dev/null 2>&1
done <<<"$files"

exit 0
