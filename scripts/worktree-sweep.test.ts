import { describe, expect, it } from "vitest";

import { type WorktreeFacts, classifyWorktree } from "./worktree-sweep";

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

  it("puts unsaved work ahead of a merged PR", () => {
    expect(classifyWorktree({ ...merged, dirty: true }).remove).toBe(false);
  });
});
