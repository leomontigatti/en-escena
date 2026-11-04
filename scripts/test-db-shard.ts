import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

// Replays one runner of CI's `db-shard` matrix: the same reset and the same
// vitest command `.github/workflows/ci.yml` runs, against `TEST_DATABASE_URL`.
// A test that fails only beside the files it shares a shard with passes in the
// full local run, so this is how a red shard is reproduced before a push.
//
// Usage: pnpm test:db:shard <i>. Exit 2 on a bad argument, otherwise the exit
// code of the first command that failed.

/** The `db-shard` matrix size in ci.yml; a test keeps the two in step. */
export const DB_SHARD_COUNT = 4;

export function parseShard(
  args: string[],
): { ok: true; shard: number } | { ok: false; message: string } {
  const usage = `Usage: pnpm test:db:shard <1-${DB_SHARD_COUNT}>`;
  const [arg, ...rest] = args;
  if (arg === undefined || rest.length > 0) {
    return {
      ok: false,
      message: `Expected exactly one shard number.\n${usage}`,
    };
  }
  const shard = /^\d+$/.test(arg) ? Number(arg) : Number.NaN;
  if (!Number.isInteger(shard) || shard < 1 || shard > DB_SHARD_COUNT) {
    return {
      ok: false,
      message: `"${arg}" is not a shard: CI runs shards 1 to ${DB_SHARD_COUNT}.\n${usage}`,
    };
  }
  return { ok: true, shard };
}

function run(command: string, args: string[]): number {
  const result = spawnSync(command, args, { stdio: "inherit" });
  if (result.error) throw result.error;
  return result.status ?? 1;
}

function main() {
  const parsed = parseShard(process.argv.slice(2));
  if (!parsed.ok) {
    console.error(parsed.message);
    process.exit(2);
  }

  const reset = run("pnpm", ["db:test:reset"]);
  if (reset !== 0) process.exit(reset);

  process.exit(
    run("pnpm", [
      "exec",
      "vitest",
      "--config",
      "vitest.db.config.ts",
      "--run",
      `--shard=${parsed.shard}/${DB_SHARD_COUNT}`,
    ]),
  );
}

if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1] ?? "")) {
  main();
}
