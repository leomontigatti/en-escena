import { spawnSync } from "node:child_process";

/**
 * Blocks until an AFK event happens on a PR or an issue, then prints one JSON
 * line and exits. The point is that a session driving an AFK chain spends one
 * turn per event instead of one per poll: run it as a background command and
 * act when it returns.
 *
 * It reads labels, reviews, threads and the required CI contexts through `gh`.
 * It never looks at workflow runs, because every `agent:implement` label also
 * fires `agent-implement-prd.yml`, which skips when the issue has no
 * sub-issues, and those skipped runs are noise a watcher would wake on.
 *
 * Usage:
 *   pnpm afk:watch pr <n> --until <review|implement|checks|merged>
 *   pnpm afk:watch issue <n> --until <pr|closed|label:<name>>
 *
 * Options: --interval <seconds> (default 150), --timeout <seconds> (default
 * 10800, 0 disables), --contexts <a,b,c> (the required CI contexts; default is
 * the four on `master`).
 *
 * Exit codes: 0 event met, 2 timeout, 1 usage or `gh` failure. On every exit
 * the last line on stdout is a JSON object with `event` and the snapshot.
 */

export const REQUIRED_CONTEXTS = [
  "checks",
  "db-gate",
  "docs-gate",
  "actions-gate",
];
const RUN_LABELS = ["agent:in-progress", "agent:review", "agent:implement"];
const PENDING_CHECK_STATES = ["missing", "queued", "in_progress", "pending"];

class UsageError extends Error {}

/** @type {Record<string, (options: Record<string, unknown>, value: string) => void>} */
const OPTION_SETTERS = {
  "--until": (options, value) => (options.until = value),
  "--interval": (options, value) => (options.interval = Number(value)),
  "--timeout": (options, value) => (options.timeout = Number(value)),
  "--contexts": (options, value) => (options.contexts = value.split(",")),
};

/** @type {Record<string, (until: string) => boolean>} */
const KNOWN_EVENTS = {
  pr: (until) => ["review", "implement", "checks", "merged"].includes(until),
  issue: (until) =>
    ["pr", "closed"].includes(until) || until.startsWith("label:"),
};

function parseTarget(kind, numberArg) {
  if (kind !== "pr" && kind !== "issue")
    throw new UsageError("first argument must be pr or issue");
  const number = Number(numberArg);
  if (!Number.isInteger(number) || number <= 0)
    throw new UsageError("second argument must be a number");
  return { kind, number };
}

function applyOptions(options, rest) {
  for (let i = 0; i < rest.length; i += 2) {
    const setter = OPTION_SETTERS[rest[i]];
    if (setter === undefined) throw new UsageError(`unknown option ${rest[i]}`);
    if (rest[i + 1] === undefined)
      throw new UsageError(`${rest[i]} needs a value`);
    setter(options, rest[i + 1]);
  }
}

function validateOptions(options) {
  if (!KNOWN_EVENTS[options.kind](options.until)) {
    throw new UsageError(`unknown ${options.kind} event "${options.until}"`);
  }
  if (!(options.interval > 0 && options.timeout >= 0)) {
    throw new UsageError("interval and timeout must be numbers");
  }
}

export function parseArgs(argv) {
  const [kind, numberArg, ...rest] = argv;
  const options = {
    ...parseTarget(kind, numberArg),
    until: "",
    interval: 150,
    timeout: 10_800,
    contexts: REQUIRED_CONTEXTS,
  };
  applyOptions(options, rest);
  validateOptions(options);
  return options;
}

function gh(args) {
  const result = spawnSync("gh", args, { encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(
      `gh ${args.slice(0, 3).join(" ")} failed: ${result.stderr.trim()}`,
    );
  }
  return result.stdout;
}

function repoSlug() {
  return gh([
    "repo",
    "view",
    "--json",
    "nameWithOwner",
    "--jq",
    ".nameWithOwner",
  ]).trim();
}

const UNRESOLVED_THREADS_QUERY = `
query($owner:String!,$repo:String!,$number:Int!){
  repository(owner:$owner,name:$repo){ pullRequest(number:$number){
    reviewThreads(first:100){ nodes{ isResolved } } } } }`;

function unresolvedThreadCount(slug, number) {
  const [owner, repo] = slug.split("/");
  const out = gh([
    "api",
    "graphql",
    "-f",
    `query=${UNRESOLVED_THREADS_QUERY}`,
    "-F",
    `owner=${owner}`,
    "-F",
    `repo=${repo}`,
    "-F",
    `number=${number}`,
    "--jq",
    "[.data.repository.pullRequest.reviewThreads.nodes[] | select(.isResolved | not)] | length",
  ]);
  return Number(out.trim());
}

/**
 * One state per required context, lower-cased: a conclusion once the run
 * finished, else its status, else "missing" when the context has not been
 * reported for this head yet.
 *
 * @param {{ name?: string, context?: string, status?: string, conclusion?: string, state?: string }[]} rollup
 * @param {string[]} contexts
 */
export function summarizeChecks(rollup, contexts) {
  /** @type {Record<string, string>} */
  const byName = {};
  for (const name of contexts) {
    const run = rollup.find(
      (entry) => entry.name === name || entry.context === name,
    );
    const state =
      run === undefined
        ? "missing"
        : [run.conclusion, run.state, run.status].find(Boolean);
    byName[name] = (state ?? "pending").toLowerCase();
  }
  const values = Object.values(byName);
  return {
    byName,
    terminal: values.every((value) => !PENDING_CHECK_STATES.includes(value)),
    green: values.every((value) => value === "success"),
  };
}

function prSnapshot(slug, number, contexts) {
  const view = JSON.parse(
    gh([
      "pr",
      "view",
      String(number),
      "--json",
      "state,mergedAt,headRefOid,labels,reviews,comments,mergeStateStatus,statusCheckRollup",
    ]),
  );
  const checks = summarizeChecks(view.statusCheckRollup ?? [], contexts);
  return {
    number,
    state: view.state,
    mergedAt: view.mergedAt,
    head: view.headRefOid,
    labels: view.labels.map((label) => label.name),
    reviews: view.reviews.filter((review) => (review.body ?? "") !== "").length,
    comments: view.comments.length,
    unresolvedThreads:
      view.state === "OPEN" ? unresolvedThreadCount(slug, number) : 0,
    mergeState: view.mergeStateStatus,
    checks: checks.byName,
    checksTerminal: checks.terminal,
    checksGreen: checks.green,
  };
}

function issueSnapshot(number) {
  const view = JSON.parse(
    gh(["issue", "view", String(number), "--json", "state,labels"]),
  );
  const prs = JSON.parse(
    gh([
      "pr",
      "list",
      "--state",
      "open",
      "--json",
      "number,headRefName",
      "--limit",
      "100",
    ]),
  );
  const prefixes = [`agent/issue-${number}-`, `agent/prd-${number}-`];
  return {
    number,
    state: view.state,
    labels: view.labels.map((label) => label.name),
    openPrs: prs
      .filter((pr) =>
        prefixes.some((prefix) => pr.headRefName.startsWith(prefix)),
      )
      .map((pr) => pr.number),
  };
}

/** @type {Record<string, (current: { state: string, openPrs: number[] }) => boolean>} */
const ISSUE_CONDITIONS = {
  closed: (current) => current.state !== "OPEN",
  pr: (current) => current.openPrs.length > 0,
};

export function issueEvent(until, current) {
  const condition =
    ISSUE_CONDITIONS[until] ??
    ((snapshot) => snapshot.labels.includes(until.slice("label:".length)));
  return condition(current) ? until : null;
}

function hasRun(snapshot) {
  return RUN_LABELS.some((label) => snapshot.labels.includes(label));
}

/**
 * "A run finished" reads as no run label on the PR (the label may be applied
 * right before the watcher starts, so its earlier presence is not required)
 * plus the run's visible effect, so a PR that never had a run does not fire.
 */
const RUN_CONDITIONS = {
  review: (baseline, current) => current.reviews > baseline.reviews,
  implement: (baseline, current) =>
    current.head !== baseline.head || current.comments > baseline.comments,
};

function terminalEvent(current) {
  if (current.state !== "OPEN") return current.mergedAt ? "merged" : "closed";
  if (current.labels.includes("agent:blocked")) return "blocked";
  return null;
}

function checksEvent(current) {
  if (!current.checksTerminal) return null;
  return current.checksGreen ? "checks-green" : "checks-red";
}

export function prEvent(until, baseline, current) {
  const terminal = terminalEvent(current);
  if (terminal !== null) return terminal;
  if (until === "checks") return checksEvent(current);
  const condition = RUN_CONDITIONS[until];
  if (condition === undefined || hasRun(current)) return null;
  return condition(baseline, current) ? until : null;
}

function sleepSeconds(seconds) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, seconds * 1000);
}

function emit(event, snapshot, code) {
  console.log(JSON.stringify({ event, ...snapshot }));
  process.exit(code);
}

function snapshotReader(options) {
  if (options.kind === "issue") return () => issueSnapshot(options.number);
  const slug = repoSlug();
  return () => prSnapshot(slug, options.number, options.contexts);
}

function watch(options) {
  const snap = snapshotReader(options);
  const baseline = snap();
  const deadline =
    options.timeout === 0 ? Infinity : Date.now() + options.timeout * 1000;
  const eventFor =
    options.kind === "pr"
      ? (current) => prEvent(options.until, baseline, current)
      : (current) => issueEvent(options.until, current);
  let current = baseline;
  for (;;) {
    const event = eventFor(current);
    if (event !== null) emit(event, current, 0);
    if (Date.now() >= deadline) emit("timeout", current, 2);
    sleepSeconds(options.interval);
    current = snap();
  }
}

function main() {
  try {
    watch(parseArgs(process.argv.slice(2)));
  } catch (error) {
    console.error(
      `afk-watch: ${error instanceof Error ? error.message : String(error)}`,
    );
    if (error instanceof UsageError) {
      console.error(
        "usage: pnpm afk:watch pr <n> --until <review|implement|checks|merged>\n" +
          "       pnpm afk:watch issue <n> --until <pr|closed|label:<name>>",
      );
    }
    process.exit(1);
  }
}

if (
  process.argv[1] !== undefined &&
  import.meta.url === new URL(process.argv[1], "file:").href
) {
  main();
}
