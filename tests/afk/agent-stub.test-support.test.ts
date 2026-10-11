import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { writeAgentStub } from "./agent-stub.test-support";

let directory: string;

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "afk-agent-stub-"));
});

afterEach(() => {
  rmSync(directory, { force: true, recursive: true });
});

// A killed orphan stays a zombie until init reaps it, and a container whose
// PID 1 does not reap keeps it that way; `kill(pid, 0)` still succeeds on one.
function isAlive(pid: number): boolean {
  const stat = `/proc/${pid}/stat`;
  if (existsSync(stat)) {
    const state = readFileSync(stat, "utf8").split(") ")[1]?.[0];
    return state !== undefined && state !== "Z";
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function killQuietly(pid: number | undefined): void {
  if (pid === undefined) return;
  try {
    process.kill(pid, "SIGKILL");
  } catch {
    // Already gone.
  }
}

// The bug: a SIGKILL to the test run (a `timeout`, an oomd kill of the agent's
// shell) skips every teardown, and the detached stub agent was reparented and
// kept running with its `sleep` tool, holding the worktree open for 14 hours.
describe("writeAgentStub", () => {
  it("writes a stub that dies with its tools when the process that started it dies", async () => {
    const stubPath = join(directory, "hanging-agent");
    const pidsPath = join(directory, "pids");
    // A stand-in runner: once the stub exists it starts it the way `runAgent`
    // does (detached, so the stub leads its own process group).
    const runner = spawn(
      process.execPath,
      [
        "-e",
        `const fs = require("node:fs");
const wait = setInterval(() => {
  if (!fs.existsSync(${JSON.stringify(`${stubPath}.ready`)})) return;
  clearInterval(wait);
  require("node:child_process").spawn(${JSON.stringify(stubPath)}, [], { detached: true, stdio: "ignore" }).unref();
}, 20);
setInterval(() => {}, 1000);`,
      ],
      { stdio: "ignore" },
    );
    let pids: number[] = [];

    try {
      writeAgentStub(
        directory,
        "hanging-agent",
        `const { spawn } = require("node:child_process");
const tool = spawn("sleep", ["600"], { stdio: "ignore" });
require("node:fs").writeFileSync(${JSON.stringify(pidsPath)}, JSON.stringify([process.pid, tool.pid]));
setInterval(() => {}, 1000);`,
        { parentPid: runner.pid },
      );
      writeAgentStub(directory, "hanging-agent.ready", "");
      pids = await vi.waitFor(
        () => JSON.parse(readFileSync(pidsPath, "utf8")) as number[],
        { timeout: 5_000 },
      );

      runner.kill("SIGKILL");

      await vi.waitFor(
        () => {
          for (const pid of pids)
            expect(isAlive(pid), `pid ${pid}`).toBe(false);
        },
        { timeout: 5_000 },
      );
    } finally {
      // Never let this test leak what it asserts about.
      killQuietly(runner.pid);
      for (const pid of pids) if (isAlive(pid)) killQuietly(pid);
    }
  });
});
