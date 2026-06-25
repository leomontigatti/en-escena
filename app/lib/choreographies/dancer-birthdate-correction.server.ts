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
import { getEventBases, type EventBases } from "@/lib/events/bases.server";
import type { ChoreographyBirthDateCorrectionAuditSnapshot } from "@/lib/choreographies/choreography-audit.server";

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
  const changedChoreographies: LinkedChoreographyBirthDateCorrectionChange[] =
    [];

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

    const nextCategoryId = getResolvedCategoryId(resolution);
    const nextCategoryCalculationMode = resolution.categoryCalculationMode;
    const nextCategoryAgeBasis = resolution.categoryAgeBasis;
    const nextExperienceLevelId = resolveRetainedExperienceLevelId({
      currentExperienceLevelId: choreography.experienceLevelId,
      resolution,
    });
    const nextCompetitiveAge = correctedResolvedDancer.ageAtEventStart;
    const changed =
      choreography.categoryId !== nextCategoryId ||
      choreography.categoryCalculationMode !== nextCategoryCalculationMode ||
      choreography.categoryAgeBasis !== nextCategoryAgeBasis ||
      choreography.experienceLevelId !== nextExperienceLevelId ||
      choreography.correctedDancerCompetitiveAge !== nextCompetitiveAge;

    if (!changed) {
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
        categoryId: nextCategoryId,
        categoryCalculationMode: nextCategoryCalculationMode,
        categoryAgeBasis: nextCategoryAgeBasis,
        experienceLevelId: nextExperienceLevelId,
      })
      .where(eq(choreographies.id, choreography.choreographyId));

    changedChoreographies.push({
      choreographyId: choreography.choreographyId,
      eventId: choreography.eventId,
      beforeValues: buildAuditSnapshot({
        categoryAgeBasis: choreography.categoryAgeBasis,
        categoryCalculationMode: choreography.categoryCalculationMode,
        categoryId: choreography.categoryId,
        competitiveAge: choreography.correctedDancerCompetitiveAge,
        eventBases,
        experienceLevelId: choreography.experienceLevelId,
        sourceDancer: correctedDancer,
      }),
      afterValues: buildAuditSnapshot({
        categoryAgeBasis: nextCategoryAgeBasis,
        categoryCalculationMode: nextCategoryCalculationMode,
        categoryId: nextCategoryId,
        competitiveAge: nextCompetitiveAge,
        eventBases,
        experienceLevelId: nextExperienceLevelId,
        sourceDancer: correctedDancer,
      }),
    });
  }

  return changedChoreographies;
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
    experienceLevel: findNamedRecord(
      input.eventBases.experienceLevels,
      input.experienceLevelId,
    ),
    dancerCompetitiveAge: input.competitiveAge,
  };
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
    input.resolution.experienceLevel.options.some(
      (option) => option.id === input.currentExperienceLevelId,
    )
  ) {
    return input.currentExperienceLevelId;
  }

  return null;
}
