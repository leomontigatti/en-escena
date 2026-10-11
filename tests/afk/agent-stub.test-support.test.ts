import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
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

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

// The bug: a SIGKILL to the test run (a `timeout`, an oomd kill of the agent's
// shell) skips every teardown, and the detached stub agent was reparented and
// kept running with its `sleep` tool, holding the worktree open for 14 hours.
describe("writeAgentStub", () => {
  it("writes a stub that dies with its tools when the process that started it dies", async () => {
    const pidsPath = join(directory, "pids");
    const command = writeAgentStub(
      directory,
      "hanging-agent",
      `const { spawn } = require("node:child_process");
const tool = spawn("sleep", ["600"], { stdio: "ignore" });
require("node:fs").writeFileSync(${JSON.stringify(pidsPath)}, JSON.stringify([process.pid, tool.pid]));
setInterval(() => {}, 1000);`,
    );
    // A stand-in runner starts the stub the way `runAgent` does (detached, so
    // the stub leads its own process group), then is killed outright.
    const runner = spawn(
      process.execPath,
      [
        "-e",
        `require("node:child_process").spawn(${JSON.stringify(command)}, [], { detached: true, stdio: "ignore" }).unref(); setInterval(() => {}, 1000);`,
      ],
      { stdio: "ignore" },
    );
    const pids = await vi.waitFor(
      () => JSON.parse(readFileSync(pidsPath, "utf8")) as number[],
      { timeout: 5_000 },
    );

    runner.kill("SIGKILL");

    try {
      await vi.waitFor(
        () => {
          for (const pid of pids)
            expect(isAlive(pid), `pid ${pid}`).toBe(false);
        },
        { timeout: 5_000 },
      );
    } finally {
      // Never let this test leak what it asserts about.
      for (const pid of pids) {
        try {
          process.kill(pid, "SIGKILL");
        } catch {
          // Already gone, which is the point.
        }
      }
    }
  });
});
