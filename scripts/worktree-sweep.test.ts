import { describe, expect, it } from "vitest";

import {
  type WorktreeFacts,
  classifyWorktree,
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

  it("keeps a worktree the user named with --keep, by folder or full path", () => {
    expect(sweepVerdict(merged, { keep: ["t3code-1"] })).toEqual({
      remove: false,
      reason: "kept on request",
    });
    expect(sweepVerdict(merged, { keep: ["/wt/t3code-1"] }).remove).toBe(false);
    expect(sweepVerdict(merged, { keep: ["t3code-2"] }).remove).toBe(true);
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
    [["--apply", "--kep", "t3code-1"]],
  ])("refuses %j rather than sweep without the intended exclusion", (args) => {
    expect(() => parseSweepArgs(args)).toThrow();
  });
});
