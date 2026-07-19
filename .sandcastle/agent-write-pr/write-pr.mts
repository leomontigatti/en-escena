// Runner: Write PR (single issue) — spec §4.2.
//
// Side-effect-free (the output IS the work): single-pass `runWithRetry`. Reads
// the commits already on the branch and drafts a PR title + description. Writes
// pr_title.txt / pr_description.txt for the orchestrator to open the draft PR.
//
// Env: ISSUE_NUMBER, ISSUE_TITLE, BRANCH, OUTPUT_DIR.

import { Output } from "@ai-hero/sandcastle";

import {
  createAgent,
  createSandboxProvider,
  requireEnv,
  runMain,
  writeOutput,
} from "../lib/runner.mjs";
import { runWithRetry } from "../run-with-retry.mjs";
import { writePrSchema } from "./output.mjs";

await runMain(async () => {
  const issueNumber = requireEnv("ISSUE_NUMBER");
  const issueTitle = requireEnv("ISSUE_TITLE");
  const branch = requireEnv("BRANCH");

  const result = await runWithRetry({
    name: "write-pr",
    agent: createAgent(),
    sandbox: createSandboxProvider(),
    maxIterations: 1,
    promptFile: "./.sandcastle/agent-write-pr/prompt.md",
    promptArgs: {
      ISSUE_NUMBER: issueNumber,
      ISSUE_TITLE: issueTitle,
      BRANCH: branch,
    },
    output: Output.object({ tag: "output", schema: writePrSchema(issueNumber) }),
  });

  writeOutput("pr_title.txt", result.output.prTitle);
  writeOutput("pr_description.txt", result.output.prDescription);
});
