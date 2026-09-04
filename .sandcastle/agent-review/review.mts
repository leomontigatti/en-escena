// Runner: Review — spec §4.4.
//
// Two-pass (produce improvements + commit, then extract structured output).
// Pre-fetches PR context, embeds it in the prompt, then validates the agent's
// output (drops hallucinated anchors/replies) and writes the files the
// orchestrator posts: review_payload.json, replies.json, summary.md, verdict.txt.
//
// Env: PR_NUMBER, BRANCH, GH_REPO, OUTPUT_DIR.

import { execFileSync } from "node:child_process";

import { Output } from "@ai-hero/sandcastle";

import {
  createAgent,
  createSandboxProvider,
  requireEnv,
  revokeGitHubToken,
  runMain,
  streamingLog,
  writeOutput,
} from "../lib/runner.mjs";
import { runWithExtraction } from "../lib/run-with-extraction.mjs";
import { buildReviewContext, type ReviewContext } from "./context.mjs";
import { isAnchorInDiff, parseDiffAnchors } from "./diff-anchors.mjs";
import { reviewSchema, type ReviewOutput } from "./output.mjs";

const EXTRACTION_PROMPT = [
  "The review is done and any improvement commit is made. Now emit the structured",
  "review output. Change no code and make no further commits — only report.",
  "",
  "Emit a single `<output>` block as the last thing in your response, exactly as the",
  "OUTPUT section of the review prompt described (summary, inlineComments, replies).",
].join("\n");

/**
 * The Spec axis checks the diff against the issue *body*, so a PR that links no
 * issue has nothing for half the review to run against. `agent-review.yml`
 * refuses that in its preflight, before the label transition and the installs
 * (#790); this is the belt-and-braces for a run started any other way.
 *
 * `issueBody` is null exactly when `issueNumber` is, so the second test is
 * redundant at runtime — it is there to narrow the prompt argument to a string.
 */
function requireLinkedIssue(context: ReviewContext): {
  number: string;
  body: string;
} {
  if (context.issueNumber === null || context.issueBody === null) {
    throw new Error(
      "The PR body links no issue (closes/fixes/resolves #N), so the Spec axis has nothing to check against.",
    );
  }
  return { number: context.issueNumber, body: context.issueBody };
}

await runMain(async ({ signal }) => {
  const prNumber = requireEnv("PR_NUMBER");
  const branch = requireEnv("BRANCH");
  const repo = requireEnv("GH_REPO");

  const context = buildReviewContext(repo, prNumber);
  const linkedIssue = requireLinkedIssue(context);

  const anchors = parseDiffAnchors(context.diff);

  // Prefetch done: drop the token before the agent starts. `noSandbox()` spreads
  // `process.env` into the agent, so leaving it set would hand the agent a
  // working, write-capable credential and make §3.9's "the agent never mutates
  // the tracker" an instruction rather than an invariant. Nothing below needs it
  // — the runner only writes files, and the orchestrator posts them.
  revokeGitHubToken();

  const result = await runWithExtraction({
    name: "review",
    agent: createAgent(),
    sandbox: createSandboxProvider(),
    logging: streamingLog("review"),
    signal,
    maxIterations: 100,
    promptFile: "./.sandcastle/agent-review/prompt.md",
    promptArgs: {
      PR_NUMBER: prNumber,
      BRANCH: branch,
      ISSUE_NUMBER: linkedIssue.number,
      ISSUE_TITLE: context.issueTitle,
      ISSUE_BODY: linkedIssue.body,
      SUB_ISSUES: context.subIssues || "(none — this issue has no sub-issues)",
      DIFF_STAT: context.diffStat,
      PR_COMMENTS_JSON: context.prCommentsJson,
    },
    extractionPrompt: EXTRACTION_PROMPT,
    output: Output.object({ tag: "output", schema: reviewSchema }),
  });

  const { summary, inlineComments, replies }: ReviewOutput = result.output;

  // Drop hallucinated anchors (path:line not in the diff) and replies to
  // commentIds we never showed the agent (spec §3.8).
  const comments = inlineComments
    .filter((comment) => isAnchorInDiff(anchors, comment.path, comment.line))
    .map((comment) => ({
      path: comment.path,
      line: comment.line,
      side: comment.side,
      body: comment.body,
    }));

  const keptReplies = replies.filter((reply) => context.knownCommentIds.has(reply.commentId));

  const headSha = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  const improved = result.commits.length > 0;

  const reviewPayload = {
    commit_id: headSha,
    event: "COMMENT" as const, // never APPROVE — a human approves (§3.9)
    body: summary,
    comments,
  };

  writeOutput("review_payload.json", JSON.stringify(reviewPayload, null, 2));
  writeOutput("replies.json", JSON.stringify(keptReplies, null, 2));
  writeOutput("summary.md", summary);
  writeOutput("verdict.txt", improved ? "improved" : "clean");
});
