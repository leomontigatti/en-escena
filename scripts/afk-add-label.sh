#!/usr/bin/env bash
#
# AFK — add one `agent:*` label to one issue or PR, PAT first (spec §3.4).
#
# Usage: scripts/afk-add-label.sh <number> <label> <woken> <consequence>
#
#   number       the issue or PR number to label
#   label        the label to add, e.g. `agent:implement`
#   woken        the workflow the label is meant to start, for the fallback line
#   consequence  what a wholly refused add leaves behind, for the `::error::`
#
# Reads `GH_REPO`, `GITHUB_TOKEN` and the optional `AGENT_PAT` from the
# environment. Exits 0 once the label is on, 1 when both tokens refused — after
# naming the item with `::error::`, which is the only line that says *which*
# item was left unlabelled. Nothing is printed on the happy path: the caller
# owns the success wording (`Promoted #N`, `Labeled #N`), because only the
# caller knows what the label meant there.
#
# WHY THE PAT IS TRIED FIRST (§3.4). A label added with `github.token` does not
# start another workflow — the events it raises are excluded from triggering
# runs, by design, to stop a repo looping on itself. Only `AGENT_PAT` wakes the
# next workflow in the chain. Without a PAT the label still lands and a human
# starts the run, which is the whole point of the fallback: a degraded chain
# beats no label at all (docs/agents/afk-setup.md).
#
# WHY BOTH EXIT STATUSES ARE READ. The two calls run with `set +e`, which is
# what makes a refusal survivable — and also what makes it invisible if nobody
# reads `$?`. That was #1027: the fallback's status was dropped on the floor and
# the step reported a promotion it had not made. A refused add is worse than a
# no-op in this state machine, because the caller has usually already removed
# the label the item was carrying: it ends up with neither, which reads as fresh
# work and hits the same refusal on every later trigger. A green run claiming
# "Promoted #N" would hide that for as long as it keeps happening.
#
# WHY THIS FILE EXISTS. The block above shipped in four copies — one per call
# site — and #1026 fixed the refusal hole in one of them while two others kept
# swallowing it for another release (#1027). The drift assertion that caught
# that was a stopgap; this is the answer (#1029). Every call site invokes this
# script, so there is one place to fix and one place to test.
#
# WHY THE REST ENDPOINT, NOT `gh {issue,pr} edit`. `gh issue edit` issues a
# GraphQL query touching org fields, which needs `read:org` — a scope the
# classic `repo`+`workflow` AGENT_PAT does not carry. It fails, and the
# PAT-triggered chain is lost to a fallback that was never needed. REST
# `POST issues/{n}/labels` needs only `repo`, and labelling a PR through it
# fires `pull_request_target: labeled`. PRs share the issues namespace, so this
# one endpoint covers both kinds of item.

set -uo pipefail

number="$1"
label="$2"
woken="$3"
consequence="$4"

# Per-command auth (#956): `gh` is handed exactly one token per call, and only
# for that call — nothing is exported, so no later command inherits a credential.
add_label() {
  GH_TOKEN="$1" gh api -X POST \
    "repos/$GH_REPO/issues/$number/labels" -f "labels[]=$label" > /dev/null
}

status=1

if [ -n "${AGENT_PAT:-}" ]; then
  add_label "$AGENT_PAT"
  status=$?
  if [ "$status" -ne 0 ]; then
    echo "AGENT_PAT label add failed for #$number; falling back ($woken won't auto-start)."
  fi
fi

if [ "$status" -ne 0 ]; then
  add_label "$GITHUB_TOKEN"
  status=$?
fi

if [ "$status" -ne 0 ]; then
  echo "::error::Could not label #$number $label; $consequence"
  exit 1
fi
