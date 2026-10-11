// One agent turn: spawn the `claude` CLI on the runner host, stream what it
// does to the console and the agent log, and hand back its text and session.
//
// The runner used to go through `@ai-hero/sandcastle` for this (#1473). Owning
// the spawn is what lets the wall-clock budget actually stop the agent, and lets
// the agent's environment be an allow-list instead of a copy of ours.

import { spawn } from "node:child_process";
import { appendFileSync } from "node:fs";
import { createInterface } from "node:readline";

const AGENT_MODEL = "claude-opus-5-5";
const AGENT_EFFORT = "medium";

/**
 * Everything the agent's environment holds: what the CLI and its shell tools
 * need to run, and the agent credential.
 *
 * The contract's hard invariant (docs/agents/afk-setup.md) is that the agent never mutates the tracker or the
 * remote. The runner step carries `GH_TOKEN` for its own read-only prefetch, so
 * copying `process.env` would hand the agent a token with the job's
 * `issues: write`, and its `gh` calls would succeed. An allow-list keeps that
 * true by construction rather than by remembering to delete the right names.
 */
const AGENT_ENV_ALLOW_LIST = [
  "PATH",
  "HOME",
  "USER",
  "SHELL",
  "LANG",
  "LC_ALL",
  "TERM",
  "TMPDIR",
  "CI",
  "CLAUDE_CODE_OAUTH_TOKEN",
  "ANTHROPIC_API_KEY",
] as const;

export function agentEnvironment(
  source: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const name of AGENT_ENV_ALLOW_LIST) {
    const value = source[name];
    if (value !== undefined) env[name] = value;
  }
  return env;
}

/** What one turn leaves behind: its session, to resume, and everything it said. */
export interface AgentTurn {
  readonly sessionId: string | undefined;
  readonly text: string;
}

export interface RunAgentOptions {
  readonly prompt: string;
  /** Continue this session instead of starting a new one. */
  readonly resumeSession?: string;
  /** Prefix for the console lines, so the CI log says which turn wrote them. */
  readonly label: string;
  /** Where the readable transcript is appended; the workflow uploads it. */
  readonly logPath: string;
  /** Aborting kills the agent and rejects with the signal's reason. */
  readonly signal?: AbortSignal;
  /** The executable to spawn; a test passes a stub. */
  readonly command?: string;
}

/** The input field that says what a tool call is about, per tool. */
const TOOL_SUBJECT_FIELDS = [
  "command",
  "file_path",
  "pattern",
  "path",
  "skill",
  "url",
  "query",
  "description",
];

interface StreamEvent {
  readonly type?: string;
  readonly subtype?: string;
  readonly session_id?: string;
  readonly result?: unknown;
  readonly message?: { readonly content?: readonly StreamContentBlock[] };
}

interface StreamContentBlock {
  readonly type?: string;
  readonly text?: unknown;
  readonly name?: unknown;
  readonly input?: Record<string, unknown>;
}

/** What one stdout line adds to the turn; empty for the lines the runner ignores. */
interface StreamUpdate {
  readonly sessionId?: string;
  readonly result?: string;
  readonly blocks?: readonly MessageBlock[];
}

/** One block of an assistant message: `text` when it is prose, `shown` for the log. */
interface MessageBlock {
  readonly text?: string;
  readonly shown: string;
}

function describeToolCall(
  name: string,
  input: Record<string, unknown> | undefined,
): string {
  const field = TOOL_SUBJECT_FIELDS.find(
    (candidate) => typeof input?.[candidate] === "string",
  );
  return field ? `⚙ ${name}(${String(input?.[field])})` : `⚙ ${name}`;
}

function readBlock(block: StreamContentBlock): MessageBlock[] {
  if (typeof block.text === "string" && block.type === "text") {
    return [{ text: block.text, shown: block.text.trim() }];
  }
  if (typeof block.name === "string" && block.type === "tool_use") {
    return [{ shown: describeToolCall(block.name, block.input) }];
  }
  return [];
}

const STREAM_READERS: Record<string, (event: StreamEvent) => StreamUpdate> = {
  system: (event) =>
    event.subtype === "init" ? { sessionId: event.session_id } : {},
  assistant: (event) => ({
    blocks: (event.message?.content ?? []).flatMap(readBlock),
  }),
  result: (event) =>
    typeof event.result === "string" ? { result: event.result } : {},
};

function parseStreamEvent(line: string): StreamEvent {
  try {
    return JSON.parse(line) as StreamEvent;
  } catch {
    return {};
  }
}

function readStreamLine(line: string): StreamUpdate {
  const event = parseStreamEvent(line);
  const reader = STREAM_READERS[event.type ?? ""];
  return reader ? reader(event) : {};
}

/**
 * Run one `claude --print` turn to completion.
 *
 * The prompt goes in on stdin rather than as an argument: the architecture
 * review prompt embeds the prior proposals and can outgrow an argv entry.
 *
 * The child leads its own process group, so the budget's abort kills the
 * agent together with the shell tools it started rather than orphaning them.
 */
export function runAgent(options: RunAgentOptions): Promise<AgentTurn> {
  const {
    prompt,
    resumeSession,
    label,
    logPath,
    signal,
    command = "claude",
  } = options;

  if (signal?.aborted) {
    return Promise.reject(signal.reason);
  }

  const args = [
    "--print",
    "--verbose",
    "--dangerously-skip-permissions",
    "--output-format",
    "stream-json",
    "--model",
    AGENT_MODEL,
    "--effort",
    AGENT_EFFORT,
  ];
  if (resumeSession) args.push("--resume", resumeSession);

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env: agentEnvironment(),
      stdio: ["pipe", "pipe", "pipe"],
      detached: true,
    });

    let sessionId: string | undefined;
    let result: string | undefined;
    const texts: string[] = [];
    const stderr: string[] = [];

    const record = (line: string) => {
      console.log(`[${label}] ${line}`);
      appendFileSync(logPath, `${line}\n`, "utf8");
    };

    const kill = () => {
      if (child.pid === undefined || child.exitCode !== null) return;
      try {
        process.kill(-child.pid, "SIGKILL");
      } catch {
        // The group is already gone.
      }
    };
    signal?.addEventListener("abort", kill, { once: true });

    record(
      `--- ${resumeSession ? `resuming ${resumeSession}` : "new session"} ---`,
    );

    createInterface({ input: child.stdout }).on("line", (line) => {
      const update = readStreamLine(line);
      sessionId = update.sessionId ?? sessionId;
      result = update.result ?? result;
      for (const block of update.blocks ?? []) {
        if (block.text !== undefined) texts.push(block.text);
        if (block.shown) record(block.shown);
      }
    });

    createInterface({ input: child.stderr }).on("line", (line) => {
      stderr.push(line);
      appendFileSync(logPath, `stderr: ${line}\n`, "utf8");
    });

    child.on("error", (error) => {
      signal?.removeEventListener("abort", kill);
      reject(error);
    });

    child.on("close", (code) => {
      signal?.removeEventListener("abort", kill);

      if (signal?.aborted) {
        reject(signal.reason);
        return;
      }
      if (code !== 0) {
        const detail =
          stderr.slice(-20).join("\n").trim() ||
          result ||
          texts.slice(-1).join("");
        reject(new Error(`${command} exited with code ${code}:\n${detail}`));
        return;
      }
      resolve({
        sessionId,
        text: texts.length > 0 ? texts.join("\n") : (result ?? ""),
      });
    });

    // An agent that dies before reading its prompt surfaces as EPIPE here; its
    // exit code is the error worth reporting, and `close` reports it.
    child.stdin.on("error", () => {});
    child.stdin.end(prompt);
  });
}
