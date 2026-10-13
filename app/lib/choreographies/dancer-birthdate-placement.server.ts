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

function resolveRetainedExperienceLevelId(input: {
  currentExperienceLevelId: string | null;
  resolution: Pick<
    ChoreographyRegistrationOperationResolution,
    "experienceLevel"
  >;
}) {
  if (input.resolution.experienceLevel.requirement !== "required") {
    return null;
  }

  if (
    input.currentExperienceLevelId &&
    isExperienceLevel(input.currentExperienceLevelId) &&
    input.resolution.experienceLevel.options.some(
      (option) => option.id === input.currentExperienceLevelId,
    )
  ) {
    return input.currentExperienceLevelId;
  }

  return null;
}
