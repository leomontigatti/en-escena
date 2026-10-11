import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Regression coverage for the timeout that burned the `agent:review` run on
// #512. A step `timeout-minutes` expiry kills the process tree, so `runMain`'s
// catch never ran and no `failure_reason.txt` was written — the orchestrator
// commented "(no reason file written)" and the whole review was lost. The
// runner now holds an internal deadline below the step's, kills the agent, and
// fails with a real reason.
import { runAgent } from "../../.github/architecture-review/agent.mjs";
import {
  BudgetExhaustedError,
  createBudget,
  runMain,
} from "../../.github/architecture-review/runner.mjs";

import { writeAgentStub } from "./agent-stub.test-support";

let outputDir: string;

beforeEach(() => {
  outputDir = mkdtempSync(join(tmpdir(), "afk-runner-budget-"));
  vi.stubEnv("OUTPUT_DIR", outputDir);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
  vi.restoreAllMocks();
  rmSync(outputDir, { force: true, recursive: true });
});

function failureReason(): string {
  return readFileSync(join(outputDir, "failure_reason.txt"), "utf8");
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

describe("createBudget", () => {
  it("returns no budget when AGENT_BUDGET_MINUTES is unset", () => {
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
  it("hands the budget signal to the runner", async () => {
    vi.stubEnv("AGENT_BUDGET_MINUTES", "25");
    let received: AbortSignal | undefined;

    await runMain(async ({ signal }) => {
      received = signal;
    });

    expect(received).toBeInstanceOf(AbortSignal);
    expect(process.exitCode).not.toBe(1);
  });

  it("passes a signal that never aborts on its own when no budget is configured", async () => {
    vi.stubEnv("AGENT_BUDGET_MINUTES", "");
    let received: AbortSignal | undefined;

    await runMain(async ({ signal }) => {
      received = signal;
    });

    expect(received?.aborted).toBe(false);
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

/**
 * A stub agent that never finishes, started under `runMain` with the runner's
 * signal. It prints its own pid and its child's, as an agent running a shell
 * tool would have, so a test can check both die.
 */
function startHangingAgent() {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
  const command = writeAgentStub(
    outputDir,
    "hanging-agent",
    `const { spawn } = require("node:child_process");
const tool = spawn("sleep", ["600"], { stdio: "ignore" });
console.log(JSON.stringify({ type: "assistant", message: { content: [{ type: "text", text: JSON.stringify([process.pid, tool.pid]) }] } }));
setInterval(() => {}, 1000);`,
  );
  const logPath = join(outputDir, "architecture-review.agent.log");
  const pids: number[] = [];

  const run = runMain(async ({ signal }) => {
    const waitForPids = setInterval(() => {
      const match = /\[(\d+),(\d+)\]/.exec(readFileSync(logPath, "utf8"));
      if (match && pids.length === 0)
        pids.push(Number(match[1]), Number(match[2]));
    }, 20);
    try {
      await runAgent({ prompt: "", label: "test", logPath, signal, command });
    } finally {
      clearInterval(waitForPids);
    }
  });

  return { run, pids };
}

async function expectAllDead(pids: readonly number[]): Promise<void> {
  expect(pids).toHaveLength(2);
  await vi.waitFor(() => {
    for (const pid of pids) expect(isAlive(pid), `pid ${pid}`).toBe(false);
  });
}

describe("a budget overrun", () => {
  it("kills the agent and the processes it started, and fails with a readable reason", async () => {
    // 0.01 min is 600 ms: long enough for the stub to start its child.
    vi.stubEnv("AGENT_BUDGET_MINUTES", "0.01");
    const started = Date.now();

    const { run, pids } = startHangingAgent();
    await run;

    expect(Date.now() - started).toBeLessThan(10_000);
    expect(failureReason()).toContain(
      "Wall-clock budget of 0.01 min exhausted",
    );
    // The stack would only point at the abort plumbing — the message is the
    // whole diagnosis for this failure mode.
    expect(failureReason()).not.toMatch(/\n\s+at /);
    expect(process.exitCode).toBe(1);
    await expectAllDead(pids);

    process.exitCode = 0;
  });
});

// The agent leads its own process group, so the step timeout's or a
// cancellation's SIGTERM to the runner would not reach it: without this it
// kept working while the workflow's later steps ran.
describe("a SIGTERM to the runner", () => {
  it("kills the agent before the runner exits, and leaves a reason", async () => {
    vi.stubEnv("AGENT_BUDGET_MINUTES", "");
    const exit = vi
      .spyOn(process, "exit")
      .mockImplementation(() => undefined as never);

    const { run, pids } = startHangingAgent();
    await vi.waitFor(() => expect(pids).toHaveLength(2));
    process.emit("SIGTERM", "SIGTERM");

    expect(exit).toHaveBeenCalledWith(1);
    expect(failureReason()).toContain("Runner received SIGTERM");
    await expectAllDead(pids);

    await run;
    process.exitCode = 0;
  });
});
