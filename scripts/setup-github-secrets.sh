#!/bin/bash
set -eo pipefail

# ============================================================
# AFK — loading the GitHub Actions secrets
# ============================================================
#
# Loads the two secrets the AFK workflows consume (spec §3.1).
# Idempotent: if a secret already exists, it asks before overwriting.
# The full runbook (what each secret is, why, how the platform degrades
# without the PAT) lives in docs/agents/afk-setup.md.
#
# Our model is orchestrator↔runner (spec §3.9): the runner holds NO
# GitHub token. That is why there is NO read-only PAT for reading issues
# inside the runner (the orchestrator prefetches and passes the context
# through env/files). The two secrets are:
#
# 1. CLAUDE_CODE_OAUTH_TOKEN
#    Claude Code OAuth token; the runner authenticates against the
#    Anthropic API with it. Get it with:  claude setup-token
#
# 2. AGENT_PAT
#    A classic PAT with `repo` + `workflow` scopes. The ORCHESTRATOR uses
#    it to (a) chain workflows by adding trigger labels — GITHUB_TOKEN
#    does not fire downstream runs, because of GitHub's anti-loop rule —
#    and (b) push changes to .github/workflows/** (which needs the
#    `workflow` scope).
#    Create it at https://github.com/settings/tokens (classic: repo + workflow).
#    It is strongly recommended: without it the platform still works but
#    degrades (labels land, downstream does not start on its own).
#
# Note: GITHUB_TOKEN is built-in (GitHub injects it per run); it is not loaded.
#
# ============================================================

if ! command -v gh >/dev/null 2>&1; then
  echo "Error: could not find the 'gh' command. Install GitHub CLI: https://cli.github.com" >&2
  exit 1
fi

# Ask gh about auth *before* looking at the repo, instead of classifying the
# error text of `gh repo view`. That text cannot be classified: with no stored
# login gh exits before the API call with a message that itself reads
# "gh auth login" — the very string its no-remote error also contains. Asking
# `gh auth status` answers the question directly, and it fails both when no
# login exists and when a token in the environment shadows a good one.
if ! auth_status=$(gh auth status 2>&1); then
  echo "Error: gh could not authenticate against GitHub." >&2
  printf '%s\n' "$auth_status" | sed 's/^/  /' >&2
  echo "" >&2
  # gh prefers these over the login it stores, so a stale value here fails even
  # when `gh auth login` was run successfully.
  shadowing=""
  for var in GH_TOKEN GITHUB_TOKEN; do
    if [ -n "${!var:-}" ]; then
      shadowing="$var"
      break
    fi
  done
  if [ -n "$shadowing" ]; then
    echo "$shadowing is set and takes precedence over the login gh has stored." >&2
    echo "If it expired or was revoked, run:  unset $shadowing && pnpm setup:secrets" >&2
  else
    echo "Authenticate with:  gh auth login" >&2
  fi
  exit 1
fi

# Keep stderr out of REPO: on success gh writes upgrade notices and deprecation
# warnings there, and folding them into the value would corrupt every later
# `--repo "$REPO"`.
repo_err=$(mktemp)
trap 'rm -f "$repo_err"' EXIT
if ! REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner 2>"$repo_err") || [ -z "$REPO" ]; then
  echo "Error: could not determine the repo. Run this inside a git repo with a GitHub remote." >&2
  sed 's/^/  /' "$repo_err" >&2
  exit 1
fi

echo "Loading secrets for: $REPO"
echo ""

# set_secret <NAME> <help-line>
set_secret() {
  local name="$1"
  local hint="$2"

  echo "Secret: $name"
  echo "  $hint"
  echo ""

  if gh secret list --repo "$REPO" 2>/dev/null | grep -q "^$name\b"; then
    echo "  [already exists] Overwrite? (y/N)"
    read -r overwrite
    if [[ "$overwrite" != "y" && "$overwrite" != "Y" ]]; then
      echo "  Left as is."
      echo ""
      return 0
    fi
  fi

  echo "  Paste the value for $name (hidden input):"
  read -rs token
  if [ -z "$token" ]; then
    echo "  Empty; skipped."
    echo ""
    return 0
  fi
  printf '%s' "$token" | gh secret set "$name" --repo "$REPO"
  echo "  Loaded."
  echo ""
}

set_secret "CLAUDE_CODE_OAUTH_TOKEN" "Claude Code OAuth token. Get it with: claude setup-token"
set_secret "AGENT_PAT" "Classic PAT with repo + workflow scopes. https://github.com/settings/tokens"

echo "============================================================"
echo "Secrets in $REPO (names only, never values):"
echo ""
gh secret list --repo "$REPO"
echo ""
echo "============================================================"
