import { describe, expect, test } from "vitest";

import { groupTypeValues } from "@/lib/events/group-types";

import { experienceLevelRequirement } from "./experience-level-requirement";

describe("experienceLevelRequirement", () => {
  test.each(groupTypeValues)(
    "a %s in a category that admits no level does not apply",
    (groupType) => {
      expect(
        experienceLevelRequirement({ categoryExperienceLevels: [], groupType }),
      ).toBe("notApplicable");
    },
  );

  test.each(groupTypeValues)(
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
});
