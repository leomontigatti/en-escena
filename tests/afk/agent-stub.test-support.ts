import { chmodSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Write an executable Node script that stands in for `claude` in `runAgent`.
 * The agent's environment is an allow-list, so a stub cannot be steered by env
 * vars: each behaviour is its own script.
 */
export function writeAgentStub(
  directory: string,
  name: string,
  body: string,
): string {
  const path = join(directory, name);
  writeFileSync(path, `#!/usr/bin/env node\n${body}\n`);
  chmodSync(path, 0o755);
  return path;
}

/** One stream-json line as `claude --output-format stream-json` prints it. */
export function streamLine(event: unknown): string {
  return JSON.stringify(event);
}
