import { describe, expect, it } from "vitest";

import {
  cancelInProgress,
  concurrencyGroup,
  evalGha,
  PR_WORKFLOWS,
} from "./pr-workflows.test-support";

// Regression coverage for #383: the three workflows-over-a-PR (Review,
// Implement PR, Update Branch) all listen to `pull_request_target: [labeled]`
// and share the `agent-mutate-pr-<PR>` concurrency group (spec §3.5). A single
// `labeled` event starts all three runs; the two whose label doesn't match are
// no-ops, yet — because every run entered the shared group — GitHub cancelled
// the pending sibling that *should* have run (the one in the middle of the
// queue). The fix: a run only joins the shared group when its own label is the
// one that fired; otherwise it takes a unique per-run group so it can't
// cannibalise a sibling.

/** Evaluation context for a single `labeled` event on a PR. */
interface EventContext {
  labelName: string;
  prNumber: number;
  runId: string;
}

function groupFor(file: string, ctx: EventContext): string {
  return evalGha(concurrencyGroup(file), {
    "github.event.label.name": ctx.labelName,
    "github.event.pull_request.number": String(ctx.prNumber),
    "github.run_id": ctx.runId,
  });
}

describe("PR-mutating workflows concurrency (#383)", () => {
  it("keeps cancel-in-progress false on all three (spec §3.5)", () => {
    for (const { file } of PR_WORKFLOWS) {
      expect(cancelInProgress(file)).toBe("false");
    }
  });

  it("a labeled event only makes the matching workflow join the shared group", () => {
    const prNumber = 381;

    for (const fired of PR_WORKFLOWS) {
      // Simulate the single `labeled` event that adds `fired.label`: all three
      // workflows start and each computes its concurrency group.
      const groups = PR_WORKFLOWS.map((wf, i) =>
        groupFor(wf.file, {
          labelName: fired.label,
          prNumber,
          runId: `run-${i}`,
        }),
      );

      const shared = `agent-mutate-pr-${prNumber}`;

      // Exactly one run — the workflow whose label fired — joins the shared
      // group. If a no-op sibling also joined it, GitHub would cancel the
      // pending real run (the #383 bug).
      const joiners = groups.filter((g) => g === shared);
      expect(joiners).toHaveLength(1);

      // The no-op siblings each get a distinct group, so none can cancel
      // another via the shared queue.
      expect(new Set(groups).size).toBe(groups.length);
    }
  });

  it("preserves real mutual exclusion: two genuinely-running siblings share the group (spec §3.5)", () => {
    const prNumber = 381;

    // Review is mid-run (event fired `agent:review`); then Implement PR is
    // dispatched (its own `agent:implement` event). Both are real runs and must
    // land in the same shared group so they serialise, never race the branch.
    const reviewGroup = groupFor(".github/workflows/agent-review.yml", {
      labelName: "agent:review",
      prNumber,
      runId: "r1",
    });
    const implementGroup = groupFor(
      ".github/workflows/agent-implement-pr.yml",
      { labelName: "agent:implement", prNumber, runId: "r2" },
    );

    expect(reviewGroup).toBe(`agent-mutate-pr-${prNumber}`);
    expect(implementGroup).toBe(`agent-mutate-pr-${prNumber}`);
    expect(reviewGroup).toBe(implementGroup);
  });
});
