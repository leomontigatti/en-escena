// Workflow step: label the hand-off the posted review leaves behind — spec §4.4,
// amended 2026-09-17 (issue #1021).
//
// A step of its own, after the review and its thread replies are posted: the
// thread count it reads has to include the threads this review just opened.
// The label authorises nothing on Actions — `agent:ready` is a cue for a human
// or a session to merge or arm auto-merge, `agent:needs-decision` a cue for
// `/review-triage`. §3.9 stands: no workflow merges and no workflow approves.
//
// Env: GH_REPO, PR_NUMBER, OUTPUT_DIR.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { gh } from "../lib/gh.mjs";
import { outputDir, requireEnv } from "../lib/runner.mjs";

import {
  parseSpecFindings,
  parseUnresolvedThreads,
  REVIEW_OUTCOME_LABELS,
  reviewOutcomeLabel,
  SPEC_FINDINGS_FILE,
} from "./outcome.mjs";

const UNRESOLVED_THREADS_QUERY = `
  query ($owner: String!, $repo: String!, $number: Int!) {
    repository(owner: $owner, name: $repo) {
      pullRequest(number: $number) {
        reviewThreads(first: 100) { nodes { isResolved } }
      }
    }
  }`;

const repo = requireEnv("GH_REPO");
const prNumber = requireEnv("PR_NUMBER");

/**
 * Inline threads still unresolved on the PR. `null` when GitHub wouldn't say —
 * which the classifier reads as "a human looks", never as "nothing left".
 */
function countUnresolvedThreads(): number | null {
  const [owner = "", name = ""] = repo.split("/");
  try {
    return parseUnresolvedThreads(
      gh([
        "api",
        "graphql",
        "-f",
        `query=${UNRESOLVED_THREADS_QUERY}`,
        "-F",
        `owner=${owner}`,
        "-F",
        `repo=${name}`,
        "-F",
        `number=${prNumber}`,
        "--jq",
        "[.data.repository.pullRequest.reviewThreads.nodes[] | select(.isResolved == false)] | length",
      ]),
    );
  } catch (error) {
    console.error(`Could not count unresolved threads: ${String(error)}`);
    return null;
  }
}

/** What the runner recorded about spec findings in the summary. */
function readSpecFindings(): boolean | null {
  try {
    return parseSpecFindings(readFileSync(join(outputDir(), SPEC_FINDINGS_FILE), "utf8"));
  } catch (error) {
    console.error(`Could not read ${SPEC_FINDINGS_FILE}: ${String(error)}`);
    return null;
  }
}

const unresolvedThreads = countUnresolvedThreads();
const specFindings = readSpecFindings();
const label = reviewOutcomeLabel({ unresolvedThreads, specFindings });

console.log(`Unresolved threads: ${unresolvedThreads ?? "unknown"}; spec findings: ${specFindings ?? "unknown"}.`);

// Exactly one of the two lands on the PR: the other comes off in the same edit,
// so a second review round never leaves a stale classification behind.
const removals = REVIEW_OUTCOME_LABELS.filter((other) => other !== label).flatMap((other) => [
  "--remove-label",
  other,
]);
execFileSync("gh", ["pr", "edit", prNumber, "--add-label", label, ...removals], { stdio: "inherit" });
console.log(`Review outcome: ${label}`);
