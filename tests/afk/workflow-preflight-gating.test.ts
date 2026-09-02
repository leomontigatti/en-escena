import { describe, expect, it } from "vitest";

import {
  evalGha,
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
//
// The gating is checked by *evaluating* each condition, not by matching how it
// is spelled: `== 'true'` and `!= 'false'` gate a refused run identically but
// diverge when the preflight itself fails, and only the second of those two
// properties is a matter of spelling.

interface Outcome {
  /** `steps.preflight.outputs.proceed`: `"true"`, `"false"`, or `""` when unset. */
  proceed: string;
  failure: boolean;
}

function contextFor(outcome: Outcome): Record<string, string> {
  return {
    "steps.preflight.outputs.proceed": outcome.proceed,
    success: String(!outcome.failure),
    failure: String(outcome.failure),
    always: "true",
    cancelled: "false",
  };
}

/** A step's `if:`, resolved for a given run outcome. `""` means unconditional. */
function runsWhen(condition: string, outcome: Outcome): boolean {
  if (condition === "") return true;
  return evalGha(condition, contextFor(outcome)) === "true";
}

/**
 * The other `steps.*` a condition reads. `evalGha` refuses an unknown token
 * rather than guessing one, which is what makes it safe to judge a security
 * condition with — so a caller that only knows the preflight's output has to
 * say what else is in play.
 */
function freeTokens(condition: string, outcome: Outcome): string[] {
  const known = contextFor(outcome);
  const tokens =
    condition.replace(/'[^']*'/g, "").match(/[A-Za-z_][A-Za-z0-9_.]*/g) ?? [];
  return [...new Set(tokens)].filter((token) => !(token in known));
}

/**
 * Whether the step is skipped on a refused run **whatever** the rest of the
 * workflow did — every assignment of the condition's other tokens, not one
 * convenient guess. A step gated on `proceed == 'true' && <something else>` is
 * only more restrictive, and this proves that rather than assuming it.
 */
function skippedOnRefusal(condition: string): boolean {
  const outcome: Outcome = { proceed: "false", failure: false };
  const free = freeTokens(condition, outcome);
  if (free.length > 4) throw new Error(`Too many free tokens in: ${condition}`);

  // Two values per token — empty and non-empty — which is every case `==`,
  // `!=` and truthiness can tell apart here.
  for (let mask = 0; mask < 2 ** free.length; mask++) {
    const context = contextFor(outcome);
    free.forEach((token, i) => {
      context[token] = (mask >> i) & 1 ? "x" : "";
    });
    if (evalGha(condition, context) === "true") return false;
  }
  return true;
}

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

  it("skips every step after the preflight when it refuses", () => {
    for (const file of workflowsWithPreflight()) {
      for (const step of workflowSteps(file).slice(1)) {
        // The agent-log upload is the one deliberate exemption: it is
        // `always()` so a killed run still surfaces its log, and on a refused
        // run there is no artifact to upload anyway (`if-no-files-found:
        // ignore`). Anything else that runs would act on a PR the preflight
        // declined — with no checkout on disk.
        if (step.uses.startsWith("actions/upload-artifact")) continue;
        expect(
          step.condition !== "" && skippedOnRefusal(step.condition),
          `${file}: step \`${step.name}\` would run on a refused PR`,
        ).toBe(true);
      }
    }
  });

  // A refusal writes `proceed=false`; a preflight that *fails* writes nothing,
  // so `proceed` is the empty string. Gating the failure report on
  // `== 'true'` collapses those two cases and reports neither — a red run with
  // no `agent:blocked` and no comment on the PR, which is precisely the failure
  // mode the reporting step exists to prevent.
  //
  // Scoped to `agent-review.yml`, which is the workflow #790 gave a preflight:
  // the other four carry the `== 'true'` spelling as pre-existing code, and
  // widening this into the cross-cutting assertion above means sweeping them,
  // which is its own change.
  it("still reports when the preflight itself fails", () => {
    const file = ".github/workflows/agent-review.yml";
    const reporting = workflowSteps(file).filter((step) =>
      step.name.startsWith("On failure"),
    );

    expect(reporting.length, `${file}: no failure-reporting step`).toBe(1);
    expect(
      runsWhen(reporting[0].condition, { proceed: "", failure: true }),
      `${file}: a failed preflight would go unreported`,
    ).toBe(true);
    expect(
      runsWhen(reporting[0].condition, { proceed: "false", failure: false }),
      `${file}: a deliberate refusal must not be reported as a failure`,
    ).toBe(false);
  });
});
