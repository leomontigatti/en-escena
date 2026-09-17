import { describe, expect, it } from "vitest";

import {
  NEEDS_DECISION_LABEL,
  parseSpecFindings,
  parseUnresolvedThreads,
  READY_LABEL,
  reviewOutcomeLabel,
} from "../../.sandcastle/agent-review/outcome.mjs";

// Coverage for #1021: after posting, Review says which kind of hand-off it is.
// `agent:ready` is the cue to merge or arm auto-merge, so it may only be reached
// deliberately — every reading the classifier cannot make with confidence has to
// land on `agent:needs-decision`, where a human looks.

describe("reviewOutcomeLabel", () => {
  it("is ready when the review left no thread and no spec finding", () => {
    expect(
      reviewOutcomeLabel({ unresolvedThreads: 0, specFindings: false }),
    ).toBe(READY_LABEL);
  });

  it("needs a decision when a thread is unresolved", () => {
    expect(
      reviewOutcomeLabel({ unresolvedThreads: 1, specFindings: false }),
    ).toBe(NEEDS_DECISION_LABEL);
  });

  it("needs a decision when the summary carries a spec finding", () => {
    expect(
      reviewOutcomeLabel({ unresolvedThreads: 0, specFindings: true }),
    ).toBe(NEEDS_DECISION_LABEL);
  });

  it("needs a decision when either input could not be read", () => {
    expect(
      reviewOutcomeLabel({ unresolvedThreads: null, specFindings: false }),
    ).toBe(NEEDS_DECISION_LABEL);
    expect(
      reviewOutcomeLabel({ unresolvedThreads: 0, specFindings: null }),
    ).toBe(NEEDS_DECISION_LABEL);
  });
});

describe("parseUnresolvedThreads", () => {
  it("reads the count `gh api graphql --jq length` prints", () => {
    expect(parseUnresolvedThreads("0\n")).toBe(0);
    expect(parseUnresolvedThreads("3\n")).toBe(3);
  });

  it("refuses anything that is not a count", () => {
    for (const raw of ["", "null\n", "n/a", "-1", "1.5"]) {
      expect(parseUnresolvedThreads(raw)).toBeNull();
    }
  });
});

describe("parseSpecFindings", () => {
  it("reads the flag the runner wrote", () => {
    expect(parseSpecFindings("true\n")).toBe(true);
    expect(parseSpecFindings("false\n")).toBe(false);
  });

  it("refuses anything else rather than guessing", () => {
    for (const raw of ["", "maybe", "1"]) {
      expect(parseSpecFindings(raw)).toBeNull();
    }
  });
});
