import { execFileSync } from "node:child_process";
import {
  existsSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { git, prune, run, worktreePaths } from "./worktree-db";

// `pnpm worktree:sweep` cleans up after finished threads what T3 Code's
// storage cleanup does not (docs/agents/t3-dependencies.md). T3 removes the
// worktrees it made, in its worktree folders, once their PR merges or their
// last thread is deleted; the sweep only reports those. It removes the other
// worktrees (Agent-tool ones under `.claude/worktrees/`, fallow audit caches),
// deletes local branches no worktree holds, T3's leftovers included, and drops
// the `en-escena-wt-*` database and storage folder of every worktree that is
// gone (`pnpm db:worktree`). It lists by default and acts only with `--apply`.
// A worktree or branch goes only when nothing in it can be lost: its PR merged
// or closed, or it never committed; no uncommitted change, no commit that is on
// neither a remote nor the PR, no process running inside, and no live thread
// holding its branch or path. T3 removes a paused thread's worktree and
// recreates it from the kept branch on resume, so a missing worktree is not
// finished work: `--threads <file>` (required) lists every live thread's branch
// and worktree path, and what one holds is kept, its database included. Every
// other one is kept and reported with the reason, as is each one named with
// `--keep <folder, path or branch>` (repeatable). `--apply` removes only what
// the last dry run listed, databases included, the list the user accepted:
// anything that became removable since waits for the next dry run. Run by the
// `housekeeping` skill (docs/agents/housekeeping.md).

type PullRequest = { number: number; state: "OPEN" | "MERGED" | "CLOSED" };

export type BranchFacts = {
  branch: string;
  commitsNotOnRemote: number;
  commitsAheadOfMaster: number;
  /** Git could not answer one of the questions above. */
  unreadable?: string;
  pullRequest: PullRequest | undefined;
};

export type WorktreeFacts = Omit<BranchFacts, "branch"> & {
  path: string;
  branch: string | undefined;
  dirty: boolean;
  inUseBy: string | undefined;
};

type Verdict = { remove: boolean; reason: string };

const FALLOW_CACHE = /^fallow-audit-base-cache-/;

const T3_HOME =
  process.env.T3CODE_HOME?.trim() || path.join(os.homedir(), ".t3");

// The folders whose worktrees T3's storage cleanup counts as its own, as its
// `managedWorktreesDirectories` lists them: `<T3 home>/worktrees`, the
// "worktreesDirectory" setting and the folders that setting held before.
export function t3WorktreeFolders(
  t3Home: string,
  settingsText: string | undefined,
  userHome = os.homedir(),
): string[] {
  const folders = [path.join(t3Home, "worktrees")];
  let settings: unknown;

  try {
    settings = settingsText === undefined ? {} : JSON.parse(settingsText);
  } catch {
    throw new Error(
      "Could not read T3's settings.json, so the sweep cannot tell T3's worktrees from its own.",
    );
  }

  const { worktreesDirectory, previousWorktreesDirectories } = (settings ??
    {}) as Record<string, unknown>;

  for (const setting of [
    worktreesDirectory,
    ...(Array.isArray(previousWorktreesDirectories)
      ? previousWorktreesDirectories
      : []),
  ]) {
    if (typeof setting !== "string" || setting === "") continue;

    const expanded = setting.replace(/^~(?=$|[\\/])/, userHome);

    if (path.isAbsolute(expanded)) folders.push(path.resolve(expanded));
  }

  return folders;
}

function readT3WorktreeFolders(): string[] {
  const settingsFile = path.join(T3_HOME, "userdata", "settings.json");

  return t3WorktreeFolders(
    T3_HOME,
    existsSync(settingsFile) ? readFileSync(settingsFile, "utf8") : undefined,
  ).map(canonical);
}

// T3 compares canonical paths, so a symlinked home still matches.
function canonical(target: string): string {
  return existsSync(target) ? realpathSync(target) : target;
}

export function isManagedByT3(
  worktreePath: string,
  t3Folders: readonly string[],
): boolean {
  return t3Folders.some((folder) => {
    const relative = path.relative(folder, worktreePath);

    return (
      relative !== "" &&
      !relative.startsWith("..") &&
      !path.isAbsolute(relative)
    );
  });
}

/** What the threads T3 still runs hold: a thread that exists, not settled, not archived. */
export type LiveThreads = {
  branches: ReadonlySet<string>;
  worktreePaths: ReadonlySet<string>;
};

type LiveThread = {
  branch: string | undefined;
  worktreePath: string | undefined;
};

function isStringOrNothing(value: unknown): value is string | null | undefined {
  return value === null || value === undefined || typeof value === "string";
}

function readLiveThread(entry: unknown): LiveThread | undefined {
  if (typeof entry !== "object" || entry === null) return undefined;

  const { branch, worktreePath } = entry as Record<string, unknown>;

  if (!isStringOrNothing(branch) || !isStringOrNothing(worktreePath)) {
    return undefined;
  }

  // A thread with neither is a read that came back empty, not a thread.
  if (!branch && !worktreePath) return undefined;

  return {
    branch: branch || undefined,
    worktreePath: worktreePath || undefined,
  };
}

export function parseLiveThreads(text: string, file: string): LiveThreads {
  const refuse = () =>
    new Error(
      `${file} is not a list of live threads ({"branch", "worktreePath"} each, from t3_thread_read): the sweep will not guess which branches a paused thread still needs.`,
    );
  let entries: unknown;

  try {
    entries = JSON.parse(text);
  } catch {
    throw refuse();
  }
  // The thread running the sweep is live itself, so an empty list is a survey
  // that failed, never a machine with no threads.
  if (!Array.isArray(entries) || entries.length === 0) throw refuse();

  const threads = (entries as unknown[]).map(readLiveThread);

  if (threads.includes(undefined)) throw refuse();

  const live = threads as LiveThread[];

  return {
    branches: new Set(live.flatMap(({ branch }) => (branch ? [branch] : []))),
    worktreePaths: new Set(
      live.flatMap(({ worktreePath }) => (worktreePath ? [worktreePath] : [])),
    ),
  };
}

type SweepOptions = {
  /** Folders, paths or branches the user spared with `--keep`. */
  keep?: readonly string[];
  /** The live threads' branches and worktree paths, from `--threads`. */
  live?: LiveThreads;
  /** What the accepted dry run listed of this kind (worktree paths or branches); `--apply` only. */
  accepted?: ReadonlySet<string>;
};

function isHeldByLiveThread(
  { branch, path: worktreePath }: { branch?: string; path?: string },
  live: LiveThreads | undefined,
): boolean {
  if (!live) return false;

  return (
    (branch !== undefined && live.branches.has(branch)) ||
    (worktreePath !== undefined && live.worktreePaths.has(worktreePath))
  );
}

function withUserSay(
  verdict: Verdict,
  key: string,
  names: readonly string[],
  held: { branch?: string; path?: string },
  { keep = [], live, accepted }: SweepOptions,
): Verdict {
  if (keep.some((name) => names.includes(name))) {
    return { remove: false, reason: "kept on request" };
  }
  if (verdict.remove && isHeldByLiveThread(held, live)) {
    return { remove: false, reason: "live thread" };
  }
  if (verdict.remove && accepted && !accepted.has(key)) {
    return { remove: false, reason: "not in the accepted dry run" };
  }

  return verdict;
}

/** `classifyWorktree`, then the user's say: `--keep`, the live threads and the accepted list. */
export function sweepVerdict(
  facts: WorktreeFacts,
  options: SweepOptions = {},
): Verdict {
  return withUserSay(
    classifyWorktree(facts),
    facts.path,
    [
      facts.path,
      path.basename(facts.path),
      ...(facts.branch ? [facts.branch] : []),
    ],
    { branch: facts.branch, path: facts.path },
    options,
  );
}

/** `classifyBranch`, then the user's say: `--keep`, the live threads and the accepted list. */
export function branchSweepVerdict(
  facts: BranchFacts,
  options: SweepOptions = {},
): Verdict {
  return withUserSay(
    classifyBranch(facts),
    facts.branch,
    [facts.branch],
    { branch: facts.branch },
    options,
  );
}

export function classifyWorktree(facts: WorktreeFacts): Verdict {
  const keep = (reason: string) => ({ remove: false, reason });

  if (facts.unreadable) return keep(`could not inspect: ${facts.unreadable}`);
  if (facts.inUseBy) return keep(`in use by ${facts.inUseBy}`);
  if (facts.dirty) return keep("uncommitted changes");
  if (FALLOW_CACHE.test(path.basename(facts.path))) {
    return { remove: true, reason: "fallow audit cache" };
  }
  if (facts.commitsNotOnRemote > 0) {
    return keep(`${facts.commitsNotOnRemote} commits on no remote`);
  }
  if (!facts.branch) return keep("detached HEAD");

  return classifyBranch({ ...facts, branch: facts.branch });
}

export function classifyBranch(facts: BranchFacts): Verdict {
  const keep = (reason: string) => ({ remove: false, reason });
  const remove = (reason: string) => ({ remove: true, reason });

  if (facts.unreadable) return keep(`could not inspect: ${facts.unreadable}`);
  if (facts.commitsNotOnRemote > 0) {
    return keep(`${facts.commitsNotOnRemote} commits on no remote`);
  }

  const pr = facts.pullRequest;

  if (pr?.state === "OPEN") return keep(`PR #${pr.number} open`);
  if (pr) return remove(`PR #${pr.number} ${pr.state.toLowerCase()}`);
  if (facts.commitsAheadOfMaster > 0) {
    return keep(`${facts.commitsAheadOfMaster} commits and no PR`);
  }

  return remove("no PR and no commits beyond master");
}

type Worktree = { path: string; branch: string | undefined };

function listWorktrees(): Worktree[] {
  const worktrees: Worktree[] = [];

  for (const line of git(["worktree", "list", "--porcelain"]).split("\n")) {
    if (line.startsWith("worktree ")) {
      worktrees.push({ path: line.slice(9), branch: undefined });
    } else if (line.startsWith("branch refs/heads/")) {
      worktrees[worktrees.length - 1].branch = line.slice(18);
    }
  }

  // The first entry is always the main checkout.
  return worktrees;
}

type ListedPullRequest = PullRequest & {
  headRefName: string;
  headRefOid: string;
};

function pullRequestsByBranch(): Map<string, ListedPullRequest> {
  const listed = JSON.parse(
    execFileSync(
      "gh",
      [
        "pr",
        "list",
        "--state",
        "all",
        "--limit",
        "10000",
        "--json",
        "number,state,headRefName,headRefOid",
      ],
      { encoding: "utf8" },
    ),
  ) as ListedPullRequest[];
  const byBranch = new Map<string, ListedPullRequest>();

  // Newest first; an open PR outranks older ones on a reused branch name.
  for (const pr of listed) {
    const seen = byBranch.get(pr.headRefName);

    if (!seen || (pr.state === "OPEN" && seen.state !== "OPEN")) {
      byBranch.set(pr.headRefName, pr);
    }
  }

  return byBranch;
}

// Which process, if any, has its working directory inside each worktree: a
// thread's agent, dev server or browser still at work there.
function processesByCwd(): { cwd: string; label: string }[] {
  const found: { cwd: string; label: string }[] = [];

  for (const pid of readdirSync("/proc").filter((entry) =>
    /^\d+$/.test(entry),
  )) {
    try {
      const cwd = readlinkSync(`/proc/${pid}/cwd`);
      const comm = readFileSync(`/proc/${pid}/comm`, "utf8").trim();
      found.push({ cwd, label: `${comm} (pid ${pid})` });
    } catch {
      // Gone already, or another user's.
    }
  }

  return found;
}

function count(args: string[]): number {
  return Number(git(["rev-list", "--count", ...args]));
}

function isAncestor(commit: string, of: string): boolean {
  try {
    git(["merge-base", "--is-ancestor", commit, of]);
    return true;
  } catch {
    return false;
  }
}

function gatherFacts(
  worktrees: Worktree[],
  pullRequests: Map<string, ListedPullRequest>,
): WorktreeFacts[] {
  const processes = processesByCwd();

  return worktrees.map(({ path: worktreePath, branch }) => {
    const pr = branch ? pullRequests.get(branch) : undefined;
    const inside = processes.find(
      ({ cwd }) =>
        cwd === worktreePath || cwd.startsWith(`${worktreePath}${path.sep}`),
    );
    try {
      return inspect(worktreePath, branch, pr, inside?.label);
    } catch (error) {
      return {
        path: worktreePath,
        branch,
        dirty: false,
        commitsNotOnRemote: 0,
        commitsAheadOfMaster: 0,
        inUseBy: undefined,
        pullRequest: undefined,
        unreadable: String(error).split("\n")[0],
      };
    }
  });
}

function inspect(
  worktreePath: string,
  branch: string | undefined,
  pr: ListedPullRequest | undefined,
  inUseBy: string | undefined,
): WorktreeFacts {
  return {
    path: worktreePath,
    branch,
    dirty: git(["-C", worktreePath, "status", "--porcelain"]) !== "",
    inUseBy,
    ...commitFacts(git(["-C", worktreePath, "rev-parse", "HEAD"]), pr),
  };
}

function commitFacts(head: string, pr: ListedPullRequest | undefined) {
  return {
    // A squash-merged branch is often deleted from origin afterwards; its
    // commits are safe when the PR's head holds them.
    commitsNotOnRemote:
      pr && isAncestor(head, pr.headRefOid)
        ? 0
        : count([head, "--not", "--remotes"]),
    commitsAheadOfMaster: count([`origin/master..${head}`]),
    pullRequest: pr && { number: pr.number, state: pr.state },
  };
}

// Local branches no worktree has checked out: those of the worktrees T3
// removed (it keeps their branches) and of any removed by hand.
function gatherBranchFacts(
  checkedOut: ReadonlySet<string>,
  pullRequests: Map<string, ListedPullRequest>,
): BranchFacts[] {
  return git(["for-each-ref", "refs/heads", "--format=%(refname:short)"])
    .split("\n")
    .filter((branch) => branch !== "" && branch !== "master")
    .filter((branch) => !checkedOut.has(branch))
    .map((branch) => {
      try {
        return {
          branch,
          ...commitFacts(
            git(["rev-parse", `refs/heads/${branch}`]),
            pullRequests.get(branch),
          ),
        };
      } catch (error) {
        return {
          branch,
          commitsNotOnRemote: 0,
          commitsAheadOfMaster: 0,
          pullRequest: undefined,
          unreadable: String(error).split("\n")[0],
        };
      }
    });
}

type Judged = { facts: WorktreeFacts; verdict: Verdict };
type JudgedBranch = { facts: BranchFacts; verdict: Verdict };

function printList(title: string, judged: Judged[]) {
  console.log(`\n${title} ${judged.length}:`);

  for (const { facts, verdict } of judged) {
    console.log(`  ${facts.path}  ${facts.branch ?? ""}  (${verdict.reason})`);
  }
}

function printBranches(title: string, judged: JudgedBranch[]) {
  console.log(`\n${title} ${judged.length}:`);

  for (const { facts, verdict } of judged) {
    console.log(`  ${facts.branch}  (${verdict.reason})`);
  }
}

function deleteBranch({ facts }: JudgedBranch) {
  try {
    run("git", ["branch", "-D", facts.branch]);
  } catch (error) {
    console.error(`Left branch ${facts.branch}: ${String(error)}`);
  }
}

function removeWorktree({ facts, verdict }: Judged) {
  const force = verdict.reason === "fallow audit cache" ? ["--force"] : [];

  try {
    run("git", ["worktree", "remove", ...force, facts.path]);
    if (facts.branch) run("git", ["branch", "-D", facts.branch]);
  } catch (error) {
    console.error(`Left ${facts.path}: ${String(error)}`);
  }
}

export function parseSweepArgs(args: readonly string[]) {
  const keep: string[] = [];
  let apply = false;
  let threads: string | undefined;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--apply") {
      apply = true;
    } else if (arg === "--keep") {
      const name = args[index + 1];

      if (!name || name.startsWith("-")) {
        throw new Error(
          "--keep needs a worktree folder, path or branch after it.",
        );
      }
      keep.push(name);
      index += 1;
    } else if (arg === "--threads") {
      const file = args[index + 1];

      if (!file || file.startsWith("-")) {
        throw new Error("--threads needs the live-threads file after it.");
      }
      threads = file;
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!threads) {
    throw new Error(
      "The sweep needs --threads <file>: the live threads' branches and worktree paths, built as docs/agents/housekeeping.md says.",
    );
  }

  return { apply, keep, threads };
}

// In the shared git dir, so the dry run and `--apply` agree from any worktree.
function acceptedListFile() {
  return path.resolve(
    git(["rev-parse", "--git-common-dir"]),
    "worktree-sweep-accepted.json",
  );
}

/** What a dry run listed, kept apart so a branch can never approve a database of the same name. */
export type AcceptedList = {
  worktrees: ReadonlySet<string>;
  branches: ReadonlySet<string>;
  databases: ReadonlySet<string>;
};

function readAcceptedList(): AcceptedList {
  const file = acceptedListFile();

  if (!existsSync(file)) {
    throw new Error(
      "No dry run to apply: run `pnpm worktree:sweep` first, and `--apply` removes what it listed.",
    );
  }

  return parseAcceptedList(readFileSync(file, "utf8"), file);
}

const acceptedKinds = ["worktrees", "branches", "databases"] as const;

function isStringList(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((entry) => typeof entry === "string")
  );
}

export function parseAcceptedList(text: string, file: string): AcceptedList {
  let list: unknown;

  try {
    list = JSON.parse(text);
  } catch {
    list = undefined;
  }

  const record = (list ?? {}) as Record<string, unknown>;

  if (
    Array.isArray(list) ||
    !acceptedKinds.every((kind) => isStringList(record[kind]))
  ) {
    throw new Error(
      `${file} is not the worktrees, branches and databases of a dry run: run \`pnpm worktree:sweep\` again to rewrite it.`,
    );
  }

  return {
    worktrees: new Set(record.worktrees as string[]),
    branches: new Set(record.branches as string[]),
    databases: new Set(record.databases as string[]),
  };
}

/**
 * `--apply` judges against the live threads as they are now: a thread may have
 * resumed on a listed branch while the user read the report.
 */
export function checkThreadsFresh(
  threadsWrittenMs: number,
  dryRunWrittenMs: number,
) {
  if (threadsWrittenMs <= dryRunWrittenMs) {
    throw new Error(
      "The live-threads file predates the dry run: list the live threads again, after the dry run, then --apply.",
    );
  }
}

function sweep({
  apply,
  keep,
  threads,
}: {
  apply: boolean;
  keep: string[];
  threads: string;
}) {
  const accepted = apply ? readAcceptedList() : undefined;
  if (apply) {
    checkThreadsFresh(
      statSync(threads).mtimeMs,
      statSync(acceptedListFile()).mtimeMs,
    );
  }
  const live = parseLiveThreads(readFileSync(threads, "utf8"), threads);

  run("git", ["worktree", "prune"]);
  run("git", ["fetch", "--quiet", "origin"]);

  const [mainCheckout, ...worktrees] = listWorktrees();
  const pullRequests = pullRequestsByBranch();
  const t3Folders = readT3WorktreeFolders();
  const isT3s = ({ path: p }: Worktree) =>
    isManagedByT3(canonical(p), t3Folders);
  const leftToT3 = worktrees.filter(isT3s);
  const judged = gatherFacts(
    worktrees.filter((worktree) => !isT3s(worktree)),
    pullRequests,
  ).map((facts) => ({
    facts,
    verdict: sweepVerdict(facts, {
      keep,
      live,
      accepted: accepted?.worktrees,
    }),
  }));
  const branches = gatherBranchFacts(
    new Set(
      [mainCheckout, ...worktrees].flatMap(({ branch }) =>
        branch ? [branch] : [],
      ),
    ),
    pullRequests,
  ).map((facts) => ({
    facts,
    verdict: branchSweepVerdict(facts, {
      keep,
      live,
      accepted: accepted?.branches,
    }),
  }));
  const removed = judged.filter(({ verdict }) => verdict.remove);
  const kept = judged.filter(({ verdict }) => !verdict.remove);
  const deleted = branches.filter(({ verdict }) => verdict.remove);

  printList(apply ? "Removing" : "Would remove", removed);
  printList("Keeping", kept);
  printBranches(apply ? "Deleting branches" : "Would delete branches", deleted);
  printBranches(
    "Keeping branches",
    branches.filter(({ verdict }) => !verdict.remove),
  );
  console.log(
    `\nLeft to T3's storage cleanup ${leftToT3.length} (Settings → Maintenance → Last run says why one stays):`,
  );
  for (const { path: p, branch } of leftToT3)
    console.log(`  ${p}  ${branch ?? ""}`);
  console.log("");

  if (!apply) {
    const databases = prune(true, [
      ...kept.map(({ facts }) => facts.path),
      ...leftToT3.map(({ path: p }) => p),
      ...live.worktreePaths,
    ]);
    // Written beside the target and renamed over it, so an interrupted write
    // cannot leave a truncated accepted list behind.
    const listFile = acceptedListFile();
    const tempFile = `${listFile}.${process.pid}.tmp`;
    writeFileSync(
      tempFile,
      JSON.stringify({
        worktrees: removed.map(({ facts }) => facts.path),
        branches: deleted.map(({ facts }) => facts.branch),
        databases,
      }),
    );
    renameSync(tempFile, listFile);
    console.log("\nNothing changed. Re-run with --apply to remove the above.");
    return;
  }

  removed.forEach(removeWorktree);
  deleted.forEach(deleteBranch);
  rmSync(acceptedListFile(), { force: true });
  // Re-listed rather than taken from `kept`: a removal that failed keeps its
  // worktree, and with it its database and storage folder. Only those the dry
  // run listed go.
  prune(
    false,
    [...worktreePaths(), ...live.worktreePaths],
    accepted?.databases,
  );
}

if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1] ?? "")) {
  try {
    sweep(parseSweepArgs(process.argv.slice(2)));
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
