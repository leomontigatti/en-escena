import type { ExperienceLevelRequirement } from "@/lib/choreographies/experience-level-requirement";
import type { ExperienceLevelOutcome } from "@/lib/choreographies/recategorisation-report";
import {
  getResolvedCategoryId,
  type ChoreographyRegistrationOperationResolution,
  type ResolvedRegistrationDancer,
} from "@/lib/choreographies/registration-resolution.server";
import { isExperienceLevel } from "@/lib/events/experience-levels";

/**
 * Where a choreography competes, as a birth-date correction compares it before
 * and after re-resolving its dancers: a correction that leaves it unchanged
 * writes nothing.
 */
export type ChoreographyCompetitivePlacement = {
  categoryId: string | null;
  categoryAgeBasis: number | null;
  categoryCalculationMode: "oldest" | "group_tolerance" | "group_average";
  experienceLevelId: string | null;
  dancerCompetitiveAge: number;
};

export function toCompetitivePlacementFromChoreography(choreography: {
  categoryId: string | null;
  categoryAgeBasis: number | null;
  categoryCalculationMode: ChoreographyCompetitivePlacement["categoryCalculationMode"];
  experienceLevelId: string | null;
  correctedDancerCompetitiveAge: number;
}): ChoreographyCompetitivePlacement {
  return {
    categoryId: choreography.categoryId,
    categoryAgeBasis: choreography.categoryAgeBasis,
    categoryCalculationMode: choreography.categoryCalculationMode,
    experienceLevelId: choreography.experienceLevelId,
    dancerCompetitiveAge: choreography.correctedDancerCompetitiveAge,
  };
}

export function toCompetitivePlacementFromResolution(input: {
  correctedDancer: ResolvedRegistrationDancer;
  currentExperienceLevelId: string | null;
  resolution: Pick<
    ChoreographyRegistrationOperationResolution,
    | "category"
    | "categoryAgeBasis"
    | "categoryCalculationMode"
    | "experienceLevel"
  >;
}): ChoreographyCompetitivePlacement {
  return {
    categoryId: getResolvedCategoryId(input.resolution.category),
    categoryAgeBasis: input.resolution.categoryAgeBasis,
    categoryCalculationMode: input.resolution.categoryCalculationMode,
    experienceLevelId: resolveRetainedExperienceLevelId({
      currentExperienceLevelId: input.currentExperienceLevelId,
      resolution: input.resolution,
    }),
    dancerCompetitiveAge: input.correctedDancer.ageAtEventStart,
  };
}

export function hasCompetitivePlacementChanged(
  before: ChoreographyCompetitivePlacement,
  after: ChoreographyCompetitivePlacement,
) {
  return (
    before.categoryId !== after.categoryId ||
    before.categoryCalculationMode !== after.categoryCalculationMode ||
    before.categoryAgeBasis !== after.categoryAgeBasis ||
    before.experienceLevelId !== after.experienceLevelId ||
    before.dancerCompetitiveAge !== after.dancerCompetitiveAge
  );
}

/**
 * What the correction did to the level, for the report: whatever the user has
 * to look at, the admin surfaces' mismatch flag and the `Sin nivel` a grupal
 * reads without anyone having chosen it included.
 */
export function resolveExperienceLevelOutcome(input: {
  previousExperienceLevelId: string | null;
  previousRequirement: ExperienceLevelRequirement;
  placement: Pick<ChoreographyCompetitivePlacement, "experienceLevelId">;
  resolution: Pick<
    ChoreographyRegistrationOperationResolution,
    "experienceLevel"
  >;
}): ExperienceLevelOutcome {
  const { experienceLevel } = input.resolution;
  const experienceLevelId = input.placement.experienceLevelId;

  // A category that admits no levels has nothing to pick: the empty level
  // reads `No aplica` and the move needs no repair.
  if (
    input.previousExperienceLevelId !== null &&
    experienceLevelId === null &&
    experienceLevel.requirement !== "notApplicable"
  ) {
    return "cleared";
  }

  if (
    experienceLevelId !== null &&
    !experienceLevel.options.some((option) => option.id === experienceLevelId)
  ) {
    return "keptOutsideCategory";
  }

  if (
    experienceLevelId === null &&
    experienceLevel.requirement === "optional" &&
    input.previousRequirement === "notApplicable"
  ) {
    return "arrivedWithoutLevel";
  }

  return "unchanged";
}

function resolveRetainedExperienceLevelId(input: {
  currentExperienceLevelId: string | null;
  resolution: Pick<
    ChoreographyRegistrationOperationResolution,
    "experienceLevel"
  >;
}) {
  const { requirement, options } = input.resolution.experienceLevel;

  if (
    requirement === "notApplicable" ||
    !input.currentExperienceLevelId ||
    !isExperienceLevel(input.currentExperienceLevelId)
  ) {
    return null;
  }

  // A grupal keeps its level even where the new category does not offer it:
  // clearing it would read as a `Sin nivel` nobody chose, while the kept level
  // is flagged as a mismatch for administration to repair.
  if (requirement === "optional") {
    return input.currentExperienceLevelId;
  }

  return options.some((option) => option.id === input.currentExperienceLevelId)
    ? input.currentExperienceLevelId
    : null;
}
