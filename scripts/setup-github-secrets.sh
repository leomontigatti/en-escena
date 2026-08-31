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
  echo "Error: could not find the 'gh' command. Install GitHub CLI: https://cli.github.com"
  exit 1
fi

# `gh repo view` fails for two distinct reasons: there is no GitHub remote, or
# the credentials are rejected. Discarding stderr makes them indistinguishable
# and reports a 401 as "could not determine the repo", which sends you to check
# the wrong thing. Keep the output so the cases stay separable.
if ! REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner 2>&1); then
  if printf '%s' "$REPO" | grep -qiE 'bad credentials|HTTP 401|401 Unauthorized'; then
    echo "Error: gh could not authenticate against GitHub."
    echo "  $REPO"
    echo ""
    if [ -n "${GH_TOKEN:-}" ]; then
      echo "GH_TOKEN is set and takes precedence over the login gh has stored."
      echo "If it expired or was revoked, run:  unset GH_TOKEN && pnpm setup:secrets"
    else
      echo "Authenticate with:  gh auth login"
    fi
  else
    echo "Error: could not determine the repo. Run this inside a git repo with a GitHub remote."
    echo "  $REPO"
  fi
  exit 1
fi

if [ -z "$REPO" ]; then
  echo "Error: could not determine the repo. Run this inside a git repo with a GitHub remote."
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
