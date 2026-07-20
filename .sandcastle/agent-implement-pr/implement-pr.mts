// Runner: Implement PR — spec §4.5.
//
// Addresses unresolved reviewer feedback on a PR: reads the conversation,
// changes code where warranted, replies where useful. Unlike Review it does NOT
// re-audit against the spec — it acts on the conversation. Two-pass (produce the
// changes + commit, then extract structured output). Reuses Review's read-only
// PR-context prefetch and diff-anchor validation.
//
// Env: PR_NUMBER, BRANCH, GH_REPO, OUTPUT_DIR.

import { execFileSync } from "node:child_process";

import { Output } from "@ai-hero/sandcastle";

import {
  createAgent,
  createSandboxProvider,
  requireEnv,
  runMain,
  streamingLog,
  writeFailure,
  writeOutput,
} from "../lib/runner.mjs";
import { runWithExtraction } from "../lib/run-with-extraction.mjs";
import { buildReviewContext } from "../agent-review/context.mjs";
import { isAnchorInDiff, parseDiffAnchors } from "../agent-review/diff-anchors.mjs";
import { implementPrSchema, type ImplementPrOutput } from "./output.mjs";

const EXTRACTION_PROMPT = [
  "You have finished addressing the feedback and made any code commit. Now emit the",
  "structured output. Change no code and make no further commits — only report.",
  "",
  "Emit a single `<output>` block as the last thing in your response, exactly as the",
  "OUTPUT section of the prompt described (threadReplies, newInlineComments, topLevelComments).",
].join("\n");

await runMain(async () => {
  const prNumber = requireEnv("PR_NUMBER");
  const branch = requireEnv("BRANCH");
  const repo = requireEnv("GH_REPO");

  // Same read-only context bundle as Review (linked issue, diff, PR_COMMENTS_JSON).
  const context = buildReviewContext(repo, prNumber);
  const anchors = parseDiffAnchors(context.diff);

  const result = await runWithExtraction({
    name: "implement-pr",
    agent: createAgent(),
    sandbox: createSandboxProvider(),
    logging: streamingLog("implement-pr"),
    maxIterations: 100,
    promptFile: "./.sandcastle/agent-implement-pr/prompt.md",
    promptArgs: {
      PR_NUMBER: prNumber,
      BRANCH: branch,
      ISSUE_NUMBER: context.issueNumber,
      ISSUE_TITLE: context.issueTitle,
      DIFF: context.diff,
      PR_COMMENTS_JSON: context.prCommentsJson,
    },
    extractionPrompt: EXTRACTION_PROMPT,
    output: Output.object({ tag: "output", schema: implementPrSchema }),
  });

  const { threadReplies, newInlineComments, topLevelComments }: ImplementPrOutput = result.output;

  const headSha = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  const hasCommits = result.commits.length > 0;

  // Drop replies to commentIds we never showed the agent, and inline comments
  // whose path:line isn't anchorable in the diff (spec §3.8). Inline comments
  // carry commit_id because the orchestrator posts them one-by-one via the REST
  // pulls/{PR}/comments endpoint (unlike Review's single review payload).
  const keptReplies = threadReplies.filter((reply) => context.knownCommentIds.has(reply.commentId));
  const keptInline = newInlineComments
    .filter((comment) => isAnchorInDiff(anchors, comment.path, comment.line))
    .map((comment) => ({
      commit_id: headSha,
      path: comment.path,
      line: comment.line,
      side: comment.side,
      body: comment.body,
    }));
  const keptTopLevel = topLevelComments;

  // Degenerate-run guard (spec §4.5): nothing was committed AND nothing is being
  // said on any surface — the run did nothing, so fail rather than pass silently.
  if (
    !hasCommits &&
    keptReplies.length === 0 &&
    keptInline.length === 0 &&
    keptTopLevel.length === 0
  ) {
    writeFailure(
      "Implement-PR run did nothing: no commit, no thread replies, no inline comments, no top-level comments.",
    );
    process.exitCode = 1;
    return;
  }

  writeOutput("has_commits.txt", hasCommits ? "true" : "false");
  writeOutput("implement_thread_replies.json", JSON.stringify(keptReplies, null, 2));
  writeOutput("implement_new_inline_comments.json", JSON.stringify(keptInline, null, 2));
  writeOutput("implement_top_level_comments.json", JSON.stringify(keptTopLevel, null, 2));
});
