// Runner: To Issues (PRD decomposition) — spec §4.1.
//
// The output IS the work: no issues are created here (the orchestrator creates
// and attaches each slice as a native sub-issue from slices.json). But the agent
// must read the PRD (prefetched into PRD_BODY) plus the repo docs to draft the
// slices, which takes several iterations of tool use. sandcastle only allows a
// structured `output` on a single-iteration run (ADR 0010), so we use the
// two-pass produce/extract runner: a multi-iteration produce pass that explores
// and drafts, then a single-iteration extract pass that emits the schema.
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
import { runWithExtraction } from "../lib/run-with-extraction.mjs";
import { toIssuesSchema } from "./output.mjs";

const MAX_ITERATIONS = 50;

const EXTRACTION_PROMPT = [
  "The PRD breakdown is done. Now emit the structured output. Create nothing and",
  "change nothing — only report.",
  "",
  "Emit a single `<output>` block as the last thing in your response, exactly as",
  "the OUTPUT section of the prompt described (the flat, ordered `slices` array).",
].join("\n");

await runMain(async () => {
  const prdNumber = requireEnv("PRD_NUMBER");
  const prdTitle = requireEnv("PRD_TITLE");
  // Body may legitimately be empty; don't require it.
  const prdBody = process.env.PRD_BODY ?? "";

  const result = await runWithExtraction({
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
    extractionPrompt: EXTRACTION_PROMPT,
    output: Output.object({ tag: "output", schema: toIssuesSchema }),
  });

  writeOutput("slices.json", JSON.stringify(result.output, null, 2));
});
