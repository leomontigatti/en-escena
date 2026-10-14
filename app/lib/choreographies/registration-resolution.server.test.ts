import { describe, expect, test } from "vitest";

import {
  deriveGroupType,
  validateExperienceLevelSelection,
} from "@/lib/choreographies/registration-resolution.server";

describe("deriveGroupType", () => {
  test("maps dancer counts to the shared group type used by admin re-resolution", () => {
    expect(deriveGroupType(1)).toBe("solo");
    expect(deriveGroupType(2)).toBe("duo");
    expect(deriveGroupType(3)).toBe("trio");
    expect(deriveGroupType(4)).toBe("grupal");
    expect(deriveGroupType(9)).toBe("grupal");
  });
});

describe("validateExperienceLevelSelection", () => {
  const availableExperienceLevels = [{ id: "amateur" }, { id: "profesional" }];

  test("an optional level accepts a blank or one of the category's levels", () => {
    expect(
      validateExperienceLevelSelection({
        availableExperienceLevels,
        experienceLevelId: null,
        requirement: "optional",
      }),
    ).toEqual({ ok: true });
    expect(
      validateExperienceLevelSelection({
        availableExperienceLevels,
        experienceLevelId: "profesional",
        requirement: "optional",
      }),
    ).toEqual({ ok: true });
  });

  test("an optional level still refuses one outside the category", () => {
    expect(
      validateExperienceLevelSelection({
        availableExperienceLevels,
        experienceLevelId: "nudo",
        requirement: "optional",
      }),
    ).toMatchObject({
      ok: false,
      failure: { code: "invalid-experience-level" },
    });
  });

  test("a required level refuses a blank", () => {
    expect(
      validateExperienceLevelSelection({
        availableExperienceLevels,
        experienceLevelId: null,
        requirement: "required",
      }),
    ).toMatchObject({
      ok: false,
      failure: { code: "experience-level-required" },
    });
  });

  test("a level that does not apply refuses any level", () => {
    expect(
      validateExperienceLevelSelection({
        availableExperienceLevels: [],
        experienceLevelId: "amateur",
        requirement: "notApplicable",
      }),
    ).toMatchObject({
      ok: false,
      failure: { code: "invalid-experience-level" },
    });
  });
});
