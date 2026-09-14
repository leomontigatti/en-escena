// Shared helpers for the AFK agent runners (spec §3.8 — the agent-runner
// contract). Unlike the retired local Docker runner (where a single agent
// mutated git/GitHub directly), these runners follow the
// orchestrator↔runner split: they run on the GitHub Actions host with
// `noSandbox()`, hold **no GitHub token**, and only ever emit commits on the
// already-checked-out branch plus plain/JSON files under `OUTPUT_DIR`. The
// workflow (orchestrator) does every tracker/VCS mutation.

import { execFileSync } from "node:child_process";
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
 * the correct branch — no Docker, no container copy. It injects only the agent
 * credential — but note it also spreads `process.env` into the agent, so a
 * runner that prefetches with a token must call {@link revokeGitHubToken}
 * first; passing no `GH_TOKEN` here is not by itself enough.
 */
export function createSandboxProvider() {
  return noSandbox();
}

/**
 * Drop every GitHub credential from this process's environment.
 *
 * §3.9's hard invariant is that the agent never mutates the tracker or the
 * remote, and the runners honour it by holding no token — `agent-implement` and
 * `agent-implement-prd` simply omit `GH_TOKEN` from the workflow step. A runner
 * that prefetches context (review, implement-pr, update-branch) cannot: it needs
 * the token for its own read-only `gh` calls, and `noSandbox()` hands the agent
 * `{ ...process.env }`, so a step-level `GH_TOKEN` reaches the agent and its
 * `gh` calls *succeed* — silently, with the job's write permissions.
 *
 * Call this once the prefetch is done and before `createAgent()`, so the
 * invariant is enforced by the environment rather than by the prompt asking the
 * model nicely.
 */
export function revokeGitHubToken(): void {
  delete process.env.GH_TOKEN;
  delete process.env.GITHUB_TOKEN;
  delete process.env.GH_ENTERPRISE_TOKEN;
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
 *
 * Passing the {@link RunnerContext.completion} watch opts the runner in to a
 * completion that lands after the budget counting as success (see `runMain`).
 */
export function streamingLog(name: string, completion?: CompletionWatch): LoggingOption {
  return {
    type: "file",
    path: join(outputDir(), `${name}.agent.log`),
    onAgentStreamEvent: (event) => {
      const stamp = `[${name} i${event.iteration}]`;
      if (event.type === "text") {
        completion?.observe(event.message);
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
 * lost with no diagnosis (PR #512). Sandcastle's `run({ signal })` rejects with
 * `signal.reason`, which turns the timeout back into an ordinary throw the
 * existing failure plumbing already handles. It rejects only once the agent
 * exits, though: the abort cannot stop a `noSandbox()` agent (see
 * {@link CompletionWatch}).
 *
 * Unset/invalid means no budget — the runner behaves exactly as before.
 *
 * `runMain` is the only caller; it is named and exported because "the runner's
 * wall-clock budget" is a concept worth addressing on its own, both to read and
 * to assert against.
 */
export function createBudget(): { signal: AbortSignal; dispose: () => void } | undefined {
  const minutes = readBudgetMinutes();

  if (minutes === undefined) {
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
 * `AGENT_BUDGET_MINUTES` as a usable number of minutes, or `undefined` for no
 * budget. Shared by {@link createBudget} and by the prompts that tell the agent
 * how long it has, so the two cannot disagree.
 */
function readBudgetMinutes(): number | undefined {
  const raw = process.env.AGENT_BUDGET_MINUTES;
  const minutes = Number(raw);

  if (!raw || !Number.isFinite(minutes) || minutes <= 0) {
    return undefined;
  }

  return minutes;
}

/** The wall-clock budget as prompt prose: `50 minutes`, or `no fixed limit`. */
export function describeBudget(): string {
  const minutes = readBudgetMinutes();
  return minutes === undefined ? "no fixed limit" : `${minutes} minutes`;
}

/** The line every runner prompt ends on; also sandcastle's default completion signal. */
export const COMPLETION_SIGNAL = "<promise>COMPLETE</promise>";

/**
 * Remembers whether the agent's text stream ever carried the completion signal.
 *
 * Why this exists: the budget's abort cannot stop an agent under `noSandbox()`.
 * Its `exec` is a bare child process with no cancel path, so sandcastle's race
 * only settles once the agent exits on its own — an agent close to done keeps
 * working past the deadline, commits and emits the signal, and `run()` still
 * rejects with the abort reason. Run 34715632348 lost a finished, committed
 * sub-issue (#917) that way. `runMain` reads this watch to tell that case apart
 * from a run that genuinely did not finish.
 *
 * Text arrives in arbitrary chunks, so the signal can straddle two of them; the
 * watch keeps just enough of the previous chunk to catch it.
 */
export interface CompletionWatch {
  observe: (text: string) => void;
  readonly seen: boolean;
}

export function createCompletionWatch(): CompletionWatch {
  let seen = false;
  let tail = "";

  return {
    observe(text) {
      if (seen) {
        return;
      }
      const window = tail + text;
      seen = window.includes(COMPLETION_SIGNAL);
      tail = window.slice(-(COMPLETION_SIGNAL.length - 1));
    },
    get seen() {
      return seen;
    },
  };
}

/** Whether the checked-out worktree has nothing uncommitted, untracked files included. */
function isWorkingTreeClean(): boolean {
  try {
    return execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" }).trim() === "";
  } catch {
    return false;
  }
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
   * Wire this into `run()` / `runWithExtraction()` so the wall-clock budget turns
   * into a rejection with a reason. It does not stop a `noSandbox()` agent — see
   * {@link CompletionWatch}. `undefined` when no budget is configured.
   */
  readonly signal: AbortSignal | undefined;
  /**
   * Hand this to {@link streamingLog} to let a completion that lands after the
   * budget count as success. Only a runner whose whole result is its commits may
   * opt in: one that needs structured output gets nothing back from a rejected
   * `run()`, so a late completion there is still a failure.
   */
  readonly completion: CompletionWatch;
}

/** Seams for tests; production uses the defaults. */
export interface RunMainOptions {
  readonly isWorkingTreeClean?: () => boolean;
}

/**
 * Run a runner's `main`, funnelling any throw into `failure_reason.txt` + a
 * non-zero exit so the orchestrator's `failure()` step can mark the item
 * blocked instead of the run dying with no reason file (§3.7).
 */
export async function runMain(
  main: (context: RunnerContext) => Promise<void>,
  options: RunMainOptions = {},
): Promise<void> {
  const budget = createBudget();
  const completion = createCompletionWatch();
  const removeSignalHandlers = installSignalHandlers();

  try {
    await main({ signal: budget?.signal, completion });
  } catch (error) {
    // The agent finished after the deadline: the work is committed and nothing
    // is left in the tree, so failing here would only throw it away. A dirty
    // tree means the signal was premature, and that stays a failure.
    if (
      error instanceof BudgetExhaustedError &&
      completion.seen &&
      (options.isWorkingTreeClean ?? isWorkingTreeClean)()
    ) {
      console.warn(
        `Wall-clock budget of ${error.budgetMinutes} min exhausted after the agent had already ` +
          `emitted the completion signal with a clean working tree — the run counts as finished.`,
      );
      return;
    }

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
