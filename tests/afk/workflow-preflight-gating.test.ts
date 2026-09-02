import { describe, expect, it } from "vitest";

import {
  workflowSteps,
  workflowsWithPreflight,
} from "./pr-workflows.test-support";

// Coverage for #790: a preflight only saves the run it refuses if *every*
// subsequent step is gated on its `proceed` output. `agent-review.yml` grew one
// so that a PR linking no issue is declined before the label transition, the
// checkout and the installs — and an ungated step added later would silently
// undo that (it would run on a refused PR, with no checkout on disk).
//
// Asserted over every workflow that has an `id: preflight` step, discovered
// from `.github/workflows/`, so the invariant follows the shape rather than a
// per-workflow checklist.

const GATE = "steps.preflight.outputs.proceed == 'true'";

describe("preflight-gated workflows (#790)", () => {
  it("has at least one, so the invariant is not vacuous", () => {
    expect(workflowsWithPreflight()).toContain(
      ".github/workflows/agent-review.yml",
    );
    expect(workflowsWithPreflight()).toContain(
      ".github/workflows/agent-implement-pr.yml",
    );
  });

  it("runs the preflight first, before anything the refusal is meant to save", () => {
    for (const file of workflowsWithPreflight()) {
      const steps = workflowSteps(file);
      expect(steps[0].id, `${file}: the preflight is not the first step`).toBe(
        "preflight",
      );
      expect(
        steps[0].condition,
        `${file}: the preflight itself must not be gated`,
      ).toBe("");
    }
  });

  it("gates every step after the preflight on its `proceed` output", () => {
    for (const file of workflowsWithPreflight()) {
      for (const step of workflowSteps(file).slice(1)) {
        // The agent-log upload is the one deliberate exemption: it is
        // `always()` so a killed run still surfaces its log, and on a refused
        // run there is no artifact to upload anyway (`if-no-files-found:
        // ignore`). Anything else that skips the gate would act on a PR the
        // preflight declined — with no checkout on disk.
        if (step.uses.startsWith("actions/upload-artifact")) {
          expect(step.condition).toBe("always()");
          continue;
        }
        expect(
          step.condition,
          `${file}: step \`${step.name}\` would run on a refused PR`,
        ).toContain(GATE);
      }
    }
  });
});
