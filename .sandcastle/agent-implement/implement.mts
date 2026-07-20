// Runner: Implement (single issue) — spec §4.2.
//
// Does TDD work and commits to the current branch. Produces no structured
// output; the orchestrator asserts ≥1 commit afterwards. Does NOT push and does
// NOT close the issue — the workflow pushes, the merged PR closes.
//
// Env: ISSUE_NUMBER, ISSUE_TITLE, ISSUE_BODY, BRANCH, OUTPUT_DIR.
// ISSUE_BODY is prefetched by the orchestrator (§3.8): the runner holds no
// GitHub token, so the agent must get the issue text here — never via `gh`.

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
  const issueNumber = requireEnv("ISSUE_NUMBER");
  const issueTitle = requireEnv("ISSUE_TITLE");
  const branch = requireEnv("BRANCH");
  // Body may legitimately be empty; don't require it.
  const issueBody = process.env.ISSUE_BODY ?? "";

  await run({
    name: "implement",
    agent: createAgent(),
    sandbox: createSandboxProvider(),
    logging: streamingLog("implement"),
    maxIterations: MAX_ITERATIONS,
    promptFile: "./.sandcastle/agent-implement/prompt.md",
    promptArgs: {
      ISSUE_NUMBER: issueNumber,
      ISSUE_TITLE: issueTitle,
      ISSUE_BODY: issueBody,
      BRANCH: branch,
    },
  });
});
