// Runner: Architecture Review (contract in docs/agents/afk-setup.md). Invoked weekly by
// `.github/workflows/architecture-review.yml`, the one AFK workflow left after
// ADR-0016.
//
// Scheduled, unattended pass: survey the codebase, pick ONE high-leverage
// architectural-improvement opportunity not already proposed, and emit it as a
// PRD-shaped structured output. The runner is FULLY READ-ONLY — it makes no
// commits and creates nothing; the workflow (orchestrator) is the sole
// publisher. Two-pass (produce the exploration, then extract the
// structured PRD) so a bad emit can't waste the exploration.
//
// Env: GH_REPO, OUTPUT_DIR, AGENT_BUDGET_MINUTES. GH_TOKEN serves the
// read-only prefetch of prior proposals only: the agent's environment is an
// allow-list without it (`agentEnvironment`), so the agent holds no token.

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { runAgent } from "./agent.mjs";
import { gh } from "./gh.mjs";
import { architectureReviewSchema } from "./output.mjs";
import { runWithExtraction } from "./run-with-extraction.mjs";
import { outputDir, requireEnv, runMain, writeOutput } from "./runner.mjs";

const EXTRACTION_PROMPT = [
  "Your exploration is done. Now emit the structured output — change nothing, create nothing.",
  "",
  "Emit a single `<output>` block as the last thing in your response: either a `proposed` PRD",
  "(status, title, body, oneLineSummary, candidatesConsidered) or a `skipped` object (status,",
  "reason), exactly as the OUTPUT section of the prompt described.",
].join("\n");

await runMain(async ({ signal }) => {
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

  const prompt = readFileSync(
    new URL("./prompt.md", import.meta.url),
    "utf8",
  ).replaceAll("{{PRIOR_PROPOSALS_JSON}}", priorProposals);
  const logPath = join(outputDir(), "architecture-review.agent.log");

  const output = await runWithExtraction({
    prompt,
    extractionPrompt: EXTRACTION_PROMPT,
    tag: "output",
    schema: architectureReviewSchema,
    runTurn: (turnPrompt, resumeSession) =>
      runAgent({
        prompt: turnPrompt,
        resumeSession,
        label: "architecture-review",
        logPath,
        signal,
      }),
  });

  writeOutput(
    "architecture_review_output.json",
    JSON.stringify(output, null, 2),
  );

  // The orchestrator publishes only when a PRD was proposed.
  if (output.status === "proposed") {
    writeOutput("prd_title.txt", output.title);
    writeOutput("prd_body.md", output.body);
  }
});
