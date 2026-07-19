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
  runMain,
  writeOutput,
} from "../lib/runner.mjs";
import { runWithExtraction } from "../lib/run-with-extraction.mjs";
import { buildReviewContext } from "./context.mjs";
import { isAnchorInDiff, parseDiffAnchors } from "./diff-anchors.mjs";
import { reviewSchema, type ReviewOutput } from "./output.mjs";

const EXTRACTION_PROMPT = [
  "The review is done and any improvement commit is made. Now emit the structured",
  "review output. Change no code and make no further commits — only report.",
  "",
  "Emit a single `<output>` block as the last thing in your response, exactly as the",
  "OUTPUT section of the review prompt described (summary, inlineComments, replies).",
].join("\n");

await runMain(async () => {
  const prNumber = requireEnv("PR_NUMBER");
  const branch = requireEnv("BRANCH");
  const repo = requireEnv("GH_REPO");

  const context = buildReviewContext(repo, prNumber);
  const anchors = parseDiffAnchors(context.diff);

  const result = await runWithExtraction({
    name: "review",
    agent: createAgent(),
    sandbox: createSandboxProvider(),
    maxIterations: 100,
    promptFile: "./.sandcastle/agent-review/prompt.md",
    promptArgs: {
      PR_NUMBER: prNumber,
      BRANCH: branch,
      ISSUE_NUMBER: context.issueNumber,
      ISSUE_TITLE: context.issueTitle,
      DIFF: context.diff,
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
