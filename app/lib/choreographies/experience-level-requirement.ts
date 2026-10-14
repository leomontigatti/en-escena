import { experienceLevelLabel } from "@/lib/events/experience-levels";
import type { GroupType } from "@/lib/events/group-types";

/**
 * Whether a choreography has to declare an experience level: `notApplicable`
 * when its category admits no level, `optional` for a grupal in a category
 * that admits levels, and `required` for a solo, duo or trio there. Every
 * surface that validates, flags or renders the level asks this one rule
 * instead of reading the category's levels on its own.
 */
export type ExperienceLevelRequirement =
  "required" | "optional" | "notApplicable";

export function experienceLevelRequirement(input: {
  categoryExperienceLevels: readonly string[];
  groupType: GroupType;
}): ExperienceLevelRequirement {
  if (input.categoryExperienceLevels.length === 0) {
    return "notApplicable";
  }

  return input.groupType === "grupal" ? "optional" : "required";
}

/**
 * How a choreography with no experience level words the empty value, by why it
 * is empty: missing where it is required (`Sin asignar`), not offered by the
 * category (`No aplica`), or offered and left blank by choice (`Sin nivel`).
 */
export function emptyExperienceLevelLabel(
  requirement: ExperienceLevelRequirement,
) {
  switch (requirement) {
    case "required":
      return "Sin asignar";
    case "optional":
      return "Sin nivel";
    case "notApplicable":
      return "No aplica";
  }
}

/**
 * What a list's `Nivel` cell reads: the level's label, or the empty value
 * worded by why it is empty.
 */
export function experienceLevelDisplayLabel(
  experienceLevel: string | null,
  requirement: ExperienceLevelRequirement,
) {
  return (
    experienceLevelLabel(experienceLevel) ??
    emptyExperienceLevelLabel(requirement)
  );
}
