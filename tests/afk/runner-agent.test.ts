import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  agentEnvironment,
  runAgent,
} from "../../.github/architecture-review/agent.mjs";

import { streamLine, writeAgentStub } from "./agent-stub.test-support";

let directory: string;
let logPath: string;

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "afk-runner-agent-"));
  logPath = join(directory, "test.agent.log");
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  rmSync(directory, { force: true, recursive: true });
});

// The agent must never hold a GitHub credential (docs/agents/afk-setup.md:
// "No GitHub token in the agent"). The runner step exports `GH_TOKEN` for its
// own read-only prefetch, and the old runner handed the agent a copy of
// `process.env`, so the token reached it with the job's `issues: write`.
describe("agentEnvironment", () => {
  it("leaves out every GitHub credential while keeping the agent's own", () => {
    const env = agentEnvironment({
      PATH: "/usr/bin",
      HOME: "/home/runner",
      CLAUDE_CODE_OAUTH_TOKEN: "sk-ant-oat",
      GH_TOKEN: "ghs_orchestrator",
      GITHUB_TOKEN: "ghs_orchestrator",
      GH_ENTERPRISE_TOKEN: "ghs_orchestrator",
      OUTPUT_DIR: "/tmp/out",
    });

    expect(env).toEqual({
      PATH: "/usr/bin",
      HOME: "/home/runner",
      CLAUDE_CODE_OAUTH_TOKEN: "sk-ant-oat",
    });
  });

  it("is what the spawned agent process actually sees", async () => {
    vi.stubEnv("GH_TOKEN", "ghs_orchestrator");
    vi.stubEnv("GITHUB_TOKEN", "ghs_orchestrator");
    vi.stubEnv("GH_ENTERPRISE_TOKEN", "ghs_orchestrator");
    vi.stubEnv("CLAUDE_CODE_OAUTH_TOKEN", "sk-ant-oat");
    const command = writeAgentStub(
      directory,
      "env-agent",
      `const text = JSON.stringify(Object.keys(process.env));
console.log(JSON.stringify({ type: "assistant", message: { content: [{ type: "text", text }] } }));`,
    );

    const turn = await runAgent({
      prompt: "",
      label: "test",
      logPath,
      command,
    });
    const names = JSON.parse(turn.text) as string[];

    expect(names).toContain("CLAUDE_CODE_OAUTH_TOKEN");
    expect(names).not.toContain("GH_TOKEN");
    expect(names).not.toContain("GITHUB_TOKEN");
    expect(names).not.toContain("GH_ENTERPRISE_TOKEN");
  });
});

describe("runAgent", () => {
  it("returns the session and the text of the turn, and logs it readably", async () => {
    const lines = [
      streamLine({ type: "system", subtype: "init", session_id: "session-1" }),
      streamLine({
        type: "assistant",
        message: {
          content: [
            { type: "text", text: "Reading the glossary." },
            {
              type: "tool_use",
              name: "Bash",
              input: { command: "cat GLOSSARY.md" },
            },
          ],
        },
      }),
      streamLine({
        type: "assistant",
        message: { content: [{ type: "text", text: "Done." }] },
      }),
      streamLine({ type: "result", result: "Done." }),
    ];
    const command = writeAgentStub(
      directory,
      "streaming-agent",
      `for (const line of ${JSON.stringify(lines)}) console.log(line);`,
    );

    const turn = await runAgent({
      prompt: "explore",
      label: "test",
      logPath,
      command,
    });

    expect(turn).toEqual({
      sessionId: "session-1",
      text: "Reading the glossary.\nDone.",
    });
    const log = readFileSync(logPath, "utf8");
    expect(log).toContain("Reading the glossary.");
    expect(log).toContain("⚙ Bash(cat GLOSSARY.md)");
  });

  it("hands the prompt over stdin and resumes the session it is given", async () => {
    const command = writeAgentStub(
      directory,
      "echo-agent",
      `let input = "";
process.stdin.on("data", (chunk) => (input += chunk));
process.stdin.on("end", () => {
  const text = JSON.stringify({ argv: process.argv.slice(2), input });
  console.log(JSON.stringify({ type: "assistant", message: { content: [{ type: "text", text }] } }));
});`,
    );

    const turn = await runAgent({
      prompt: "emit the output",
      resumeSession: "session-1",
      label: "test",
      logPath,
      command,
    });
    const seen = JSON.parse(turn.text) as { argv: string[]; input: string };

    expect(seen.input).toBe("emit the output");
    expect(seen.argv).toEqual(
      expect.arrayContaining(["--print", "--resume", "session-1"]),
    );
    expect(seen.argv.join(" ")).toContain("--model claude-opus-5-5");
  });

  it("rejects with the agent's stderr when it exits non-zero", async () => {
    const command = writeAgentStub(
      directory,
      "failing-agent",
      `console.error("model not available"); process.exit(2);`,
    );

    await expect(
      runAgent({ prompt: "", label: "test", logPath, command }),
    ).rejects.toThrow(/exited with code 2:\nmodel not available/);
  });
});
