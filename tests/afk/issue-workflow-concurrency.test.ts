import { describe, expect, it } from "vitest";

import {
  cancelInProgress,
  concurrencyGroup,
  evalGha,
} from "./pr-workflows.test-support";

// Regression coverage for #1136, the issue-side half of #383. A workflow over
// an issue (one is left since ADR-0016) listens to `issues: [labeled]` for every
// label and gates on its trigger label in the job, which runs after concurrency
// is evaluated. An issue created with an `agent:*` label plus its triage labels
// fires one `labeled` event per label; when the no-ops joined the per-issue
// group, GitHub kept only the newest pending run and cancelled the real one.

const ISSUE_WORKFLOWS = [
  {
    file: ".github/workflows/agent-to-issues-prd.yml",
    label: "agent:to-issues",
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
  it("keeps cancel-in-progress false", () => {
    for (const { file } of ISSUE_WORKFLOWS) {
      expect(cancelInProgress(file)).toBe("false");
    }
  });

  it("gives every no-op label event its own group, so it cannot cancel the real run", () => {
    // `gh issue create --label bug --label priority:next --label agent:to-issues`:
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
});
