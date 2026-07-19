// Shared helpers for the AFK agent runners (spec §3.8 — the agent-runner
// contract). Unlike `.sandcastle/main.mts` (the legacy local Docker runner
// where the agent mutates git/GitHub), these runners follow the
// orchestrator↔runner split: they run on the GitHub Actions host with
// `noSandbox()`, hold **no GitHub token**, and only ever emit commits on the
// already-checked-out branch plus plain/JSON files under `OUTPUT_DIR`. The
// workflow (orchestrator) does every tracker/VCS mutation.

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import * as sandcastle from "@ai-hero/sandcastle";
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
