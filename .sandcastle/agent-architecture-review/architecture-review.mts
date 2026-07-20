// Runner: Architecture Review — spec §4.8.
//
// Scheduled, unattended pass: survey the codebase, pick ONE high-leverage
// architectural-improvement opportunity not already proposed, and emit it as a
// PRD-shaped structured output. The runner is FULLY READ-ONLY — it makes no
// commits and creates nothing; the orchestrator is the sole publisher. Two-pass
// (produce the exploration, then extract the structured PRD) so a bad emit can't
// waste the exploration.
//
// Env: GH_REPO, OUTPUT_DIR. GH_TOKEN is present for the read-only prefetch of
// prior proposals only; the agent holds no token.

import { Output } from "@ai-hero/sandcastle";

import { gh } from "../lib/gh.mjs";
import {
  createAgent,
  createSandboxProvider,
  requireEnv,
  runMain,
  streamingLog,
  writeOutput,
} from "../lib/runner.mjs";
import { runWithExtraction } from "../lib/run-with-extraction.mjs";
import { architectureReviewSchema, type ArchitectureReviewOutput } from "./output.mjs";

const EXTRACTION_PROMPT = [
  "Your exploration is done. Now emit the structured output — change nothing, create nothing.",
  "",
  "Emit a single `<output>` block as the last thing in your response: either a `proposed` PRD",
  "(status, title, body, oneLineSummary, candidatesConsidered) or a `skipped` object (status,",
  "reason), exactly as the OUTPUT section of the prompt described.",
].join("\n");

await runMain(async () => {
  const repo = requireEnv("GH_REPO");

  // Prefetch prior source:architecture-review proposals (open + closed) so the
  // tokenless agent can dedupe without calling `gh`.
  const priorProposals =
    gh([
      "issue",
      "list",
      "-R",
      repo,
      "--label",
      "source:architecture-review",
      "--state",
      "all",
      "--limit",
      "100",
      "--json",
      "number,title,state",
      "--jq",
      "[.[] | {number, title, state}]",
    ]).trim() || "[]";

  const result = await runWithExtraction({
    name: "architecture-review",
    agent: createAgent(),
    sandbox: createSandboxProvider(),
    logging: streamingLog("architecture-review"),
    maxIterations: 120,
    promptFile: "./.sandcastle/agent-architecture-review/prompt.md",
    promptArgs: {
      PRIOR_PROPOSALS_JSON: priorProposals,
    },
    extractionPrompt: EXTRACTION_PROMPT,
    output: Output.object({ tag: "output", schema: architectureReviewSchema }),
  });

  const output: ArchitectureReviewOutput = result.output;

  writeOutput("architecture_review_output.json", JSON.stringify(output, null, 2));

  // The orchestrator publishes only when a PRD was proposed.
  if (output.status === "proposed") {
    writeOutput("prd_title.txt", output.title);
    writeOutput("prd_body.md", output.body);
  }
});
