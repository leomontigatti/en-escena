import { spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

// #1573: the SessionStart warning for a shell that cannot find the tools.
// PATH is a directory of stubs plus the system tools the hook itself needs,
// so each case decides exactly which tools the session "has".

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const hook = path.join(repoRoot, ".agents/hooks/check-tool-path.sh");

let binDir: string;

function which(tool: string): string {
  const found = spawnSync("bash", ["-c", `command -v ${tool}`], {
    encoding: "utf8",
  }).stdout.trim();
  if (!found) throw new Error(`${tool} is needed to run this test`);
  return found;
}

function stub(...tools: string[]) {
  for (const tool of tools) {
    const file = path.join(binDir, tool);
    writeFileSync(file, "#!/bin/sh\nexit 0\n");
    chmodSync(file, 0o755);
  }
}

function runHook() {
  return spawnSync(which("bash"), [hook], {
    input: JSON.stringify({ hook_event_name: "SessionStart" }),
    encoding: "utf8",
    env: { PATH: binDir },
  });
}

beforeEach(() => {
  binDir = mkdtempSync(path.join(tmpdir(), "tool-path-hook-"));
  mkdirSync(binDir, { recursive: true });
  symlinkSync(which("jq"), path.join(binDir, "jq"));
});

afterEach(() => {
  rmSync(binDir, { recursive: true, force: true });
});

describe("check-tool-path hook", () => {
  it("says nothing when node, pnpm and playwright-cli are all on PATH", () => {
    stub("node", "pnpm", "playwright-cli");

    const result = runHook();

    expect(result.status).toBe(0);
    expect(result.stdout).toBe("");
  });

  it("names the missing tools in the session's context and points at the fix", () => {
    stub("node");

    const result = runHook();
    const output = JSON.parse(result.stdout) as {
      hookSpecificOutput: { hookEventName: string; additionalContext: string };
    };

    expect(result.status).toBe(0);
    expect(output.hookSpecificOutput.hookEventName).toBe("SessionStart");
    expect(output.hookSpecificOutput.additionalContext).toMatch(
      /cannot find pnpm playwright-cli on PATH/,
    );
    expect(output.hookSpecificOutput.additionalContext).toMatch(
      /#the-agent-shells-path/,
    );
  });
});
