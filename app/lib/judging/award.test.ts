import { describe, expect, test } from "vitest";

import { resolvePresentationResult } from "@/lib/judging/award";

describe("a presentation's result", () => {
  test("averages the values every judge left and reads the award off it", () => {
    expect(
      resolvePresentationResult({
        disqualified: false,
        values: ["80.0", "90.0"],
      }),
    ).toEqual({ average: 85, award: "silver", kind: "scored" });
  });

  test("rounds the average to two decimals before reading the award", () => {
    expect(
      resolvePresentationResult({
        disqualified: false,
        values: ["80.0", "85.5", "90.0"],
      }),
    ).toEqual({ average: 85.17, award: "silver", kind: "scored" });
  });

  test("leaves out a score that has no value", () => {
    expect(
      resolvePresentationResult({
        disqualified: false,
        values: [null, "90.0"],
      }),
    ).toEqual({ average: 90, award: "gold", kind: "scored" });
  });

  test("is unscored while no value counts", () => {
    expect(
      resolvePresentationResult({ disqualified: false, values: [] }),
    ).toEqual({ kind: "unscored" });
    expect(
      resolvePresentationResult({ disqualified: false, values: [null] }),
    ).toEqual({ kind: "unscored" });
  });

  test("is disqualified whatever the judges saved", () => {
    expect(
      resolvePresentationResult({ disqualified: true, values: ["90.0"] }),
    ).toEqual({ kind: "disqualified" });
  });

  test.each([
    ["0.0", "specialMention"],
    ["59.5", "specialMention"],
    ["60.0", "bronze"],
    ["79.5", "bronze"],
    ["80.0", "silver"],
    ["89.5", "silver"],
    ["90.0", "gold"],
    ["100.0", "gold"],
  ])("reads an average of %s as %s", (value, award) => {
    expect(
      resolvePresentationResult({ disqualified: false, values: [value] }),
    ).toMatchObject({ award });
  });
});
