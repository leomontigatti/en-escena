import { describe, expect, test } from "vitest";

import {
  duplicateCriterionNameErrors,
  duplicateCriterionNameMessage,
  parseCriterionMaximum,
  sumAddingCriteriaMaxima,
} from "@/lib/judging/criteria";

describe("submodality criteria maxima", () => {
  test("reads a maximum only as a whole number from 1", () => {
    expect(parseCriterionMaximum("20")).toBe(20);
    expect(parseCriterionMaximum(20)).toBe(20);
    expect(parseCriterionMaximum("0")).toBeNull();
    expect(parseCriterionMaximum("-5")).toBeNull();
    expect(parseCriterionMaximum("20.5")).toBeNull();
    expect(parseCriterionMaximum("")).toBeNull();
    expect(parseCriterionMaximum("veinte")).toBeNull();
  });

  test("totals the adding maxima and leaves the deductions outside", () => {
    expect(
      sumAddingCriteriaMaxima([
        { kind: "adds", maximum: "60" },
        { kind: "adds", maximum: "40" },
        { kind: "deducts", maximum: "30" },
      ]),
    ).toBe(100);
  });
});

describe("repeated criterion names", () => {
  test("reports both rows of a repetition, and nothing else", () => {
    expect([
      ...duplicateCriterionNameErrors(["Técnica", "Puesta", "  técnica "]),
    ]).toEqual([
      [0, duplicateCriterionNameMessage],
      [2, duplicateCriterionNameMessage],
    ]);
  });

  test("reads two names apart only by what the index does", () => {
    // The unique index is on `lower(name)` with the accents folded, so the
    // dialog has to refuse what the save would refuse anyway.
    expect(duplicateCriterionNameErrors(["Tecnica", "Técnica"]).size).toBe(2);
    expect(duplicateCriterionNameErrors(["Técnica", "Puesta"]).size).toBe(0);
  });

  test("leaves an empty name to the required-field rule", () => {
    expect(duplicateCriterionNameErrors(["", "   ", "Técnica"]).size).toBe(0);
  });
});
