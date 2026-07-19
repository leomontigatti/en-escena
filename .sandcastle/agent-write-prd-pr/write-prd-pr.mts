// Runner: Write PR (whole PRD) — spec §4.3.
//
// Side-effect-free (the output IS the work): single-pass `runWithRetry`. Runs
// once per PRD — only when no PR yet exists for the branch — and drafts a title
// + description framed around the WHOLE PRD (the PR is reused across every
// sub-issue run), ending in `Closes #<PRD>`. Reuses write-pr's schema keyed to
// the PRD number. Writes pr_title.txt / pr_description.txt for the orchestrator.
//
// Env: PRD_NUMBER, PRD_TITLE, PRD_BODY, SUB_ISSUES, BRANCH, OUTPUT_DIR.
// PRD_BODY + SUB_ISSUES are prefetched by the orchestrator (§3.8): the runner
// holds no GitHub token, so the agent gets the tracker text here — never `gh`.

import { Output } from "@ai-hero/sandcastle";

import { writePrSchema } from "../agent-write-pr/output.mjs";
import {
  createAgent,
  createSandboxProvider,
  requireEnv,
  runMain,
  streamingLog,
  writeOutput,
} from "../lib/runner.mjs";
import { runWithRetry } from "../run-with-retry.mjs";

await runMain(async () => {
  const prdNumber = requireEnv("PRD_NUMBER");
  const prdTitle = requireEnv("PRD_TITLE");
  const branch = requireEnv("BRANCH");
  const prdBody = process.env.PRD_BODY ?? "";
  const subIssues = process.env.SUB_ISSUES ?? "";

  const result = await runWithRetry({
    name: "write-prd-pr",
    agent: createAgent(),
    sandbox: createSandboxProvider(),
    logging: streamingLog("write-prd-pr"),
    maxIterations: 1,
    promptFile: "./.sandcastle/agent-write-prd-pr/prompt.md",
    promptArgs: {
      PRD_NUMBER: prdNumber,
      PRD_TITLE: prdTitle,
      BRANCH: branch,
      PRD_BODY: prdBody,
      SUB_ISSUES: subIssues,
    },
    output: Output.object({ tag: "output", schema: writePrSchema(prdNumber) }),
  });

  writeOutput("pr_title.txt", result.output.prTitle);
  writeOutput("pr_description.txt", result.output.prDescription);
});
