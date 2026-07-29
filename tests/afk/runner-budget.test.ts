import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Regression coverage for the timeout that burned the `agent:review` run on
// #512. A step `timeout-minutes` expiry kills the process tree, so `runMain`'s
// catch never ran and no `failure_reason.txt` was written — the orchestrator
// commented "(no reason file written)" and the whole review was lost. The
// runner now holds an internal deadline below the step's, aborts the agent, and
// fails with a real reason.
import {
  BudgetExhaustedError,
  createBudget,
  runMain,
} from "../../.sandcastle/lib/runner.mjs";

let outputDir: string;

beforeEach(() => {
  outputDir = mkdtempSync(join(tmpdir(), "afk-runner-budget-"));
  vi.stubEnv("OUTPUT_DIR", outputDir);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
  rmSync(outputDir, { force: true, recursive: true });
});

function failureReason(): string {
  return readFileSync(join(outputDir, "failure_reason.txt"), "utf8");
}

describe("createBudget", () => {
  it("returns no budget when AGENT_BUDGET_MINUTES is unset, so runners keep their old behaviour", () => {
    vi.stubEnv("AGENT_BUDGET_MINUTES", "");

    expect(createBudget()).toBeUndefined();
  });

  it.each(["not-a-number", "0", "-5"])(
    "returns no budget for the unusable value %j rather than aborting immediately",
    (value) => {
      vi.stubEnv("AGENT_BUDGET_MINUTES", value);

      expect(createBudget()).toBeUndefined();
    },
  );

  it("aborts with BudgetExhaustedError once the budget elapses", () => {
    vi.useFakeTimers();
    vi.stubEnv("AGENT_BUDGET_MINUTES", "25");

    const budget = createBudget();

    expect(budget).toBeDefined();
    expect(budget?.signal.aborted).toBe(false);

    // One tick short of the deadline the agent must still be running: the whole
    // point is to give it the full budget, not to cut it off early.
    vi.advanceTimersByTime(25 * 60_000 - 1);
    expect(budget?.signal.aborted).toBe(false);

    vi.advanceTimersByTime(1);
    expect(budget?.signal.aborted).toBe(true);
    expect(budget?.signal.reason).toBeInstanceOf(BudgetExhaustedError);
    expect((budget?.signal.reason as BudgetExhaustedError).budgetMinutes).toBe(
      25,
    );
  });

  it("stops the timer on dispose so a finished run can't be aborted afterwards", () => {
    vi.useFakeTimers();
    vi.stubEnv("AGENT_BUDGET_MINUTES", "25");

    const budget = createBudget();
    budget?.dispose();
    vi.advanceTimersByTime(60 * 60_000);

    expect(budget?.signal.aborted).toBe(false);
  });
});

describe("runMain", () => {
  it("hands the budget signal to the runner so sandcastle can abort the agent mid-iteration", async () => {
    vi.stubEnv("AGENT_BUDGET_MINUTES", "25");
    let received: AbortSignal | undefined;

    await runMain(async ({ signal }) => {
      received = signal;
    });

    expect(received).toBeInstanceOf(AbortSignal);
    expect(process.exitCode).not.toBe(1);
  });

  it("passes no signal when no budget is configured", async () => {
    vi.stubEnv("AGENT_BUDGET_MINUTES", "");
    let received: AbortSignal | undefined = new AbortController().signal;

    await runMain(async ({ signal }) => {
      received = signal;
    });

    expect(received).toBeUndefined();
  });

  it("removes its SIGTERM/SIGINT handlers when the run ends, so they can't fire on an unrelated shutdown", async () => {
    vi.stubEnv("AGENT_BUDGET_MINUTES", "25");
    const before = {
      SIGTERM: process.listenerCount("SIGTERM"),
      SIGINT: process.listenerCount("SIGINT"),
    };

    await runMain(async () => {});

    expect(process.listenerCount("SIGTERM")).toBe(before.SIGTERM);
    expect(process.listenerCount("SIGINT")).toBe(before.SIGINT);
  });

  it("turns a budget abort into a readable failure reason instead of a silent kill", async () => {
    vi.stubEnv("AGENT_BUDGET_MINUTES", "25");
    vi.spyOn(console, "error").mockImplementation(() => {});

    await runMain(async () => {
      throw new BudgetExhaustedError(25);
    });

    expect(failureReason()).toContain("Wall-clock budget of 25 min exhausted");
    // The stack would only point at sandcastle internals — the message is the
    // whole diagnosis for this failure mode. Match real stack frames
    // (`\n    at …`), not a bare "at " that ordinary prose contains too.
    expect(failureReason()).not.toMatch(/\n\s+at /);
    expect(process.exitCode).toBe(1);

    process.exitCode = 0;
  });

  it("still records the stack for ordinary failures", async () => {
    vi.stubEnv("AGENT_BUDGET_MINUTES", "");
    vi.spyOn(console, "error").mockImplementation(() => {});

    await runMain(async () => {
      throw new Error("prefetch blew up");
    });

    expect(failureReason()).toContain("prefetch blew up");
    expect(failureReason()).toMatch(/\n\s+at /);
    expect(process.exitCode).toBe(1);

    process.exitCode = 0;
  });
});
