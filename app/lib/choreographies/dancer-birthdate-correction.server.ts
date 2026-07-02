import { and, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import {
  choreographies,
  choreographyDancers,
  dancers,
  events,
} from "@/db/schema";
import {
  getAgeAtDate,
  getEventLocalDateParts,
  resolveChoreographyClassificationForResolvedDancers,
  type ChoreographyRegistrationOperationResolution,
  type ResolvedRegistrationDancer,
} from "@/lib/choreographies/registration-resolution.server";
import type { ChoreographyBirthDateCorrectionAuditSnapshot } from "@/lib/choreographies/choreography-audit.server";
import { getEventBases, type EventBases } from "@/lib/events/bases.server";
import {
  experienceLevelLabels,
  isExperienceLevel,
} from "@/lib/events/experience-levels";

type DatabaseExecutor = Parameters<Parameters<typeof db.transaction>[0]>[0];
type QueryExecutor = typeof db | DatabaseExecutor;

type EligibleChoreographyRow = {
  choreographyId: string;
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

export type LinkedChoreographyBirthDateCorrectionChange = {
  choreographyId: string;
  eventId: string;
  beforeValues: ChoreographyBirthDateCorrectionAuditSnapshot;
  afterValues: ChoreographyBirthDateCorrectionAuditSnapshot;
};

export async function recalculateLinkedChoreographiesForDancerBirthDateCorrection(input: {
  dancerId: string;
  executor?: QueryExecutor;
  eventBasesByEventId?: Map<string, EventBases>;
}): Promise<LinkedChoreographyBirthDateCorrectionChange[]> {
  const executor = input.executor ?? db;
  const eligibleChoreographies = await listEligibleChoreographies(
    executor,
    input.dancerId,
  );

  if (eligibleChoreographies.length === 0) {
    return [];
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
    .where(inArray(choreographyDancers.choreographyId, choreographyIds));

  const linkedDancersByChoreographyId =
    groupLinkedDancersByChoreographyId(linkedDancers);
  const auditableChanges: LinkedChoreographyBirthDateCorrectionChange[] = [];

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
    const correctedDancer = choreographyLinkedDancers.find(
      (dancer) => dancer.dancerId === input.dancerId,
    );
    const correctedResolvedDancer = resolvedDancers.find(
      (dancer) => dancer.id === input.dancerId,
    );

    if (!correctedDancer || !correctedResolvedDancer) {
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

    await persistResolvedDancers({
      choreographyId: choreography.choreographyId,
      executor,
      resolvedDancers,
    });
    await executor
      .update(choreographies)
      .set({
        categoryId: afterPlacement.categoryId,
        categoryCalculationMode: afterPlacement.categoryCalculationMode,
        categoryAgeBasis: afterPlacement.categoryAgeBasis,
        experienceLevelId: toExperienceLevelValue(
          afterPlacement.experienceLevelId,
        ),
      })
      .where(eq(choreographies.id, choreography.choreographyId));

    auditableChanges.push({
      choreographyId: choreography.choreographyId,
      eventId: choreography.eventId,
      beforeValues: buildAuditSnapshot({
        categoryAgeBasis: beforePlacement.categoryAgeBasis,
        categoryCalculationMode: beforePlacement.categoryCalculationMode,
        categoryId: beforePlacement.categoryId,
        competitiveAge: beforePlacement.dancerCompetitiveAge,
        eventBases,
        experienceLevelId: beforePlacement.experienceLevelId,
        sourceDancer: correctedDancer,
      }),
      afterValues: buildAuditSnapshot({
        categoryAgeBasis: afterPlacement.categoryAgeBasis,
        categoryCalculationMode: afterPlacement.categoryCalculationMode,
        categoryId: afterPlacement.categoryId,
        competitiveAge: afterPlacement.dancerCompetitiveAge,
        eventBases,
        experienceLevelId: afterPlacement.experienceLevelId,
        sourceDancer: correctedDancer,
      }),
    });
  }

  return auditableChanges;
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
      ),
    );
}

function buildAuditSnapshot(input: {
  categoryId: string | null;
  categoryCalculationMode: EligibleChoreographyRow["categoryCalculationMode"];
  categoryAgeBasis: number | null;
  experienceLevelId: string | null;
  competitiveAge: number;
  sourceDancer: Pick<LinkedDancerRow, "dancerId" | "firstName" | "lastName">;
  eventBases: EventBases;
}): ChoreographyBirthDateCorrectionAuditSnapshot {
  return {
    sourceDancer: {
      id: input.sourceDancer.dancerId,
      firstName: input.sourceDancer.firstName,
      lastName: input.sourceDancer.lastName,
    },
    category: findNamedRecord(input.eventBases.categories, input.categoryId),
    categoryCalculationMode: input.categoryCalculationMode,
    categoryAgeBasis: input.categoryAgeBasis,
    experienceLevel: findExperienceLevelSnapshot(input.experienceLevelId),
    dancerCompetitiveAge: input.competitiveAge,
  };
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

function findNamedRecord(
  records: Array<{ id: string; name: string }>,
  id: string | null,
) {
  if (id === null) {
    return null;
  }

  const record = records.find((item) => item.id === id);

  return record ? { id: record.id, name: record.name } : null;
}

function findExperienceLevelSnapshot(value: string | null) {
  if (value === null || !isExperienceLevel(value)) {
    return null;
  }

  const name = experienceLevelLabels[value];

  return name ? { id: value, name } : null;
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
