// Runner plumbing (the runner contract in docs/agents/afk-setup.md): the output files the
// orchestrator reads, the wall-clock budget, and `runMain`, which turns any
// throw into `failure_reason.txt` and a non-zero exit.

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

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
 * Record a human-readable failure reason before exiting non-zero.
 * The orchestrator writes it to the run summary.
 */
function writeFailure(reason: string): void {
  writeOutput(
    "failure_reason.txt",
    reason.endsWith("\n") ? reason : `${reason}\n`,
  );
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
      `Wall-clock budget of ${budgetMinutes} min exhausted. The agent was killed so the run ` +
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
 * orchestrator then reports "(no reason file written)" and the whole pass is
 * lost with no diagnosis (PR #512). Aborting the signal kills the agent
 * (`runAgent`), whose turn then rejects with `signal.reason`, an ordinary throw
 * the failure plumbing already handles.
 *
 * Unset/invalid means no budget.
 *
 * `runMain` is the only caller; it is exported to be asserted against.
 */
export function createBudget():
  { signal: AbortSignal; dispose: () => void } | undefined {
  const raw = process.env.AGENT_BUDGET_MINUTES;
  const minutes = Number(raw);

  if (!raw || !Number.isFinite(minutes) || minutes <= 0) {
    return undefined;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => {
    console.error(`Budget of ${minutes} min exhausted — killing the agent.`);
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
 * `cancel` kills the agent before the runner exits: it leads its own process
 * group, so it would otherwise outlive the runner and keep working while the
 * workflow's later steps run.
 *
 * Returns a disposer: the handlers are only wanted while `main` is in flight, so
 * they must not outlive the run and leak onto the process (which would also make
 * them fire during an unrelated shutdown).
 */
function installSignalHandlers(cancel: AbortController): () => void {
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
      cancel.abort(new Error(`Runner received ${name}.`));
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
   * Hand this to every agent turn: it aborts, killing the agent, when the
   * wall-clock budget runs out or the runner is told to stop.
   */
  readonly signal: AbortSignal;
}

/**
 * Run a runner's `main`, funnelling any throw into `failure_reason.txt` + a
 * non-zero exit so the orchestrator's `failure()` step reports a reason instead
 * of the run dying without one.
 */
export async function runMain(
  main: (context: RunnerContext) => Promise<void>,
): Promise<void> {
  const budget = createBudget();
  const cancel = new AbortController();
  const signal = budget
    ? AbortSignal.any([budget.signal, cancel.signal])
    : cancel.signal;
  const removeSignalHandlers = installSignalHandlers(cancel);

  try {
    await main({ signal });
  } catch (error) {
    // A budget abort is expected and self-explanatory — report it without the
    // stack, which would only point at the abort plumbing.
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
