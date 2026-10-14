import { execFileSync } from "node:child_process";
import {
  existsSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { git, prune, run } from "./worktree-db";

// `pnpm worktree:sweep` cleans up after finished threads what T3 Code's
// storage cleanup does not (docs/agents/t3-dependencies.md). T3 removes the
// worktrees it made, in its worktree folders, once their PR merges or their
// last thread is deleted; the sweep only reports those. It removes the other
// worktrees (Agent-tool ones under `.claude/worktrees/`, fallow audit caches),
// deletes local branches no worktree holds, T3's leftovers included, and drops
// the `en-escena-wt-*` database of every worktree that is gone
// (`pnpm db:worktree`). It lists by default and acts only with `--apply`.
// A worktree or branch goes only when nothing in it can be lost: its PR merged
// or closed, or it never committed; no uncommitted change, no commit that is on
// neither a remote nor the PR, and no process running inside. Every other one
// is kept and reported with the reason, as is each one named with `--keep
// <folder, path or branch>` (repeatable). `--apply` removes only what the last
// dry run listed, the list the user accepted: anything that became removable
// since waits for the next dry run. Run by the `housekeeping` skill.

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

type SweepOptions = {
  /** Folders, paths or branches the user spared with `--keep`. */
  keep?: readonly string[];
  /** The worktree paths and branches the accepted dry run listed; `--apply` only. */
  accepted?: ReadonlySet<string>;
};

function withUserSay(
  verdict: Verdict,
  key: string,
  names: readonly string[],
  { keep = [], accepted }: SweepOptions,
): Verdict {
  if (keep.some((name) => names.includes(name))) {
    return { remove: false, reason: "kept on request" };
  }
  if (verdict.remove && accepted && !accepted.has(key)) {
    return { remove: false, reason: "not in the accepted dry run" };
  }

  return verdict;
}

/** `classifyWorktree`, then the user's say: `--keep` and the accepted list. */
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
    options,
  );
}

/** `classifyBranch`, then the user's say: `--keep` and the accepted list. */
export function branchSweepVerdict(
  facts: BranchFacts,
  options: SweepOptions = {},
): Verdict {
  return withUserSay(
    classifyBranch(facts),
    facts.branch,
    [facts.branch],
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
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return { apply, keep };
}

// In the shared git dir, so the dry run and `--apply` agree from any worktree.
function acceptedListFile() {
  return path.resolve(
    git(["rev-parse", "--git-common-dir"]),
    "worktree-sweep-accepted.json",
  );
}

function readAcceptedList(): Set<string> {
  const file = acceptedListFile();

  if (!existsSync(file)) {
    throw new Error(
      "No dry run to apply: run `pnpm worktree:sweep` first, and `--apply` removes what it listed.",
    );
  }

  return parseAcceptedList(readFileSync(file, "utf8"), file);
}

export function parseAcceptedList(text: string, file: string): Set<string> {
  let paths: unknown;

  try {
    paths = JSON.parse(text);
  } catch {
    paths = undefined;
  }

  if (
    !Array.isArray(paths) ||
    !paths.every((entry) => typeof entry === "string")
  ) {
    throw new Error(
      `${file} is not a list of worktree paths and branches: run \`pnpm worktree:sweep\` again to rewrite it.`,
    );
  }

  return new Set(paths);
}

function sweep({ apply, keep }: { apply: boolean; keep: string[] }) {
  const accepted = apply ? readAcceptedList() : undefined;

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
    verdict: sweepVerdict(facts, { keep, accepted }),
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
    verdict: branchSweepVerdict(facts, { keep, accepted }),
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
    `\nLeft to T3's storage cleanup ${leftToT3.length} (Settings → Storage → Last run says why one stays):`,
  );
  for (const { path: p, branch } of leftToT3)
    console.log(`  ${p}  ${branch ?? ""}`);
  console.log("");

  if (!apply) {
    // Written beside the target and renamed over it, so an interrupted write
    // cannot leave a truncated accepted list behind.
    const listFile = acceptedListFile();
    const tempFile = `${listFile}.${process.pid}.tmp`;
    writeFileSync(
      tempFile,
      JSON.stringify([
        ...removed.map(({ facts }) => facts.path),
        ...deleted.map(({ facts }) => facts.branch),
      ]),
    );
    renameSync(tempFile, listFile);
    prune(true, [
      ...kept.map(({ facts }) => facts.path),
      ...leftToT3.map(({ path: p }) => p),
    ]);
    console.log("\nNothing changed. Re-run with --apply to remove the above.");
    return;
  }

  removed.forEach(removeWorktree);
  deleted.forEach(deleteBranch);
  rmSync(acceptedListFile(), { force: true });
  // Re-listed rather than taken from `kept`: a removal that failed keeps its
  // worktree, and with it its database.
  prune(false);
}

if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1] ?? "")) {
  try {
    sweep(parseSweepArgs(process.argv.slice(2)));
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
