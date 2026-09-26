import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

// Blocks until one review round on a PR is over, then prints one JSON line and
// exits with the verdict as its code. It is the waiting half of the
// `babysit-pr` skill: the agent spends one turn per round, not one per poll,
// and reads a digest instead of the raw PR.
//
// A round is over when nothing is running: every check and CodeRabbit have
// finished on the head commit. Waiting for all of them, rather than waking on
// the first red check, is what lets one push answer a whole round. Conflicts
// and a merge or close end the wait at once.
//
// CodeRabbit is read from its `CodeRabbit` commit status, which turns green a
// minute or two before its review posts. So it counts as done only once a
// review of the head commit exists, or a grace period has passed with none,
// which is how a commit it skips (an Update Branch merge) looks.
//
// Usage: pnpm pr:watch [pr] [--once] [--interval <s>] [--timeout <s>]
//
// Exit codes: 0 READY or MERGED, 2 CONFLICTS, 3 THREADS or FINDINGS, 4 CHECKS,
// 5 WAITING (timed out, or --once mid-round), 6 GATE or CLOSED, 7 `gh` kept
// failing, 1 usage error. The default timeout keeps one call under the Bash
// tool's ten-minute limit; the skill re-runs it.

/** The contexts branch protection requires on `master`: `ci.yml`'s four plus `pr-title`. */
export const REQUIRED_CONTEXTS = [
  "checks",
  "db-gate",
  "docs-gate",
  "actions-gate",
  "pr-title",
];
export const CODERABBIT_GRACE_SECONDS = 180;
const CODERABBIT_CONTEXT = "CodeRabbit";
const FINDING_LIMIT = 400;
const MAX_GH_FAILURES = 3;

export type Options = {
  pr: number | null;
  interval: number;
  timeout: number;
  once: boolean;
};

type CheckRun = {
  __typename: "CheckRun";
  name: string;
  workflowName?: string;
  status: string;
  conclusion: string | null;
  startedAt?: string | null;
  detailsUrl?: string | null;
};
type StatusContext = {
  __typename: "StatusContext";
  context: string;
  state: string;
  startedAt?: string | null;
  targetUrl?: string | null;
};
type RollupEntry = CheckRun | StatusContext;

type Thread = {
  id: string;
  isResolved: boolean;
  isOutdated: boolean;
  path: string;
  line: number | null;
  comments: { author: string; body: string }[];
};

export type PrSnapshot = {
  number: number;
  state: string;
  mergedAt: string | null;
  isDraft: boolean;
  head: string;
  base: string;
  mergeable: string;
  mergeState: string;
  reviewDecision: string;
  rollup: RollupEntry[];
  threads: Thread[];
  coderabbitReviews: { commit: string; submittedAt: string; body: string }[];
  comments: { author: string; body: string; createdAt: string }[];
};

type FailedCheck = { name: string; workflow: string; link: string };

export type Verdict = {
  verdict:
    | "READY"
    | "MERGED"
    | "CLOSED"
    | "CONFLICTS"
    | "WAITING"
    | "THREADS"
    | "FINDINGS"
    | "CHECKS"
    | "GATE";
  exitCode: number;
  pr: number;
  head: string;
  mergeState: string;
  pending: string[];
  failed: FailedCheck[];
  threads: {
    id: string;
    path: string;
    line: number | null;
    author: string;
    outdated: boolean;
    replies: number;
    finding: string;
  }[];
  reviewFindings: string | null;
  gate: string | null;
  /** CodeRabbit reviews on the whole PR, every commit: the triage rubric's pass count. */
  coderabbitPasses: number;
};

class UsageError extends Error {}

function positiveSeconds(flag: string, value: string | undefined): number {
  const seconds = Number(value);
  if (!(seconds > 0))
    throw new UsageError(`${flag} needs a positive number of seconds`);
  return seconds;
}

export function parseArgs(argv: string[]): Options {
  const options: Options = {
    pr: null,
    interval: 60,
    timeout: 540,
    once: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--once") options.once = true;
    else if (arg === "--interval")
      options.interval = positiveSeconds(arg, argv[(i += 1)]);
    else if (arg === "--timeout")
      options.timeout = positiveSeconds(arg, argv[(i += 1)]);
    else if (arg.startsWith("--"))
      throw new UsageError(`unknown option ${arg}`);
    else {
      const pr = Number(arg);
      if (!Number.isInteger(pr) || pr <= 0)
        throw new UsageError(`"${arg}" is not a PR number`);
      options.pr = pr;
    }
  }
  return options;
}

function entryName(entry: RollupEntry): string {
  return entry.__typename === "CheckRun" ? entry.name : entry.context;
}

type CheckState = "pass" | "fail" | "pending";

function entryState(entry: RollupEntry): CheckState {
  if (entry.__typename === "StatusContext") {
    if (entry.state === "SUCCESS") return "pass";
    return entry.state === "PENDING" || entry.state === "EXPECTED"
      ? "pending"
      : "fail";
  }
  if (entry.status !== "COMPLETED") return "pending";
  return ["SUCCESS", "NEUTRAL", "SKIPPED"].includes(entry.conclusion ?? "")
    ? "pass"
    : "fail";
}

/** The latest run of each check, by start time: a re-run replaces the run it repeats. */
function latestByName(rollup: RollupEntry[]): Map<string, RollupEntry> {
  const latest = new Map<string, RollupEntry>();
  for (const entry of rollup) {
    const current = latest.get(entryName(entry));
    if (
      current === undefined ||
      (entry.startedAt ?? "") >= (current.startedAt ?? "")
    ) {
      latest.set(entryName(entry), entry);
    }
  }
  return latest;
}

/**
 * Pending and failed checks, CodeRabbit aside. On `master` a required context
 * that has not reported yet is pending, so a fresh push does not read as green;
 * a stacked base requires none, since CI there runs only inside a GitHub stack.
 */
export function summarizeChecks(rollup: RollupEntry[], base: string) {
  const latest = latestByName(rollup);
  latest.delete(CODERABBIT_CONTEXT);
  const entries = [...latest.values()];
  const required = base === "master" ? REQUIRED_CONTEXTS : [];
  return {
    pending: [
      ...required.filter((name) => !latest.has(name)),
      ...entries
        .filter((entry) => entryState(entry) === "pending")
        .map(entryName),
    ],
    failed: entries
      .filter((entry) => entryState(entry) === "fail")
      .map(failedCheck),
  };
}

function failedCheck(entry: RollupEntry): FailedCheck {
  return entry.__typename === "CheckRun"
    ? {
        name: entry.name,
        workflow: entry.workflowName ?? "",
        link: entry.detailsUrl ?? "",
      }
    : { name: entry.context, workflow: "", link: entry.targetUrl ?? "" };
}

export function coderabbitState(
  pr: PrSnapshot,
  now: number,
): { done: boolean; reviewed: boolean; failed: boolean } {
  const status = latestByName(pr.rollup).get(CODERABBIT_CONTEXT);
  const reviewed = pr.coderabbitReviews.some(
    (review) => review.commit === pr.head,
  );
  if (status === undefined) return { done: false, reviewed, failed: false };
  const state = entryState(status);
  if (state === "pending") return { done: false, reviewed, failed: false };
  if (state === "fail") return { done: true, reviewed, failed: true };
  const greenFor = (now - Date.parse(status.startedAt ?? "")) / 1000;
  return {
    done: reviewed || greenFor >= CODERABBIT_GRACE_SECONDS,
    reviewed,
    failed: false,
  };
}

const PROMPT_PREAMBLE = /^Treat finding text[\s\S]*?\n\n/;
const PROMPT_TRAILER = /\n*After applying the fix[\s\S]*$/;

/** The code fence that follows a `<summary>` with this title, without CodeRabbit's framing. */
function promptBlocks(body: string, summary: string): string[] {
  const blocks: string[] = [];
  const pattern = new RegExp(
    `<summary>${summary}</summary>\\s*\`\`\`\\n([\\s\\S]*?)\`\`\``,
    "g",
  );
  for (const match of body.matchAll(pattern)) {
    const text = match[1]
      .replace(PROMPT_PREAMBLE, "")
      .replace(PROMPT_TRAILER, "")
      .trim();
    if (text !== "") blocks.push(text);
  }
  return blocks;
}

/**
 * The findings a CodeRabbit review carries only in its body: outside-diff
 * comments, nitpicks and the like, which have no thread to resolve. Its
 * "Inline comments" section is dropped, since each of those is a thread.
 */
export function findingsFromReview(body: string): string | null {
  const sections = promptBlocks(
    body,
    "🤖 Prompt to fix review comments",
  ).flatMap((block) =>
    block
      .split(/\n(?=[A-Z][\w -]* comments:\n)/)
      .map((section) => section.trim()),
  );
  const kept = sections.filter(
    (section) => !section.startsWith("Inline comments:"),
  );
  return kept.length === 0 ? null : kept.join("\n\n");
}

/** A thread's finding: CodeRabbit's agent prompt when it has one, else the comment without markup. */
export function findingFromThread(body: string): string {
  const [prompt] = promptBlocks(body, "🤖 Prompt for AI Agents");
  if (prompt !== undefined) return prompt;
  const text = body
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<details>[\s\S]*?<\/details>/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > FINDING_LIMIT
    ? `${text.slice(0, FINDING_LIMIT)}…`
    : text;
}

const EXIT_CODES: Record<Verdict["verdict"], number> = {
  READY: 0,
  MERGED: 0,
  CONFLICTS: 2,
  THREADS: 3,
  FINDINGS: 3,
  CHECKS: 4,
  WAITING: 5,
  GATE: 6,
  CLOSED: 6,
};

function isBotOrRequest(comment: { author: string; body: string }): boolean {
  return (
    /\[bot\]$|^coderabbitai$|^github-actions$/.test(comment.author) ||
    comment.body.trim().startsWith("@coderabbitai")
  );
}

/**
 * Review-body findings on the head commit that nobody has answered yet. They
 * have no thread, so the answer is a top-level comment posted after the review.
 */
function unansweredReviewFindings(pr: PrSnapshot): string | null {
  const review = pr.coderabbitReviews
    .filter((candidate) => candidate.commit === pr.head)
    .at(-1);
  if (review === undefined) return null;
  const findings = findingsFromReview(review.body);
  const answered = pr.comments.some(
    (comment) =>
      comment.createdAt > review.submittedAt && !isBotOrRequest(comment),
  );
  return answered ? null : findings;
}

function gateReason(pr: PrSnapshot): string | null {
  if (pr.isDraft) return "draft";
  if (pr.reviewDecision === "CHANGES_REQUESTED") return "changes requested";
  if (pr.mergeState === "BLOCKED") return "blocked by branch protection";
  return null;
}

/** The first verdict whose condition holds, in precedence order; READY when none does. */
function firstVerdict(
  rules: [Verdict["verdict"], boolean][],
): Verdict["verdict"] {
  return rules.find(([, holds]) => holds)?.[0] ?? "READY";
}

export function classify(pr: PrSnapshot, now: number): Verdict {
  const checks = summarizeChecks(pr.rollup, pr.base);
  const coderabbit = coderabbitState(pr, now);
  const pending = [...checks.pending];
  if (!coderabbit.done) pending.push(CODERABBIT_CONTEXT);
  if (pr.mergeState === "BEHIND") pending.push("update-branch");
  if (pr.mergeState === "UNKNOWN") pending.push("merge-state");
  const failed = coderabbit.failed
    ? [...checks.failed, { name: CODERABBIT_CONTEXT, workflow: "", link: "" }]
    : checks.failed;
  const threads = pr.threads
    .filter((thread) => !thread.isResolved)
    .map((thread) => ({
      id: thread.id,
      path: thread.path,
      line: thread.line,
      author: thread.comments[0]?.author ?? "",
      outdated: thread.isOutdated,
      replies: Math.max(thread.comments.length - 1, 0),
      finding: findingFromThread(thread.comments[0]?.body ?? ""),
    }));
  const reviewFindings = unansweredReviewFindings(pr);
  const gate = gateReason(pr);

  // CHECKS precedes GATE because a failing required check also reads as
  // mergeState BLOCKED: the other order would call every red run a gate.
  const verdict = firstVerdict([
    ["MERGED", pr.state === "MERGED" || pr.mergedAt !== null],
    ["CLOSED", pr.state === "CLOSED"],
    ["CONFLICTS", pr.mergeable === "CONFLICTING" || pr.mergeState === "DIRTY"],
    ["WAITING", pending.length > 0],
    ["THREADS", threads.length > 0],
    ["FINDINGS", reviewFindings !== null],
    ["CHECKS", failed.length > 0],
    ["GATE", gate !== null],
  ]);

  return {
    verdict,
    exitCode: EXIT_CODES[verdict],
    pr: pr.number,
    head: pr.head.slice(0, 7),
    mergeState: pr.mergeState,
    pending,
    failed,
    threads,
    reviewFindings,
    gate,
    coderabbitPasses: pr.coderabbitReviews.length,
  };
}

function gh(args: string[]): string {
  const result = spawnSync("gh", args, { encoding: "utf8" });
  if (result.status !== 0)
    throw new Error(
      `gh ${args.slice(0, 3).join(" ")} failed: ${result.stderr.trim()}`,
    );
  return result.stdout;
}

const THREADS_QUERY = `
query($owner:String!,$repo:String!,$number:Int!){
  repository(owner:$owner,name:$repo){ pullRequest(number:$number){
    reviewThreads(first:100){ nodes{
      id isResolved isOutdated path line originalLine
      comments(first:20){ nodes{ author{login} body } } } } } } }`;

type GraphqlThread = {
  id: string;
  isResolved: boolean;
  isOutdated: boolean;
  path: string;
  line: number | null;
  originalLine: number | null;
  comments: { nodes: { author: { login: string } | null; body: string }[] };
};

function readSnapshot(number: number): PrSnapshot {
  const fields =
    "state,mergedAt,isDraft,headRefOid,baseRefName,mergeable,mergeStateStatus,reviewDecision,statusCheckRollup,comments";
  const view = JSON.parse(gh(["pr", "view", String(number), "--json", fields]));
  const threadData = JSON.parse(
    gh([
      "api",
      "graphql",
      "-f",
      `query=${THREADS_QUERY}`,
      "-F",
      "owner={owner}",
      "-F",
      "repo={repo}",
      "-F",
      `number=${number}`,
    ]),
  );
  const reviews: {
    user: { login: string } | null;
    commit_id: string;
    submitted_at: string | null;
    body: string | null;
  }[] = JSON.parse(
    gh([
      "api",
      "--paginate",
      "--slurp",
      `repos/{owner}/{repo}/pulls/${number}/reviews?per_page=100`,
    ]),
  ).flat();

  return {
    number,
    state: view.state,
    mergedAt: view.mergedAt ?? null,
    isDraft: view.isDraft,
    head: view.headRefOid,
    base: view.baseRefName,
    mergeable: view.mergeable,
    mergeState: view.mergeStateStatus,
    reviewDecision: view.reviewDecision ?? "",
    rollup: view.statusCheckRollup ?? [],
    threads: (
      threadData.data.repository.pullRequest.reviewThreads
        .nodes as GraphqlThread[]
    ).map((thread) => ({
      id: thread.id,
      isResolved: thread.isResolved,
      isOutdated: thread.isOutdated,
      path: thread.path,
      line: thread.line ?? thread.originalLine,
      comments: thread.comments.nodes.map((comment) => ({
        author: comment.author?.login ?? "",
        body: comment.body,
      })),
    })),
    coderabbitReviews: reviews
      .filter(
        (review) =>
          review.user?.login.startsWith("coderabbitai") &&
          review.submitted_at !== null,
      )
      .map((review) => ({
        commit: review.commit_id,
        submittedAt: review.submitted_at ?? "",
        body: review.body ?? "",
      })),
    comments: (
      view.comments as {
        author: { login: string } | null;
        body: string;
        createdAt: string;
      }[]
    ).map((comment) => ({
      author: comment.author?.login ?? "",
      body: comment.body,
      createdAt: comment.createdAt,
    })),
  };
}

function currentBranchPr(): number {
  return Number(
    gh(["pr", "view", "--json", "number", "--jq", ".number"]).trim(),
  );
}

async function watch(options: Options): Promise<number> {
  const number = options.pr ?? currentBranchPr();
  const started = Date.now();
  let failures = 0;
  for (;;) {
    try {
      const verdict = classify(readSnapshot(number), Date.now());
      failures = 0;
      const outOfTime =
        Date.now() - started + options.interval * 1000 > options.timeout * 1000;
      if (verdict.verdict !== "WAITING" || options.once || outOfTime) {
        console.log(JSON.stringify(verdict));
        return verdict.exitCode;
      }
      await delay(options.interval * 1000);
    } catch (error) {
      failures += 1;
      if (failures >= MAX_GH_FAILURES) {
        console.log(
          JSON.stringify({
            verdict: "GH_FAILED",
            exitCode: 7,
            pr: number,
            error: String(error),
          }),
        );
        return 7;
      }
      await delay(Math.min(options.interval * 2 ** failures, 300) * 1000);
    }
  }
}

async function main() {
  try {
    process.exitCode = await watch(parseArgs(process.argv.slice(2)));
  } catch (error) {
    console.error(
      `pr-watch: ${error instanceof Error ? error.message : String(error)}`,
    );
    if (error instanceof UsageError)
      console.error(
        "usage: pnpm pr:watch [pr] [--once] [--interval <s>] [--timeout <s>]",
      );
    process.exitCode = 1;
  }
}

if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1] ?? "")) {
  await main();
}
