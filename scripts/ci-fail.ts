import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

// Prints the end of each failed CI job's log on a PR, and nothing else, so a
// session triaging a red check reads the failure instead of pulling whole logs
// with `gh run view`.
//
// Usage: pnpm ci:fail [<pr>] [--lines <n>]   (default: this branch's PR, 40 lines)
//
// `gh run view --job <id> --log-failed` returns the whole job when GitHub does
// not name its steps, and the job ends with container cleanup, so a plain tail
// shows the cleanup. The tail here ends at the last `##[error]` annotation,
// which GitHub writes where the failing step stopped.

const DEFAULT_LINES = 40;
const FAILED_BUCKETS = new Set(["fail", "cancel"]);

export type Check = {
  name: string;
  bucket: string;
  workflow: string;
  link: string;
};

export type FailedJob = {
  name: string;
  workflow: string;
  link: string;
  /** The Actions job id, or null for a check that is not an Actions job. */
  jobId: string | null;
};

export function failedJobs(checks: Check[]): FailedJob[] {
  return checks
    .filter((check) => FAILED_BUCKETS.has(check.bucket))
    .map((check) => ({
      name: check.name,
      workflow: check.workflow,
      link: check.link,
      jobId: /\/actions\/runs\/\d+\/job\/(\d+)/.exec(check.link)?.[1] ?? null,
    }));
}

// `<job>\t<step>\t<timestamp> <text>`. The timestamp sometimes sits behind a
// BOM, and a line that continues the previous one has none.
const PREFIX = /^[^\t]*\t[^\t]*\t(\uFEFF?\d{4}-\d{2}-\d{2}T[\d:.]+Z ?)?/;
// Colour codes, as the escape byte or as the `^[` gh prints in its place.
const ANSI = /(\u001b|\^\[)\[[0-9;]*m/g;
const GROUP_MARKER = /^##\[(group|endgroup)\]/;

export function logTail(log: string, lines: number): string[] {
  const cleaned = log
    .split("\n")
    .map((line) => line.replace(PREFIX, "").replace(ANSI, "").trimEnd())
    .filter((line) => !GROUP_MARKER.test(line))
    .filter((line, index, all) => line !== "" || all[index - 1] !== "");
  const lastError = cleaned
    .map((line) => line.startsWith("##[error]"))
    .lastIndexOf(true);
  const end = lastError === -1 ? cleaned.length : lastError + 1;
  const kept = cleaned.slice(0, end);

  while (kept.length > 0 && kept.at(-1) === "") kept.pop();

  return kept.slice(-lines);
}

function gh(args: string[]): string {
  const result = spawnSync("gh", args, {
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
  });

  if (result.error) throw result.error;
  // `gh pr checks` exits 8 while checks are pending and 1 when one failed,
  // with its JSON on stdout either way.
  if (result.status !== 0 && !result.stdout.trim()) {
    throw new Error(result.stderr.trim() || `gh ${args.join(" ")} failed`);
  }

  return result.stdout;
}

function parseArgs(args: string[]): { pr: string | null; lines: number } {
  let pr: string | null = null;
  let lines = DEFAULT_LINES;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--") continue;
    if (arg === "--lines") {
      lines = Number(args[++index]);
      if (!Number.isInteger(lines) || lines < 1) {
        throw new Error("--lines takes a positive whole number");
      }
    } else if (arg && pr === null && !arg.startsWith("-")) {
      pr = arg;
    } else {
      throw new Error("usage: pnpm ci:fail [<pr>] [--lines <n>]");
    }
  }

  return { pr, lines };
}

function main(args: string[]) {
  const { pr, lines } = parseArgs(args);
  const checks = JSON.parse(
    gh([
      "pr",
      "checks",
      ...(pr ? [pr] : []),
      "--json",
      "name,bucket,workflow,link",
    ]),
  ) as Check[];
  const jobs = failedJobs(checks);

  if (jobs.length === 0) {
    console.log(`No failed checks on ${pr ? `#${pr}` : "this branch's PR"}.`);
    return;
  }

  const sections = jobs.map((job) => {
    const title = `── ${job.name}${job.workflow ? ` (${job.workflow})` : ""} · ${job.link} ──`;

    if (!job.jobId) {
      return [title, "(not a GitHub Actions job: open the link)"].join("\n");
    }

    const log = gh(["run", "view", "--job", job.jobId, "--log-failed"]);
    return [title, ...logTail(log, lines)].join("\n");
  });

  console.log(sections.join("\n\n"));
}

if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1] ?? "")) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
