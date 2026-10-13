import { describe, expect, test } from "vitest";

import { groupTypeValues } from "@/lib/events/group-types";

import {
  emptyExperienceLevelLabel,
  experienceLevelDisplayLabel,
  experienceLevelRequirement,
} from "./experience-level-requirement";

describe("experienceLevelRequirement", () => {
  test.each(groupTypeValues)(
    "a %s in a category that admits no level does not apply",
    (groupType) => {
      expect(
        experienceLevelRequirement({ categoryExperienceLevels: [], groupType }),
      ).toBe("notApplicable");
    },
  );

  test.each(["solo", "duo", "trio"] as const)(
    "a %s in a category that admits levels requires one",
    (groupType) => {
      expect(
        experienceLevelRequirement({
          categoryExperienceLevels: ["amateur", "profesional"],
          groupType,
        }),
      ).toBe("required");
    },
  );

  test("a grupal in a category that admits levels may leave it blank", () => {
    expect(
      experienceLevelRequirement({
        categoryExperienceLevels: ["amateur", "profesional"],
        groupType: "grupal",
      }),
    ).toBe("optional");
  });
});

describe("emptyExperienceLevelLabel", () => {
  test.each([
    ["required", "Sin asignar"],
    ["optional", "Sin nivel"],
    ["notApplicable", "No aplica"],
  ] as const)("words an empty %s level as %s", (requirement, label) => {
    expect(emptyExperienceLevelLabel(requirement)).toBe(label);
  });
});

describe("experienceLevelDisplayLabel", () => {
  test("reads a level by its label, whatever the requirement", () => {
    expect(experienceLevelDisplayLabel("pre_elite", "optional")).toBe(
      "Pre Elite",
    );
  });

  test("reads no level by why it is empty", () => {
    expect(experienceLevelDisplayLabel(null, "required")).toBe("Sin asignar");
    expect(experienceLevelDisplayLabel(null, "optional")).toBe("Sin nivel");
    expect(experienceLevelDisplayLabel(null, "notApplicable")).toBe(
      "No aplica",
    );
  });
});
