// The `CI` workflow's verdict on the reviewed head, as a block for the prompt
// (spec §4.4, issue #966).
//
// The review agent validates with `pnpm typecheck` / `lint` / `test:unit` only:
// the full DB suite, `build`, `format:check` and the `check:*` scripts run in CI
// and nowhere else, so without this block a reviewer can call a branch clean
// while CI is red on it. CI takes ~3 min, so the wait has a 10-minute ceiling
// and gives up with `not finished` rather than failing the review — a review
// with a stale CI verdict is worth far more than no review at all.
//
// Every `gh` read here is scoped to the `CI` workflow on one sha, deliberately
// not to "all checks on the PR": the review posts its own check, so waiting on
// all of them would wait on itself.

/** What CI said about the head under review. */
export type CiOutcome = "success" | "failure" | "not finished";

export interface CiStatus {
  readonly outcome: CiOutcome;
  /** Why, in prose: the failed jobs and their log tail, or what the wait hit. */
  readonly detail: string;
}

/** The fields of a `gh run list` entry this module reads. */
export interface CiRun {
  readonly databaseId: number;
  /** `queued` | `in_progress` | `completed` (GitHub's run status). */
  readonly status: string;
  /** `success` | `failure` | … ; `null` until the run completes. */
  readonly conclusion: string | null;
}

export interface CiWaitOptions {
  /** Runs a read-only `gh` call. Injected so tests never spawn a process. */
  readonly gh: (args: string[]) => string;
  /** Blocks for `ms`. Injected so tests never actually wait. */
  readonly sleep: (ms: number) => void;
  /** Monotonic-enough clock in ms. Injected so tests control the ceiling. */
  readonly now: () => number;
  readonly ceilingMs?: number;
  readonly pollIntervalMs?: number;
}

/** CI runs ~3 min after #963/#964; the ceiling is generous, not tight. */
export const CI_CEILING_MS = 10 * 60 * 1000;
const CI_POLL_INTERVAL_MS = 20 * 1000;

/** How much of `gh run view --log-failed` reaches the prompt. */
const LOG_TAIL_LINES = 120;
const LOG_TAIL_CHARS = 8000;

/**
 * The last `LOG_TAIL_LINES` lines of `text`, further capped at `LOG_TAIL_CHARS`.
 * The tail, not the head: a failing job's actual error is at the end, under the
 * setup noise every job logs identically.
 */
export function truncateLogTail(text: string): string {
  const lines = text.trimEnd().split("\n");
  const kept = lines.slice(-LOG_TAIL_LINES);
  let tail = kept.join("\n");
  let elided = lines.length - kept.length;

  if (tail.length > LOG_TAIL_CHARS) {
    tail = tail.slice(tail.length - LOG_TAIL_CHARS);
    // The slice lands mid-line; drop the partial one so the block starts clean.
    // A single line longer than the cap has no newline to cut at: keep it whole,
    // truncated, rather than emitting an empty block.
    if (tail.includes("\n")) tail = tail.slice(tail.indexOf("\n") + 1);
    elided = lines.length - tail.split("\n").length;
  }

  return elided > 0 ? `[… ${elided} earlier lines omitted …]\n${tail}` : tail;
}

/**
 * The most recent `CI` run on `sha`, or `null` when there is none yet — CI may
 * simply not have been dispatched when the label landed. A `gh` failure degrades
 * to `null` too: it means "nothing known", which the ceiling already handles,
 * and no read here is worth sinking a review over.
 */
export function latestCiRun(repo: string, sha: string, gh: (args: string[]) => string): CiRun | null {
  try {
    const raw = gh([
      "run",
      "list",
      "--repo",
      repo,
      "--workflow",
      "CI",
      "--commit",
      sha,
      "--limit",
      "1",
      "--json",
      "databaseId,status,conclusion",
    ]);
    const runs = JSON.parse(raw || "[]") as CiRun[];
    return runs[0] ?? null;
  } catch {
    return null;
  }
}

/** The failed jobs of a completed run, with the tail of their failing logs. */
export function describeCiFailure(
  repo: string,
  runId: number,
  gh: (args: string[]) => string,
): string {
  let jobs = "";
  try {
    const raw = gh([
      "run",
      "view",
      String(runId),
      "--repo",
      repo,
      "--json",
      "jobs",
      "--jq",
      "[.jobs[]|select(.conclusion==\"failure\")|.name]",
    ]);
    jobs = (JSON.parse(raw || "[]") as string[]).join(", ");
  } catch {
    jobs = "";
  }

  let log = "";
  try {
    log = truncateLogTail(gh(["run", "view", String(runId), "--repo", repo, "--log-failed"]));
  } catch {
    log = "";
  }

  const failed = jobs === "" ? "(job names unavailable)" : jobs;
  const logs = log === "" ? "(no failing-step log available)" : `\`\`\`\n${log}\n\`\`\``;
  return `Failed jobs: ${failed}\n\n${logs}`;
}

/**
 * What a *completed* run says, or `null` while it is still queued/running.
 * A conclusion other than `success` — `failure`, `timed_out`, `cancelled` — is
 * all a failure as far as the reviewer is concerned: CI did not go green.
 */
function completedStatus(
  repo: string,
  run: CiRun,
  sha: string,
  gh: (args: string[]) => string,
): CiStatus | null {
  if (run.status !== "completed") return null;
  if (run.conclusion === "success") {
    return { outcome: "success", detail: `The \`CI\` run on ${sha} passed.` };
  }
  return { outcome: "failure", detail: describeCiFailure(repo, run.databaseId, gh) };
}

/** What the reviewer is told when the ceiling is reached with no verdict. */
function gaveUpStatus(sha: string, ceilingMs: number, sawRun: boolean): CiStatus {
  const minutes = Math.round(ceilingMs / 60000);
  return {
    outcome: "not finished",
    detail: sawRun
      ? `The \`CI\` run on ${sha} was still running after ${minutes} minutes; the review did not wait longer.`
      : `No \`CI\` run was found for ${sha} within ${minutes} minutes.`,
  };
}

/**
 * Poll the `CI` run on `sha` until it completes or the ceiling is hit. Never
 * throws: the worst outcome is `not finished`.
 */
export function waitForCi(repo: string, sha: string, options: CiWaitOptions): CiStatus {
  const ceilingMs = options.ceilingMs ?? CI_CEILING_MS;
  const pollIntervalMs = options.pollIntervalMs ?? CI_POLL_INTERVAL_MS;
  const deadline = options.now() + ceilingMs;

  let sawRun = false;
  for (;;) {
    const run = latestCiRun(repo, sha, options.gh);
    sawRun = sawRun || run !== null;

    const finished = run === null ? null : completedStatus(repo, run, sha, options.gh);
    if (finished !== null) return finished;

    if (options.now() + pollIntervalMs >= deadline) {
      return gaveUpStatus(sha, ceilingMs, sawRun);
    }
    options.sleep(pollIntervalMs);
  }
}

/** The block embedded verbatim into the review prompt. */
export function formatCiBlock(status: CiStatus): string {
  return `Outcome: ${status.outcome}\n\n${status.detail}`;
}
