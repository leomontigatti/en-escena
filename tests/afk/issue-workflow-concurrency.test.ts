import { describe, expect, it } from "vitest";

import {
  cancelInProgress,
  concurrencyGroup,
  evalGha,
} from "./pr-workflows.test-support";

// Regression coverage for #1136, the issue-side half of #383. The three
// workflows over an issue listen to `issues: [labeled]` for every label and
// gate on their trigger label in the job, which runs after concurrency is
// evaluated. An issue created with an `agent:*` label plus its triage labels
// fires one `labeled` event per label; when the no-ops joined the per-issue
// group, GitHub kept only the newest pending run and cancelled the real one.

const ISSUE_WORKFLOWS = [
  {
    file: ".github/workflows/agent-to-issues-prd.yml",
    label: "agent:to-issues",
  },
  { file: ".github/workflows/agent-implement.yml", label: "agent:implement" },
  {
    file: ".github/workflows/agent-implement-prd.yml",
    label: "agent:implement",
  },
];

function groupFor(
  file: string,
  ctx: { labelName: string; issueNumber: number; runId: string },
): string {
  return evalGha(concurrencyGroup(file), {
    "github.event.label.name": ctx.labelName,
    "github.event.issue.number": String(ctx.issueNumber),
    "github.run_id": ctx.runId,
  });
}

describe("issue-side workflows concurrency (#1136)", () => {
  it("keeps cancel-in-progress false on all three", () => {
    for (const { file } of ISSUE_WORKFLOWS) {
      expect(cancelInProgress(file)).toBe("false");
    }
  });

  it("gives every no-op label event its own group, so it cannot cancel the real run", () => {
    // `gh issue create --label bug --label priority:next --label agent:implement`:
    // one event per label, all landing on the same issue within a second.
    const labels = ["bug", "priority:next", "ready-for-agent"];

    for (const { file } of ISSUE_WORKFLOWS) {
      const groups = labels.map((labelName, i) =>
        groupFor(file, { labelName, issueNumber: 1133, runId: `run-${i}` }),
      );
      const real = groupFor(file, {
        labelName: ISSUE_WORKFLOWS.find((wf) => wf.file === file)!.label,
        issueNumber: 1133,
        runId: "run-real",
      });

      expect(groups).not.toContain(real);
      expect(new Set([...groups, real]).size).toBe(labels.length + 1);
    }
  });

  it("still serialises two real trigger events on the same issue", () => {
    for (const { file, label } of ISSUE_WORKFLOWS) {
      const first = groupFor(file, {
        labelName: label,
        issueNumber: 1133,
        runId: "r1",
      });
      const second = groupFor(file, {
        labelName: label,
        issueNumber: 1133,
        runId: "r2",
      });

      expect(first).toBe(second);
    }
  });

  it("keeps Implement and Implement PRD in separate groups on the real path", () => {
    // Both fire on the same `agent:implement` event and only the preflight
    // tells them apart by issue shape (spec §3.2). Sharing a group would let
    // the newer pending one cancel the older, which is this same bug again.
    const implement = groupFor(".github/workflows/agent-implement.yml", {
      labelName: "agent:implement",
      issueNumber: 1155,
      runId: "r1",
    });
    const implementPrd = groupFor(".github/workflows/agent-implement-prd.yml", {
      labelName: "agent:implement",
      issueNumber: 1155,
      runId: "r2",
    });

    expect(implement).not.toBe(implementPrd);
  });
});
