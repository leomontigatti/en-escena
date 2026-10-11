import { chmodSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// Prepended to every stub. `runAgent` starts the agent detached, so a stub
// outlives a test run that is killed outright (a `timeout`, an oomd kill): no
// teardown runs, and the stub was reparented and kept its tools running for
// hours. Once its parent is gone, the stub kills its own process group, which
// holds those tools.
const DIE_WITH_PARENT = `{
  const parent = process.ppid;
  setInterval(() => {
    if (process.ppid === parent) return;
    try {
      process.kill(-process.pid, "SIGKILL");
    } catch {
      process.exit(1);
    }
  }, 200).unref();
}`;

/**
 * Write an executable Node script that stands in for `claude` in `runAgent`.
 * The agent's environment is an allow-list, so a stub cannot be steered by env
 * vars: each behaviour is its own script. The stub dies, with what it spawned,
 * when the process that started it dies.
 */
export function writeAgentStub(
  directory: string,
  name: string,
  body: string,
): string {
  const path = join(directory, name);
  writeFileSync(path, `#!/usr/bin/env node\n${DIE_WITH_PARENT}\n${body}\n`);
  chmodSync(path, 0o755);
  return path;
}

/** One stream-json line as `claude --output-format stream-json` prints it. */
export function streamLine(event: unknown): string {
  return JSON.stringify(event);
}
