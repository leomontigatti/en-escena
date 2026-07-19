// Shared helpers for the AFK agent runners (spec §3.8 — the agent-runner
// contract). Unlike the retired local Docker runner (where a single agent
// mutated git/GitHub directly), these runners follow the
// orchestrator↔runner split: they run on the GitHub Actions host with
// `noSandbox()`, hold **no GitHub token**, and only ever emit commits on the
// already-checked-out branch plus plain/JSON files under `OUTPUT_DIR`. The
// workflow (orchestrator) does every tracker/VCS mutation.

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import * as sandcastle from "@ai-hero/sandcastle";
import { type LoggingOption } from "@ai-hero/sandcastle";
import { noSandbox } from "@ai-hero/sandcastle/sandboxes/no-sandbox";

export const AGENT_MODEL = "claude-opus-4-8";
export const AGENT_EFFORT = "medium";

/** The LLM agent every runner drives. Centralised so model/effort live in one place. */
export function createAgent() {
  return sandcastle.claudeCode(AGENT_MODEL, { effort: AGENT_EFFORT });
}

/**
 * The sandbox provider for GHA. `noSandbox()` runs the agent directly on the
 * runner host, operating on the worktree the workflow already checked out on
 * the correct branch — no Docker, no container copy. The runner injects only
 * the agent credential; it deliberately does **not** pass any `GH_TOKEN`.
 */
export function createSandboxProvider() {
  return noSandbox();
}

/** The directory the orchestrator reads runner outputs from (GHA `runner.temp`). */
export function outputDir(): string {
  return requireEnv("OUTPUT_DIR");
}

/**
 * Logging for a runner that forwards the agent's stream to **stdout** as it
 * happens, so the GitHub Actions console captures it live.
 *
 * Sandcastle's default is log-to-file mode into an ephemeral dir the
 * orchestrator never sees — in CI that means a silent, undiagnosable run (we
 * lost 30 min to exactly this on the #357 smoke test). We keep file mode (the
 * on-disk log lands under `OUTPUT_DIR` so a workflow step can upload it as an
 * artifact) but attach `onAgentStreamEvent` to echo each text chunk and tool
 * call to stdout. When the agent stalls, the last line tells us *where*.
 */
export function streamingLog(name: string): LoggingOption {
  return {
    type: "file",
    path: join(outputDir(), `${name}.agent.log`),
    onAgentStreamEvent: (event) => {
      const stamp = `[${name} i${event.iteration}]`;
      if (event.type === "text") {
        const text = event.message.trim();
        if (text) console.log(`${stamp} ${text}`);
      } else if (event.type === "toolCall") {
        console.log(`${stamp} ⚙ ${event.name} ${event.formattedArgs}`);
      }
      // "raw" events are intentionally dropped to keep the CI log readable.
    },
  };
}

/** Write a well-known output file the orchestrator consumes in a later step. */
export function writeOutput(name: string, content: string): void {
  const dir = outputDir();
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, name), content, "utf8");
}

/**
 * Record a human-readable failure reason (spec §3.7) before exiting non-zero.
 * The orchestrator turns this into the `agent:blocked` comment.
 */
export function writeFailure(reason: string): void {
  writeOutput("failure_reason.txt", reason.endsWith("\n") ? reason : `${reason}\n`);
}

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Required env var ${name} is missing.`);
  }
  return value;
}

/**
 * Run a runner's `main`, funnelling any throw into `failure_reason.txt` + a
 * non-zero exit so the orchestrator's `failure()` step can mark the item
 * blocked instead of the run dying with no reason file (§3.7).
 */
export async function runMain(main: () => Promise<void>): Promise<void> {
  try {
    await main();
  } catch (error) {
    const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
    console.error(message);
    writeFailure(message);
    process.exitCode = 1;
  }
}
