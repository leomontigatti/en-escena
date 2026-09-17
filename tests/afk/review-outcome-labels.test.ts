import { describe, expect, it } from "vitest";

import {
  evalGha,
  workflowSteps,
  type WorkflowStep,
} from "./pr-workflows.test-support";

// Coverage for #1021: Review's last act is to say which kind of hand-off it
// leaves — `agent:ready` or `agent:needs-decision`, exactly one of them, on
// every run that actually posted a review. The decision itself is unit-tested in
// `review-outcome.test.ts`; what is asserted here is the wiring that makes it
// reach the PR, and the two ways it must *not*: a failed run classifies nothing
// (it blocks instead), and a new feedback round un-classifies the PR.

const REVIEW = ".github/workflows/agent-review.yml";
const IMPLEMENT_PR = ".github/workflows/agent-implement-pr.yml";

const OUTCOME_LABELS = ["agent:ready", "agent:needs-decision"];

/** `steps.<step>.<if>` resolved for a run outcome; `""` means unconditional. */
function runsWhen(
  step: WorkflowStep,
  proceed: string,
  failed: boolean,
): boolean {
  if (step.condition === "") return !failed;
  const resolved = evalGha(step.condition, {
    "steps.preflight.outputs.proceed": proceed,
    success: String(!failed),
    failure: String(failed),
    always: "true",
    cancelled: "false",
  });
  // A step without a status function is implicitly `success() && <if>`.
  const implicitSuccess =
    /\b(success|failure|always|cancelled)\b/.test(step.condition) || !failed;
  return resolved === "true" && implicitSuccess;
}

function stepWith(steps: WorkflowStep[], needle: string): WorkflowStep {
  const found = steps.find((step) => step.body.includes(needle));
  if (!found) throw new Error(`No step contains ${needle}`);
  return found;
}

describe("agent-review.yml labels the outcome", () => {
  const steps = workflowSteps(REVIEW);
  const labelStep = stepWith(steps, "label-outcome.mts");

  it("classifies only after the review and its replies are posted", () => {
    // The thread count the classifier reads has to include the threads this
    // review just opened, so it cannot run before they exist.
    const index = (name: string) =>
      steps.findIndex((step) => step.name === name);
    expect(index("Post review")).toBeGreaterThan(-1);
    expect(index("Post thread replies")).toBeGreaterThan(-1);
    expect(steps.indexOf(labelStep)).toBeGreaterThan(index("Post review"));
    expect(steps.indexOf(labelStep)).toBeGreaterThan(
      index("Post thread replies"),
    );
  });

  it("labels a successful run and neither refuses nor fails into a label", () => {
    expect(runsWhen(labelStep, "true", false)).toBe(true);
    expect(runsWhen(labelStep, "true", true)).toBe(false);
    expect(runsWhen(labelStep, "false", false)).toBe(false);
  });

  it("applies the labels from the script alone, so exactly one can land", () => {
    // Every other mention would be a second author of the classification: the
    // script adds one label and removes the other in a single edit.
    for (const step of steps) {
      if (step === labelStep) continue;
      for (const label of OUTCOME_LABELS) {
        expect(step.body).not.toContain(`--add-label "${label}"`);
      }
    }
  });

  it("blocks rather than classifies when the run failed", () => {
    const failureStep = stepWith(steps, '--add-label "agent:blocked"');
    expect(runsWhen(failureStep, "true", true)).toBe(true);
    for (const label of OUTCOME_LABELS) {
      expect(failureStep.body).not.toContain(label);
    }
  });

  it("drops the previous round's classification when it starts", () => {
    // A round that then fails would otherwise leave the old `agent:ready` — a
    // merge cue — sitting next to the `agent:blocked` its failure adds.
    const transition = stepWith(steps, '--add-label "agent:in-progress"');
    for (const label of OUTCOME_LABELS) {
      expect(transition.body).toContain(`--remove-label "${label}"`);
    }
  });
});

describe("agent-implement-pr.yml un-classifies the PR it accepts", () => {
  it("removes both outcome labels when it takes a new feedback round", () => {
    const transition = stepWith(
      workflowSteps(IMPLEMENT_PR),
      '--add-label "agent:in-progress"',
    );
    for (const label of OUTCOME_LABELS) {
      expect(transition.body).toContain(`--remove-label "${label}"`);
    }
  });
});
