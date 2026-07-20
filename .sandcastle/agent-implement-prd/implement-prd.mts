// Runner: Implement PRD (one sub-issue) — spec §4.3.
//
// Implements ONLY the named sub-issue and commits to the shared PRD branch,
// which may already carry earlier sub-issues' commits. Produces no structured
// output; unlike single-issue implement there is **no commit assertion** — a
// sub-issue may already be satisfied, so zero new commits is legitimate. Does
// NOT rebase/rewrite history, does NOT push, does NOT close anything — the
// workflow pushes, closes the sub-issue, and (on the last one) the merged PR
// closes the PRD.
//
// Env: PRD_NUMBER, PRD_TITLE, PRD_BODY, SUB_ISSUE_NUMBER, SUB_ISSUE_TITLE,
// SUB_ISSUE_BODY, SIBLINGS, BRANCH, OUTPUT_DIR.
// Bodies + siblings are prefetched by the orchestrator (§3.8): the runner holds
// no GitHub token, so the agent must get the issue text here — never via `gh`.

import { run } from "@ai-hero/sandcastle";

import {
  createAgent,
  createSandboxProvider,
  requireEnv,
  runMain,
  streamingLog,
} from "../lib/runner.mjs";

const MAX_ITERATIONS = 100;

await runMain(async () => {
  const prdNumber = requireEnv("PRD_NUMBER");
  const prdTitle = requireEnv("PRD_TITLE");
  const subNumber = requireEnv("SUB_ISSUE_NUMBER");
  const subTitle = requireEnv("SUB_ISSUE_TITLE");
  const branch = requireEnv("BRANCH");
  // Bodies may legitimately be empty; don't require them.
  const prdBody = process.env.PRD_BODY ?? "";
  const subBody = process.env.SUB_ISSUE_BODY ?? "";
  const siblings = process.env.SIBLINGS ?? "";

  await run({
    name: "implement-prd",
    agent: createAgent(),
    sandbox: createSandboxProvider(),
    logging: streamingLog("implement-prd"),
    maxIterations: MAX_ITERATIONS,
    promptFile: "./.sandcastle/agent-implement-prd/prompt.md",
    promptArgs: {
      PRD_NUMBER: prdNumber,
      PRD_TITLE: prdTitle,
      SUB_ISSUE_NUMBER: subNumber,
      SUB_ISSUE_TITLE: subTitle,
      BRANCH: branch,
      PRD_BODY: prdBody,
      SUB_ISSUE_BODY: subBody,
      SIBLINGS: siblings,
    },
  });
});
