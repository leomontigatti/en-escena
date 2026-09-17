import { and, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import {
  choreographies,
  choreographyDancers,
  dancers,
  events,
} from "@/db/schema";
import { activeInscription } from "@/lib/choreographies/active-inscription";
import {
  getAgeAtDate,
  getEventLocalDateParts,
  resolveChoreographyClassificationForResolvedDancers,
  type ChoreographyRegistrationOperationResolution,
  type ResolvedRegistrationDancer,
} from "@/lib/choreographies/registration-resolution.server";
import { getEventBases, type EventBases } from "@/lib/events/bases.server";
import { isExperienceLevel } from "@/lib/events/experience-levels";

type DatabaseExecutor = Parameters<Parameters<typeof db.transaction>[0]>[0];
type QueryExecutor = typeof db | DatabaseExecutor;

type EligibleChoreographyRow = {
  choreographyId: string;
  choreographyNumber: number;
  name: string;
  eventId: string;
  startsAt: Date;
  modalityId: string;
  categoryId: string | null;
  categoryAgeBasis: number | null;
  categoryCalculationMode: "oldest" | "group_tolerance" | "group_average";
  experienceLevelId: string | null;
  correctedDancerCompetitiveAge: number;
};

type LinkedDancerRow = {
  choreographyId: string;
  dancerId: string;
  firstName: string;
  lastName: string;
  birthDate: string;
};

type ChoreographyCompetitivePlacement = {
  categoryId: string | null;
  categoryAgeBasis: number | null;
  categoryCalculationMode: EligibleChoreographyRow["categoryCalculationMode"];
  experienceLevelId: string | null;
  dancerCompetitiveAge: number;
};

export type DancerBirthDateCorrectionChoreography = {
  choreographyNumber: number;
  name: string;
};

/**
 * The correction reports no warning today: leaving a required experience level
 * empty is a documented, legitimate outcome (#694 adds the message). The result
 * carries the array so that adding one later needs no signature change.
 */
export type DancerBirthDateCorrectionWarning = never;

export type DancerBirthDateCorrectionResult =
  | { ok: true; warnings: DancerBirthDateCorrectionWarning[] }
  | {
      ok: false;
      code: "no-compatible-category";
      choreographiesWithoutCategory: DancerBirthDateCorrectionChoreography[];
      warnings: DancerBirthDateCorrectionWarning[];
    };

type ChoreographyCorrectionWrite = {
  choreography: EligibleChoreographyRow;
  placement: ChoreographyCompetitivePlacement;
  resolvedDancers: ResolvedRegistrationDancer[];
};

export async function recalculateLinkedChoreographiesForDancerBirthDateCorrection(input: {
  dancerId: string;
  executor?: QueryExecutor;
  eventBasesByEventId?: Map<string, EventBases>;
}): Promise<DancerBirthDateCorrectionResult> {
  const executor = input.executor ?? db;
  const eligibleChoreographies = await listEligibleChoreographies(
    executor,
    input.dancerId,
  );

  if (eligibleChoreographies.length === 0) {
    return { ok: true, warnings: [] };
  }

  const choreographyIds = eligibleChoreographies.map(
    (choreography) => choreography.choreographyId,
  );
  const linkedDancers = await executor
    .select({
      choreographyId: choreographyDancers.choreographyId,
      dancerId: dancers.id,
      firstName: dancers.firstName,
      lastName: dancers.lastName,
      birthDate: dancers.birthDate,
    })
    .from(choreographyDancers)
    .innerJoin(dancers, eq(choreographyDancers.dancerId, dancers.id))
    // The classification is recomputed over the live roster: a withdrawn
    // inscription contributes no age and does not count towards the group type.
    .where(
      and(
        inArray(choreographyDancers.choreographyId, choreographyIds),
        activeInscription(),
      ),
    );

  const linkedDancersByChoreographyId =
    groupLinkedDancersByChoreographyId(linkedDancers);

  const writes: ChoreographyCorrectionWrite[] = [];

  for (const choreography of eligibleChoreographies) {
    const choreographyLinkedDancers =
      linkedDancersByChoreographyId.get(choreography.choreographyId) ?? [];
    const resolvedDancers = toResolvedDancers(
      choreographyLinkedDancers,
      getEventLocalDateParts(choreography.startsAt),
    );
    const eventBases =
      input.eventBasesByEventId?.get(choreography.eventId) ??
      (await getEventBases(choreography.eventId));
    const resolution = resolveChoreographyClassificationForResolvedDancers({
      eventBases,
      modalityId: choreography.modalityId,
      dancers: resolvedDancers,
    });
    const correctedResolvedDancer = resolvedDancers.find(
      (dancer) => dancer.id === input.dancerId,
    );

    if (!correctedResolvedDancer) {
      continue;
    }

    const beforePlacement =
      toCompetitivePlacementFromChoreography(choreography);
    const afterPlacement = toCompetitivePlacementFromResolution({
      correctedDancer: correctedResolvedDancer,
      currentExperienceLevelId: beforePlacement.experienceLevelId,
      resolution,
    });

    if (!hasCompetitivePlacementChanged(beforePlacement, afterPlacement)) {
      continue;
    }

    writes.push({
      choreography,
      placement: afterPlacement,
      resolvedDancers,
    });
  }

  // Every choreography is resolved before anything is written: a correction
  // that would leave one of them without a category is refused whole, so the
  // administrator never has to undo a half-applied recalculation.
  const choreographiesWithoutCategory = writes
    .filter((write) => write.placement.categoryId === null)
    .map((write) => toCorrectionChoreography(write.choreography));

  if (choreographiesWithoutCategory.length > 0) {
    return {
      ok: false,
      code: "no-compatible-category",
      choreographiesWithoutCategory,
      warnings: [],
    };
  }

  for (const write of writes) {
    await persistResolvedDancers({
      choreographyId: write.choreography.choreographyId,
      executor,
      resolvedDancers: write.resolvedDancers,
    });
    await executor
      .update(choreographies)
      .set({
        categoryId: write.placement.categoryId,
        categoryCalculationMode: write.placement.categoryCalculationMode,
        categoryAgeBasis: write.placement.categoryAgeBasis,
        experienceLevelId: toExperienceLevelValue(
          write.placement.experienceLevelId,
        ),
      })
      .where(eq(choreographies.id, write.choreography.choreographyId));
  }

  return { ok: true, warnings: [] };
}

/**
 * Thrown by a caller inside its own transaction, so that the dancer row rolls
 * back together with the recalculation. Both dancer forms catch it and surface
 * the message on the birth date field.
 */
export class DancerBirthDateCorrectionRefusalError extends Error {
  constructor(
    choreographiesWithoutCategory: DancerBirthDateCorrectionChoreography[],
  ) {
    super(
      buildDancerBirthDateCorrectionRefusalMessage(
        choreographiesWithoutCategory,
      ),
    );
    this.name = "DancerBirthDateCorrectionRefusalError";
  }
}

/**
 * Names the choreographies a birth-date correction would leave without a
 * category, for the birth date field of both dancer forms.
 */
export function buildDancerBirthDateCorrectionRefusalMessage(
  choreographiesWithoutCategory: DancerBirthDateCorrectionChoreography[],
): string {
  const names = [...choreographiesWithoutCategory]
    .sort((a, b) => a.choreographyNumber - b.choreographyNumber)
    .map(
      (choreography) =>
        `n.º ${choreography.choreographyNumber} «${choreography.name}»`,
    );
  const isSingular = names.length === 1;
  const subject = isSingular
    ? `la coreografía ${names[0]}`
    : `las coreografías ${names.slice(0, -1).join(", ")} y ${names[names.length - 1]}`;

  return `Con esta fecha de nacimiento, ${subject} ${isSingular ? "queda" : "quedan"} sin categoría.`;
}

function toCorrectionChoreography(
  choreography: EligibleChoreographyRow,
): DancerBirthDateCorrectionChoreography {
  return {
    choreographyNumber: choreography.choreographyNumber,
    name: choreography.name,
  };
}

export async function loadLinkedChoreographyEventBasesForDancerBirthDateCorrection(input: {
  dancerId: string;
}) {
  const eligibleChoreographies = await listEligibleChoreographies(
    db,
    input.dancerId,
  );
  const eventIds = [
    ...new Set(eligibleChoreographies.map((row) => row.eventId)),
  ];
  const eventBasesEntries = await Promise.all(
    eventIds.map(
      async (eventId) => [eventId, await getEventBases(eventId)] as const,
    ),
  );

  return new Map(eventBasesEntries);
}

async function listEligibleChoreographies(
  executor: QueryExecutor,
  dancerId: string,
) {
  return executor
    .select({
      choreographyId: choreographies.id,
      choreographyNumber: choreographies.choreographyNumber,
      name: choreographies.name,
      eventId: choreographies.eventId,
      startsAt: events.startsAt,
      modalityId: choreographies.modalityId,
      categoryId: choreographies.categoryId,
      categoryAgeBasis: choreographies.categoryAgeBasis,
      categoryCalculationMode: choreographies.categoryCalculationMode,
      experienceLevelId: choreographies.experienceLevelId,
      correctedDancerCompetitiveAge: choreographyDancers.ageAtEventStart,
    })
    .from(choreographyDancers)
    .innerJoin(
      choreographies,
      eq(choreographyDancers.choreographyId, choreographies.id),
    )
    .innerJoin(events, eq(choreographies.eventId, events.id))
    .where(
      and(
        eq(choreographyDancers.dancerId, dancerId),
        eq(choreographies.hasPresentation, false),
        activeInscription(),
      ),
    );
}

function toCompetitivePlacementFromChoreography(
  choreography: EligibleChoreographyRow,
): ChoreographyCompetitivePlacement {
  return {
    categoryId: choreography.categoryId,
    categoryAgeBasis: choreography.categoryAgeBasis,
    categoryCalculationMode: choreography.categoryCalculationMode,
    experienceLevelId: choreography.experienceLevelId,
    dancerCompetitiveAge: choreography.correctedDancerCompetitiveAge,
  };
}

function toCompetitivePlacementFromResolution(input: {
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
    categoryId: getResolvedCategoryId(input.resolution),
    categoryAgeBasis: input.resolution.categoryAgeBasis,
    categoryCalculationMode: input.resolution.categoryCalculationMode,
    experienceLevelId: resolveRetainedExperienceLevelId({
      currentExperienceLevelId: input.currentExperienceLevelId,
      resolution: input.resolution,
    }),
    dancerCompetitiveAge: input.correctedDancer.ageAtEventStart,
  };
}

function hasCompetitivePlacementChanged(
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

function toExperienceLevelValue(value: string | null) {
  if (value === null || !isExperienceLevel(value)) {
    return null;
  }

  return value;
}

function groupLinkedDancersByChoreographyId(linkedDancers: LinkedDancerRow[]) {
  const linkedDancersByChoreographyId = new Map<string, LinkedDancerRow[]>();

  for (const linkedDancer of linkedDancers) {
    const choreographyLinkedDancers =
      linkedDancersByChoreographyId.get(linkedDancer.choreographyId) ?? [];
    choreographyLinkedDancers.push(linkedDancer);
    linkedDancersByChoreographyId.set(
      linkedDancer.choreographyId,
      choreographyLinkedDancers,
    );
  }

  return linkedDancersByChoreographyId;
}

async function persistResolvedDancers(input: {
  choreographyId: string;
  executor: QueryExecutor;
  resolvedDancers: ResolvedRegistrationDancer[];
}) {
  for (const dancer of input.resolvedDancers) {
    await input.executor
      .update(choreographyDancers)
      .set({
        ageAtEventStart: dancer.ageAtEventStart,
      })
      .where(
        and(
          eq(choreographyDancers.choreographyId, input.choreographyId),
          eq(choreographyDancers.dancerId, dancer.id),
        ),
      );
  }
}

function toResolvedDancers(
  linkedDancers: LinkedDancerRow[],
  eventLocalStartDate: ReturnType<typeof getEventLocalDateParts>,
) {
  return linkedDancers.map(
    (dancer) =>
      ({
        id: dancer.dancerId,
        firstName: dancer.firstName,
        lastName: dancer.lastName,
        ageAtEventStart: getAgeAtDate(dancer.birthDate, eventLocalStartDate),
      }) satisfies ResolvedRegistrationDancer,
  );
}

function getResolvedCategoryId(
  resolution: Pick<ChoreographyRegistrationOperationResolution, "category">,
) {
  return resolution.category.status === "resolved"
    ? resolution.category.id
    : null;
}

function resolveRetainedExperienceLevelId(input: {
  currentExperienceLevelId: string | null;
  resolution: Pick<
    ChoreographyRegistrationOperationResolution,
    "experienceLevel"
  >;
}) {
  if (!input.resolution.experienceLevel.required) {
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
