import { describe, expect, test } from "vitest";

import {
  academyDataStatusLabels,
  getAcademyDataStatus,
} from "./academy-data-status";

describe("the academy data status", () => {
  test("reads complete when the academy has both a province and a city", () => {
    expect(
      getAcademyDataStatus({ city: "Rosario", province: "santa_fe" }),
    ).toBe("complete");
  });

  test.each([
    ["no province", { city: "Rosario", province: null }],
    ["no city", { city: null, province: "santa_fe" as const }],
    ["a blank city", { city: "  ", province: "santa_fe" as const }],
    ["neither", { city: null, province: null }],
  ])("reads incomplete with %s", (_case, academy) => {
    expect(getAcademyDataStatus(academy)).toBe("incomplete");
  });

  test("names each status the way the badge reads it", () => {
    expect(academyDataStatusLabels).toEqual({
      complete: "Completa",
      incomplete: "Incompleta",
    });
  });
});
