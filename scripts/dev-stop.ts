import { execFileSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

import { git } from "./worktree-db";

// Stops this worktree's dev server: whatever listens on its `PORT` and runs
// from inside it. The target is chosen by port and working directory, never by
// matching a command line: `pkill -f <pattern>` also matches the shell that
// issued it, which is how a session kills its own Bash call (#1337).
//
// Usage: pnpm dev:stop. Exit 0 when the port ends up free or was already, 1
// when it is held from outside this worktree or the server ignored SIGTERM.

const DEFAULT_PORT = 5173;
const WAIT_MS = 5000;
const POLL_MS = 100;

type Listener = { pid: number; cwd: string | null };

export function planStop(input: { root: string; listeners: Listener[] }): {
  stop: number[];
  foreign: Listener[];
} {
  const inside = (cwd: string | null) =>
    cwd !== null &&
    (cwd === input.root || cwd.startsWith(`${input.root}${path.sep}`));

  return {
    stop: input.listeners
      .filter((listener) => inside(listener.cwd))
      .map((listener) => listener.pid),
    foreign: input.listeners.filter((listener) => !inside(listener.cwd)),
  };
}

/** PIDs listening on the port; `lsof` exits 1 with no output when there are none. */
function listeningPids(port: number): number[] {
  try {
    return execFileSync(
      "lsof",
      ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    )
      .split("\n")
      .filter(Boolean)
      .map(Number);
  } catch (error) {
    if ((error as { status?: number }).status === 1) return [];
    throw error;
  }
}

/** The process's working directory, read through `lsof` so macOS answers too. */
function workingDirectory(pid: number): string | null {
  try {
    const output = execFileSync(
      "lsof",
      ["-a", "-p", String(pid), "-d", "cwd", "-Fn"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    );
    return /^n(.+)$/m.exec(output)?.[1] ?? null;
  } catch {
    return null;
  }
}

/** True once none of the pids listens on the port any more, false after the wait. */
async function portFreedOf(port: number, pids: number[]): Promise<boolean> {
  for (let waited = 0; waited < WAIT_MS; waited += POLL_MS) {
    const listening = new Set(listeningPids(port));
    if (!pids.some((pid) => listening.has(pid))) return true;
    await delay(POLL_MS);
  }
  return false;
}

async function stopListeners(port: number, pids: number[]): Promise<boolean> {
  if (pids.length === 0) return true;
  for (const pid of pids) process.kill(pid, "SIGTERM");

  const freed = await portFreedOf(port, pids);
  if (freed) console.log(`stopped ${pids.join(", ")} on ${port}`);
  else console.error(`pid ${pids.join(", ")} still listens on ${port}`);
  return freed;
}

async function main() {
  const port = Number(process.env.PORT) || DEFAULT_PORT;
  const listeners = listeningPids(port).map((pid) => ({
    pid,
    cwd: workingDirectory(pid),
  }));
  const { stop, foreign } = planStop({
    root: git(["rev-parse", "--show-toplevel"]),
    listeners,
  });

  if (listeners.length === 0) console.log(`nothing listening on ${port}`);
  for (const listener of foreign) {
    console.error(
      `port ${port} is held by pid ${listener.pid} outside this worktree (${listener.cwd ?? "unknown directory"}); left alone`,
    );
  }

  const stopped = await stopListeners(port, stop);
  process.exitCode = stopped && foreign.length === 0 ? 0 : 1;
}

if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1] ?? "")) {
  await main();
}
