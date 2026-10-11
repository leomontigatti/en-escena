import { chmodSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// Prepended to every stub. `runAgent` starts the agent detached, so a stub
// outlives a test run that is killed outright (a `timeout`, an oomd kill): no
// teardown runs, and the stub was reparented and kept its tools running for
// hours. Once its parent is gone, the stub kills its own process group, which
// holds those tools. The parent's pid is written in rather than read at
// startup: a parent that died before the stub's first line ran would
// otherwise be recorded as init, and the stub would never notice.
function dieWithParent(parentPid: number): string {
  return `{
  const check = () => {
    if (process.ppid === ${parentPid}) return;
    try {
      process.kill(-process.pid, "SIGKILL");
    } catch {
      process.exit(1);
    }
  };
  check();
  setInterval(check, 200).unref();
}`;
}

/**
 * Write an executable Node script that stands in for `claude` in `runAgent`.
 * The agent's environment is an allow-list, so a stub cannot be steered by env
 * vars: each behaviour is its own script. The stub dies, with what it spawned,
 * when `parentPid` (the process that will start it, this one by default, as
 * with `runAgent`) is no longer its parent.
 */
export function writeAgentStub(
  directory: string,
  name: string,
  body: string,
  { parentPid = process.pid }: { parentPid?: number } = {},
): string {
  const path = join(directory, name);
  writeFileSync(
    path,
    `#!/usr/bin/env node\n${dieWithParent(parentPid)}\n${body}\n`,
  );
  chmodSync(path, 0o755);
  return path;
}

/** One stream-json line as `claude --output-format stream-json` prints it. */
export function streamLine(event: unknown): string {
  return JSON.stringify(event);
}
