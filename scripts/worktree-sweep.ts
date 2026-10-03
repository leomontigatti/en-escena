import { execFileSync } from "node:child_process";
import {
  existsSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { git, prune, run } from "./worktree-db";

// `pnpm worktree:sweep` removes the worktrees threads left behind, then drops
// their databases (`pnpm db:worktree`). It lists by default and acts only with
// `--apply`. A worktree goes only when nothing in it can be lost: its PR merged
// or closed, or it never committed; no uncommitted change, no commit that is on
// neither a remote nor the PR, and no process running inside it. Every other
// worktree is kept and reported with the reason, as is each one named with
// `--keep <folder or path>` (repeatable). `--apply` removes only what the last
// dry run listed, the list the user accepted: a thread that became removable
// since waits for the next dry run. Run by the `housekeeping` skill.

type PullRequest = { number: number; state: "OPEN" | "MERGED" | "CLOSED" };

export type WorktreeFacts = {
  path: string;
  branch: string | undefined;
  dirty: boolean;
  commitsNotOnRemote: number;
  commitsAheadOfMaster: number;
  inUseBy: string | undefined;
  /** Git could not answer one of the questions above. */
  unreadable?: string;
  pullRequest: PullRequest | undefined;
};

type Verdict = { remove: boolean; reason: string };

const FALLOW_CACHE = /^fallow-audit-base-cache-/;

type SweepOptions = {
  /** Folders or paths the user spared with `--keep`. */
  keep?: readonly string[];
  /** The paths the accepted dry run listed for removal; `--apply` only. */
  accepted?: ReadonlySet<string>;
};

/** `classifyWorktree`, then the user's say: `--keep` and the accepted list. */
export function sweepVerdict(
  facts: WorktreeFacts,
  { keep = [], accepted }: SweepOptions = {},
): Verdict {
  if (
    keep.some(
      (name) => name === facts.path || name === path.basename(facts.path),
    )
  ) {
    return { remove: false, reason: "kept on request" };
  }

  const verdict = classifyWorktree(facts);

  if (verdict.remove && accepted && !accepted.has(facts.path)) {
    return { remove: false, reason: "not in the accepted dry run" };
  }

  return verdict;
}

export function classifyWorktree(facts: WorktreeFacts): Verdict {
  const keep = (reason: string) => ({ remove: false, reason });
  const remove = (reason: string) => ({ remove: true, reason });

  if (facts.unreadable) return keep(`could not inspect: ${facts.unreadable}`);
  if (facts.inUseBy) return keep(`in use by ${facts.inUseBy}`);
  if (facts.dirty) return keep("uncommitted changes");
  if (FALLOW_CACHE.test(path.basename(facts.path))) {
    return remove("fallow audit cache");
  }
  if (facts.commitsNotOnRemote > 0) {
    return keep(`${facts.commitsNotOnRemote} commits on no remote`);
  }
  if (!facts.branch) return keep("detached HEAD");

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
  return worktrees.slice(1);
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

function gatherFacts(): WorktreeFacts[] {
  const pullRequests = pullRequestsByBranch();
  const processes = processesByCwd();

  return listWorktrees().map(({ path: worktreePath, branch }) => {
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
  const head = git(["-C", worktreePath, "rev-parse", "HEAD"]);

  return {
    path: worktreePath,
    branch,
    dirty: git(["-C", worktreePath, "status", "--porcelain"]) !== "",
    // A squash-merged branch is often deleted from origin afterwards; its
    // commits are safe when the PR's head holds them.
    commitsNotOnRemote:
      pr && isAncestor(head, pr.headRefOid)
        ? 0
        : count([head, "--not", "--remotes"]),
    commitsAheadOfMaster: count([`origin/master..${head}`]),
    inUseBy,
    pullRequest: pr && { number: pr.number, state: pr.state },
  };
}

type Judged = { facts: WorktreeFacts; verdict: Verdict };

function printList(title: string, judged: Judged[]) {
  console.log(`\n${title} ${judged.length}:`);

  for (const { facts, verdict } of judged) {
    console.log(`  ${facts.path}  ${facts.branch ?? ""}  (${verdict.reason})`);
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
        throw new Error("--keep needs a worktree folder or path after it.");
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
      `${file} is not a list of worktree paths: run \`pnpm worktree:sweep\` again to rewrite it.`,
    );
  }

  return new Set(paths);
}

function sweep({ apply, keep }: { apply: boolean; keep: string[] }) {
  const accepted = apply ? readAcceptedList() : undefined;

  run("git", ["worktree", "prune"]);
  run("git", ["fetch", "--quiet", "origin"]);

  const judged = gatherFacts().map((facts) => ({
    facts,
    verdict: sweepVerdict(facts, { keep, accepted }),
  }));
  const removed = judged.filter(({ verdict }) => verdict.remove);
  const kept = judged.filter(({ verdict }) => !verdict.remove);

  printList(apply ? "Removing" : "Would remove", removed);
  printList("Keeping", kept);
  console.log("");

  if (!apply) {
    writeFileSync(
      acceptedListFile(),
      JSON.stringify(removed.map(({ facts }) => facts.path)),
    );
    prune(
      true,
      kept.map(({ facts }) => facts.path),
    );
    console.log("\nNothing changed. Re-run with --apply to remove the above.");
    return;
  }

  removed.forEach(removeWorktree);
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
