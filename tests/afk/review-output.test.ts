import { describe, expect, it } from "vitest";

import { reviewSchema } from "../../.sandcastle/agent-review/output.mjs";

// The review schema's `specFindings` flag (#1021). It decides half of the
// outcome label, so it follows §3.8's input tolerance — models spell a boolean
// several ways — while an answer that cannot be read stays unknown (`null`)
// rather than becoming a `false` that would label the PR `agent:ready`.

const base = { summary: "Reviewed." };

describe("reviewSchema.specFindings", () => {
  it("is unknown when the agent omits it", () => {
    expect(reviewSchema.parse(base).specFindings).toBeNull();
  });

  it("takes a boolean", () => {
    expect(
      reviewSchema.parse({ ...base, specFindings: true }).specFindings,
    ).toBe(true);
    expect(
      reviewSchema.parse({ ...base, specFindings: false }).specFindings,
    ).toBe(false);
  });

  it("takes the aliases and spellings a model drifts to", () => {
    expect(
      reviewSchema.parse({ ...base, hasSpecFindings: true }).specFindings,
    ).toBe(true);
    expect(
      reviewSchema.parse({ ...base, specFindings: "true" }).specFindings,
    ).toBe(true);
    expect(
      reviewSchema.parse({ ...base, specFindings: "No" }).specFindings,
    ).toBe(false);
  });

  it("stays unknown rather than guessing an unreadable answer", () => {
    expect(
      reviewSchema.parse({ ...base, specFindings: "unclear" }).specFindings,
    ).toBeNull();
  });
});
