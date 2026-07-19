// Runner: Implement (single issue) — spec §4.2.
//
// Does TDD work and commits to the current branch. Produces no structured
// output; the orchestrator asserts ≥1 commit afterwards. Does NOT push and does
// NOT close the issue — the workflow pushes, the merged PR closes.
//
// Env: ISSUE_NUMBER, ISSUE_TITLE, BRANCH, OUTPUT_DIR.

import { run } from "@ai-hero/sandcastle";

import {
  createAgent,
  createSandboxProvider,
  requireEnv,
  runMain,
} from "../lib/runner.mjs";

const MAX_ITERATIONS = 100;

await runMain(async () => {
  const issueNumber = requireEnv("ISSUE_NUMBER");
  const issueTitle = requireEnv("ISSUE_TITLE");
  const branch = requireEnv("BRANCH");

  await run({
    name: "implement",
    agent: createAgent(),
    sandbox: createSandboxProvider(),
    maxIterations: MAX_ITERATIONS,
    promptFile: "./.sandcastle/agent-implement/prompt.md",
    promptArgs: {
      ISSUE_NUMBER: issueNumber,
      ISSUE_TITLE: issueTitle,
      BRANCH: branch,
    },
  });
});
