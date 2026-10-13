import type { GroupType } from "@/lib/events/group-types";

/**
 * Whether a choreography has to declare an experience level: `required` when
 * its category admits levels, `notApplicable` when the category admits none.
 * Every surface that validates, flags or renders the level asks this one rule
 * instead of reading the category's levels on its own.
 */
export type ExperienceLevelRequirement =
  "required" | "optional" | "notApplicable";

export function experienceLevelRequirement(input: {
  categoryExperienceLevels: readonly string[];
  groupType: GroupType;
}): ExperienceLevelRequirement {
  return input.categoryExperienceLevels.length === 0
    ? "notApplicable"
    : "required";
}
