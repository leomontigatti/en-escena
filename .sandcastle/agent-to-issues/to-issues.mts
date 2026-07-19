// Runner: To Issues (PRD decomposition) — spec §4.1.
//
// Side-effect-free (the output IS the work): single-pass `runWithRetry`. Reads
// the PRD (prefetched into PRD_BODY) plus the repo docs and drafts a flat,
// ordered list of tracer-bullet slices. Writes slices.json; the orchestrator
// creates and attaches each as a native sub-issue. Creates nothing itself.
//
// Env: PRD_NUMBER, PRD_TITLE, PRD_BODY, OUTPUT_DIR.
// PRD_BODY is prefetched by the orchestrator (§3.8): the runner holds no GitHub
// token, so the agent must get the PRD text here — never via `gh`.

import { Output } from "@ai-hero/sandcastle";

import {
  createAgent,
  createSandboxProvider,
  requireEnv,
  runMain,
  streamingLog,
  writeOutput,
} from "../lib/runner.mjs";
import { runWithRetry } from "../run-with-retry.mjs";
import { toIssuesSchema } from "./output.mjs";

const MAX_ITERATIONS = 50;

await runMain(async () => {
  const prdNumber = requireEnv("PRD_NUMBER");
  const prdTitle = requireEnv("PRD_TITLE");
  // Body may legitimately be empty; don't require it.
  const prdBody = process.env.PRD_BODY ?? "";

  const result = await runWithRetry({
    name: "to-issues",
    agent: createAgent(),
    sandbox: createSandboxProvider(),
    logging: streamingLog("to-issues"),
    maxIterations: MAX_ITERATIONS,
    promptFile: "./.sandcastle/agent-to-issues/prompt.md",
    promptArgs: {
      PRD_NUMBER: prdNumber,
      PRD_TITLE: prdTitle,
      PRD_BODY: prdBody,
    },
    output: Output.object({ tag: "output", schema: toIssuesSchema }),
  });

  writeOutput("slices.json", JSON.stringify(result.output, null, 2));
});
