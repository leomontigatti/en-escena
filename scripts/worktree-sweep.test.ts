import { describe, expect, it } from "vitest";

import {
  type BranchFacts,
  type WorktreeFacts,
  branchSweepVerdict,
  classifyBranch,
  classifyWorktree,
  isManagedByT3,
  parseAcceptedList,
  t3WorktreeFolders,
  parseSweepArgs,
  sweepVerdict,
} from "./worktree-sweep";

const merged: WorktreeFacts = {
  path: "/wt/t3code-1",
  branch: "t3code/1",
  dirty: false,
  commitsNotOnRemote: 0,
  commitsAheadOfMaster: 3,
  inUseBy: undefined,
  pullRequest: { number: 10, state: "MERGED" },
};

describe("classifyWorktree", () => {
  it("removes a worktree whose PR merged", () => {
    expect(classifyWorktree(merged)).toEqual({
      remove: true,
      reason: "PR #10 merged",
    });
  });

  it("removes a worktree whose PR was closed", () => {
    expect(
      classifyWorktree({
        ...merged,
        pullRequest: { number: 11, state: "CLOSED" },
      }),
    ).toEqual({ remove: true, reason: "PR #11 closed" });
  });

  it("removes a thread that never committed", () => {
    expect(
      classifyWorktree({
        ...merged,
        commitsAheadOfMaster: 0,
        pullRequest: undefined,
      }),
    ).toEqual({ remove: true, reason: "no PR and no commits beyond master" });
  });

  it("removes a fallow audit cache", () => {
    expect(
      classifyWorktree({
        ...merged,
        path: "/tmp/fallow-audit-base-cache-abc",
        branch: undefined,
        pullRequest: undefined,
      }),
    ).toEqual({ remove: true, reason: "fallow audit cache" });
  });

  it.each<[string, Partial<WorktreeFacts>, string]>([
    ["uncommitted changes", { dirty: true }, "uncommitted changes"],
    [
      "commits no remote has",
      { commitsNotOnRemote: 2 },
      "2 commits on no remote",
    ],
    [
      "a running process",
      { inUseBy: "node (pid 42)" },
      "in use by node (pid 42)",
    ],
    [
      "an open PR",
      { pullRequest: { number: 12, state: "OPEN" } },
      "PR #12 open",
    ],
    ["commits without a PR", { pullRequest: undefined }, "3 commits and no PR"],
    [
      "a detached HEAD",
      { branch: undefined, pullRequest: undefined },
      "detached HEAD",
    ],
  ])("keeps a worktree with %s", (_, facts, reason) => {
    expect(classifyWorktree({ ...merged, ...facts })).toEqual({
      remove: false,
      reason,
    });
  });

  it("keeps a worktree git could not inspect, even with a merged PR", () => {
    expect(classifyWorktree({ ...merged, unreadable: "bad object" })).toEqual({
      remove: false,
      reason: "could not inspect: bad object",
    });
  });

  it("keeps a worktree the user named with --keep, by folder, full path or branch", () => {
    expect(sweepVerdict(merged, { keep: ["t3code-1"] })).toEqual({
      remove: false,
      reason: "kept on request",
    });
    expect(sweepVerdict(merged, { keep: ["/wt/t3code-1"] }).remove).toBe(false);
    expect(sweepVerdict(merged, { keep: ["t3code-2"] }).remove).toBe(true);
    expect(sweepVerdict(merged, { keep: ["t3code/1"] }).remove).toBe(false);
  });

  it("keeps a removable worktree the accepted dry run did not list", () => {
    expect(
      sweepVerdict(merged, { accepted: new Set(["/wt/t3code-2"]) }),
    ).toEqual({ remove: false, reason: "not in the accepted dry run" });
    expect(
      sweepVerdict(merged, { accepted: new Set(["/wt/t3code-1"]) }).remove,
    ).toBe(true);
  });

  it("puts unsaved work ahead of a merged PR", () => {
    expect(classifyWorktree({ ...merged, dirty: true }).remove).toBe(false);
  });
});

describe("isManagedByT3", () => {
  const folders = ["/home/me/.t3/worktrees", "/data/wt"];

  it.each([
    "/home/me/.t3/worktrees/en-escena/fix-x",
    "/data/wt/en-escena/fix-y",
  ])("claims %s, inside one of T3's worktree folders", (worktreePath) => {
    expect(isManagedByT3(worktreePath, folders)).toBe(true);
  });

  it.each([
    "/home/me/projects/en-escena/.claude/worktrees/agent-1",
    "/tmp/fallow-audit-base-cache-abc",
    "/home/me/.t3/worktrees-old/en-escena/fix-x",
    "/home/me/.t3/worktrees",
  ])("leaves %s to the sweep", (worktreePath) => {
    expect(isManagedByT3(worktreePath, folders)).toBe(false);
  });
});

describe("t3WorktreeFolders", () => {
  it("adds the worktreesDirectory setting and the folders it held before", () => {
    expect(
      t3WorktreeFolders(
        "/home/me/.t3",
        JSON.stringify({
          worktreesDirectory: "~/wt",
          previousWorktreesDirectories: ["/old/wt", "relative/wt", ""],
        }),
        "/home/me",
      ),
    ).toEqual(["/home/me/.t3/worktrees", "/home/me/wt", "/old/wt"]);
  });

  it("is T3's own folder alone without settings", () => {
    expect(t3WorktreeFolders("/home/me/.t3", undefined)).toEqual([
      "/home/me/.t3/worktrees",
    ]);
  });

  it("refuses settings it cannot read rather than guess T3's worktrees", () => {
    expect(() => t3WorktreeFolders("/home/me/.t3", "{not json")).toThrow(
      /settings\.json/,
    );
  });
});

const mergedBranch: BranchFacts = {
  branch: "fix/x",
  commitsNotOnRemote: 0,
  commitsAheadOfMaster: 3,
  pullRequest: { number: 10, state: "MERGED" },
};

describe("classifyBranch", () => {
  it.each<[string, Partial<BranchFacts>, string]>([
    ["a merged PR", {}, "PR #10 merged"],
    [
      "a closed PR",
      { pullRequest: { number: 11, state: "CLOSED" } },
      "PR #11 closed",
    ],
    [
      "no PR and no commits",
      { pullRequest: undefined, commitsAheadOfMaster: 0 },
      "no PR and no commits beyond master",
    ],
  ])("deletes a branch with %s", (_, facts, reason) => {
    expect(classifyBranch({ ...mergedBranch, ...facts })).toEqual({
      remove: true,
      reason,
    });
  });

  it.each<[string, Partial<BranchFacts>, string]>([
    [
      "commits no remote has",
      { commitsNotOnRemote: 2 },
      "2 commits on no remote",
    ],
    [
      "an open PR",
      { pullRequest: { number: 12, state: "OPEN" } },
      "PR #12 open",
    ],
    ["commits without a PR", { pullRequest: undefined }, "3 commits and no PR"],
    [
      "an unreadable head",
      { unreadable: "bad object" },
      "could not inspect: bad object",
    ],
  ])("keeps a branch with %s", (_, facts, reason) => {
    expect(classifyBranch({ ...mergedBranch, ...facts })).toEqual({
      remove: false,
      reason,
    });
  });

  it("spares a branch named with --keep and one the dry run did not list", () => {
    expect(branchSweepVerdict(mergedBranch, { keep: ["fix/x"] })).toEqual({
      remove: false,
      reason: "kept on request",
    });
    expect(
      branchSweepVerdict(mergedBranch, { accepted: new Set(["fix/y"]) }),
    ).toEqual({ remove: false, reason: "not in the accepted dry run" });
    expect(
      branchSweepVerdict(mergedBranch, { accepted: new Set(["fix/x"]) }).remove,
    ).toBe(true);
  });
});

describe("parseSweepArgs", () => {
  it("reads --apply and every --keep", () => {
    expect(
      parseSweepArgs(["--keep", "t3code-1", "--apply", "--keep", "t3code-2"]),
    ).toEqual({ apply: true, keep: ["t3code-1", "t3code-2"] });
    expect(parseSweepArgs([])).toEqual({ apply: false, keep: [] });
  });

  it.each([
    [["--keep"]],
    [["--keep", "--apply"]],
    [["--keep", "-x"]],
    [["--apply", "--kep", "t3code-1"]],
  ])("refuses %j rather than sweep without the intended exclusion", (args) => {
    expect(() => parseSweepArgs(args)).toThrow();
  });
});

describe("parseAcceptedList", () => {
  it("reads the paths the dry run saved", () => {
    expect(parseAcceptedList('["/wt/a","/wt/b"]', "list.json")).toEqual(
      new Set(["/wt/a", "/wt/b"]),
    );
  });

  it.each(["{not json", '{"path":"/wt/a"}', "[1]"])(
    "refuses %j, naming the file, rather than sweep from it",
    (text) => {
      expect(() => parseAcceptedList(text, "list.json")).toThrow(/list\.json/);
    },
  );
});
