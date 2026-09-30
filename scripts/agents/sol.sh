#!/usr/bin/env bash
#
# Runs one subagent task on Codex, on gpt-6.1-sol at medium effort, and prints
# the model's final message. The Claude Code `research` and `reviewer` agents
# are relays that call this: a Claude subagent can only run a Claude model, so
# the work itself happens here. This file names the model for Claude Code; the
# `.codex/agents/*.toml` wrappers name it for Codex.
#
# Usage:
#   scripts/agents/sol.sh run <research|reviewer> <prompt-file>
#   scripts/agents/sol.sh wait <run-dir>
#
# `run` starts the task detached and waits for it; `wait` resumes waiting on a
# task a previous call left running. Each waits at most $SOL_WAIT_SECONDS (540,
# inside Claude Code's 10-minute Bash limit) and exits:
#
#   0   done: stdout is the model's final message, verbatim
#   75  still running: stdout names the run dir; call `wait <run-dir>` again
#   1   failed: stderr carries the tail of the Codex log
#   127 the `codex` CLI is missing
#
# Research gets a workspace-write sandbox with network access (it fetches with
# curl and firecrawl, and may write the `docs/research/` file its caller names);
# reviewer is read-only.

set -euo pipefail

readonly model="gpt-6.1-sol"
readonly effort="medium"
readonly wait_seconds="${SOL_WAIT_SECONDS:-540}"

usage() {
  echo "usage: $0 run <research|reviewer> <prompt-file> | $0 wait <run-dir>" >&2
  exit 2
}

await() {
  local dir=$1 pid waited=0
  pid=$(cat "$dir/pid")
  while kill -0 "$pid" 2>/dev/null; do
    if ((waited >= wait_seconds)); then
      echo "still running: $dir"
      exit 75
    fi
    sleep 5
    waited=$((waited + 5))
  done
  if [[ "$(cat "$dir/exit" 2>/dev/null)" == 0 && -s "$dir/out.md" ]]; then
    cat "$dir/out.md"
    exit 0
  fi
  echo "sol.sh: Codex failed (exit $(cat "$dir/exit" 2>/dev/null || echo unknown)). Log tail ($dir/codex.log):" >&2
  tail -n 40 "$dir/codex.log" >&2
  exit 1
}

start() {
  local role=$1 prompt_file=$2 root dir
  local -a sandbox
  case $role in
    research) sandbox=(-s workspace-write -c sandbox_workspace_write.network_access=true) ;;
    reviewer) sandbox=(-s read-only) ;;
    *) usage ;;
  esac
  [[ -s "$prompt_file" ]] || {
    echo "sol.sh: prompt file '$prompt_file' is missing or empty" >&2
    exit 2
  }
  command -v codex >/dev/null || {
    echo "sol.sh: the codex CLI is not installed; install it and run \`codex login\`" >&2
    exit 127
  }

  root=$(git rev-parse --show-toplevel)
  dir=$(mktemp -d "${TMPDIR:-/tmp}/sol-$role.XXXXXX")
  {
    printf 'Before anything else, read `.agents/agents/%s.md` and follow it: it holds your instructions as the %s agent.\n\n' "$role" "$role"
    cat "$prompt_file"
  } >"$dir/prompt.md"

  (
    status=0
    codex exec -m "$model" -c "model_reasoning_effort=\"$effort\"" "${sandbox[@]}" \
      -C "$root" --ephemeral -o "$dir/out.md" - \
      <"$dir/prompt.md" >"$dir/codex.log" 2>&1 || status=$?
    echo "$status" >"$dir/exit"
  ) </dev/null >/dev/null 2>&1 &
  echo $! >"$dir/pid"
  await "$dir"
}

case ${1:-} in
  run) (($# == 3)) || usage; start "$2" "$3" ;;
  wait) (($# == 2)) && [[ -f "$2/pid" ]] || usage; await "$2" ;;
  *) usage ;;
esac
