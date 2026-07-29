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

export const AGENT_MODEL = "claude-opus-5";
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

/** Thrown (as the abort reason) when the runner's wall-clock budget runs out. */
export class BudgetExhaustedError extends Error {
  constructor(readonly budgetMinutes: number) {
    super(
      `Wall-clock budget of ${budgetMinutes} min exhausted. The agent was aborted so the run ` +
        `could fail with a reason instead of being killed by the step timeout. See the uploaded ` +
        `agent log artifact for what it was doing.`,
    );
    this.name = "BudgetExhaustedError";
  }
}

/**
 * A deadline below the workflow step's `timeout-minutes`, read from
 * `AGENT_BUDGET_MINUTES`.
 *
 * Why this exists: a step timeout kills the process tree outright, so
 * `runMain`'s catch never runs and no `failure_reason.txt` is written — the
 * orchestrator then comments "(no reason file written)" and the whole pass is
 * lost with no diagnosis (PR #512). Sandcastle's `run({ signal })` aborts
 * mid-iteration and rejects with `signal.reason`, which turns the timeout back
 * into an ordinary throw the existing failure plumbing already handles.
 *
 * Unset/invalid means no budget — the runner behaves exactly as before.
 *
 * `runMain` is the only caller; it is named and exported because "the runner's
 * wall-clock budget" is a concept worth addressing on its own, both to read and
 * to assert against.
 */
export function createBudget(): { signal: AbortSignal; dispose: () => void } | undefined {
  const raw = process.env.AGENT_BUDGET_MINUTES;
  const minutes = Number(raw);

  if (!raw || !Number.isFinite(minutes) || minutes <= 0) {
    return undefined;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => {
    console.error(`Budget of ${minutes} min exhausted — aborting the agent.`);
    controller.abort(new BudgetExhaustedError(minutes));
  }, minutes * 60_000);

  // Don't let the pending timer keep the process alive once the work is done.
  timer.unref();

  return { signal: controller.signal, dispose: () => clearTimeout(timer) };
}

/**
 * Last-resort reason writer for the signals a step timeout or a cancelled run
 * sends. `createBudget` should normally win the race and produce a better
 * message; this only fires when the budget is unset or set too close to the
 * step's own timeout. `writeFileSync` is safe in a signal handler.
 *
 * Returns a disposer: the handlers are only wanted while `main` is in flight, so
 * they must not outlive the run and leak onto the process (which would also make
 * them fire during an unrelated shutdown).
 */
function installSignalHandlers(): () => void {
  const names = ["SIGTERM", "SIGINT"] as const;
  const handlers = names.map((name) => {
    const handler = () => {
      // A throw here (e.g. OUTPUT_DIR unset) would replace the signal we're
      // trying to explain with a confusing one, so never let it escape.
      try {
        writeFailure(
          `Runner received ${name} — the workflow step hit its timeout or the run was cancelled ` +
            `before the agent finished. See the uploaded agent log artifact.`,
        );
      } catch {
        // Nothing useful left to do; the console log is the remaining record.
      }
      process.exit(1);
    };
    process.on(name, handler);
    return { name, handler } as const;
  });

  return () => {
    for (const { name, handler } of handlers) {
      process.off(name, handler);
    }
  };
}

/** What `runMain` hands a runner. */
export interface RunnerContext {
  /**
   * Wire this into `run()` / `runWithExtraction()` so the wall-clock budget can
   * actually interrupt the agent. `undefined` when no budget is configured.
   */
  readonly signal: AbortSignal | undefined;
}

/**
 * Run a runner's `main`, funnelling any throw into `failure_reason.txt` + a
 * non-zero exit so the orchestrator's `failure()` step can mark the item
 * blocked instead of the run dying with no reason file (§3.7).
 */
export async function runMain(main: (context: RunnerContext) => Promise<void>): Promise<void> {
  const budget = createBudget();
  const removeSignalHandlers = installSignalHandlers();

  try {
    await main({ signal: budget?.signal });
  } catch (error) {
    // A budget abort is expected and self-explanatory — report it without the
    // stack, which would only point at sandcastle internals.
    const message =
      error instanceof BudgetExhaustedError
        ? error.message
        : error instanceof Error
          ? (error.stack ?? error.message)
          : String(error);
    console.error(message);
    writeFailure(message);
    process.exitCode = 1;
  } finally {
    budget?.dispose();
    removeSignalHandlers();
  }
}
