import { describe, expect, test } from "vitest";

import {
  addingCriteriaTotalMessage,
  criterionMaximumMessage,
  parseCriterionMaximum,
  sumAddingCriteriaMaxima,
  validateCriteriaMaxima,
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

  test("accepts an empty list, which is scored with a single value", () => {
    expect(validateCriteriaMaxima([])).toEqual({ ok: true });
  });

  test("accepts adding maxima that total exactly 100 beside deductions", () => {
    expect(
      validateCriteriaMaxima([
        { kind: "adds", maximum: "70" },
        { kind: "adds", maximum: "30" },
        { kind: "deducts", maximum: "10" },
      ]),
    ).toEqual({ ok: true });
  });

  test("refuses adding maxima that do not total 100", () => {
    expect(
      validateCriteriaMaxima([
        { kind: "adds", maximum: "70" },
        { kind: "adds", maximum: "20" },
      ]),
    ).toEqual({
      ok: false,
      fieldErrors: { criteria: addingCriteriaTotalMessage },
    });
  });

  test("refuses a list of deductions only, which can never reach 100", () => {
    expect(
      validateCriteriaMaxima([{ kind: "deducts", maximum: "10" }]),
    ).toMatchObject({
      ok: false,
      fieldErrors: { criteria: addingCriteriaTotalMessage },
    });
  });

  test("reports the offending maximum and holds back the total error", () => {
    expect(
      validateCriteriaMaxima([
        { kind: "adds", maximum: "100" },
        { kind: "adds", maximum: "0" },
      ]),
    ).toEqual({
      ok: false,
      fieldErrors: { "criteria.1.maximum": criterionMaximumMessage },
    });
  });
});
