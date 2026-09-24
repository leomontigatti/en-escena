import { describe, expect, it } from "vitest";

import { workflowSteps } from "./pr-workflows.test-support";

// #1186: Implement PR ran on half the budget of its two siblings, and a review
// round on a whole-PRD PR outgrew it twice on #1185. The three implement
// runners now share one budget, each held below its step's own timeout so the
// runner can still fail with a reason (#512).

const IMPLEMENT_RUNNERS = [
  ".github/workflows/agent-implement.yml",
  ".github/workflows/agent-implement-prd.yml",
  ".github/workflows/agent-implement-pr.yml",
];

function runnerStep(file: string) {
  const step = workflowSteps(file).find((candidate) =>
    /\.sandcastle\/agent-implement[^/]*\/implement[^/]*\.mts/.test(
      candidate.body,
    ),
  );
  if (!step) throw new Error(`${file}: no implement runner step`);

  const read = (key: string) =>
    Number(new RegExp(`${key}:[ \\t]*(\\d+)`).exec(step.body)?.[1]);

  return {
    budgetMinutes: read("AGENT_BUDGET_MINUTES"),
    timeoutMinutes: read("timeout-minutes"),
  };
}

describe("implement runner budgets (#1186)", () => {
  it.each(IMPLEMENT_RUNNERS)("%s gives the agent 50 minutes", (file) => {
    expect(runnerStep(file).budgetMinutes).toBe(50);
  });

  it.each(IMPLEMENT_RUNNERS)(
    "%s keeps the budget below the step's own timeout",
    (file) => {
      const { budgetMinutes, timeoutMinutes } = runnerStep(file);

      expect(timeoutMinutes).toBeGreaterThan(budgetMinutes);
    },
  );
});
