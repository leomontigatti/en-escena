import { and, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import {
  choreographies,
  choreographyDancers,
  dancers,
  events,
} from "@/db/schema";
import {
  resolveChoreographyClassificationForResolvedDancers,
  type ChoreographyRegistrationOperationResolution,
  type ResolvedRegistrationDancer,
} from "@/lib/choreographies/registration-resolution.server";
import { getEventBases, type EventBases } from "@/lib/events/bases.server";
import { BUSINESS_TIME_ZONE } from "@/lib/shared/business-time-zone";

type DatabaseExecutor = Parameters<Parameters<typeof db.transaction>[0]>[0];
type QueryExecutor = typeof db | DatabaseExecutor;

type EligibleChoreographyRow = {
  choreographyId: string;
  eventId: string;
  startsAt: Date;
  modalityId: string;
  submodalityId: string | null;
  experienceLevelId: string | null;
};

type LinkedDancerRow = {
  choreographyId: string;
  dancerId: string;
  firstName: string;
  lastName: string;
  birthDate: string;
};

type LocalDateParts = {
  year: number;
  month: number;
  day: number;
};

export async function recalculateLinkedChoreographiesForDancerBirthDateCorrection(input: {
  dancerId: string;
  executor?: QueryExecutor;
  eventBasesByEventId?: Map<string, EventBases>;
}) {
  const executor = input.executor ?? db;
  const eligibleChoreographies = await listEligibleChoreographies(
    executor,
    input.dancerId,
  );

  if (eligibleChoreographies.length === 0) {
    return;
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

  for (const choreography of eligibleChoreographies) {
    const resolvedDancers = toResolvedDancers(
      linkedDancersByChoreographyId.get(choreography.choreographyId) ?? [],
      getLocalDateParts(choreography.startsAt),
    );
    const eventBases =
      input.eventBasesByEventId?.get(choreography.eventId) ??
      (await getEventBases(choreography.eventId));
    const resolution = resolveChoreographyClassificationForResolvedDancers({
      eventBases,
      modalityId: choreography.modalityId,
      dancers: resolvedDancers,
    });

    await persistResolvedDancers({
      choreographyId: choreography.choreographyId,
      executor,
      resolvedDancers,
    });
    await executor
      .update(choreographies)
      .set({
        categoryId: getResolvedCategoryId(resolution),
        categoryCalculationMode: resolution.categoryCalculationMode,
        categoryAgeBasis: resolution.categoryAgeBasis,
        experienceLevelId: resolveRetainedExperienceLevelId({
          currentExperienceLevelId: choreography.experienceLevelId,
          resolution,
        }),
      })
      .where(eq(choreographies.id, choreography.choreographyId));
  }
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
      submodalityId: choreographies.submodalityId,
      experienceLevelId: choreographies.experienceLevelId,
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
  eventLocalStartDate: LocalDateParts,
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

function getLocalDateParts(date: Date) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: BUSINESS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(date);
  const partMap = new Map(parts.map((part) => [part.type, part.value]));

  return {
    year: Number(partMap.get("year")),
    month: Number(partMap.get("month")),
    day: Number(partMap.get("day")),
  } satisfies LocalDateParts;
}

function getAgeAtDate(birthDate: string, date: LocalDateParts) {
  const [birthYear, birthMonth, birthDay] = birthDate
    .split("-")
    .map((value) => Number(value));
  const hasHadBirthday =
    date.month > birthMonth ||
    (date.month === birthMonth && date.day >= birthDay);

  return date.year - birthYear - (hasHadBirthday ? 0 : 1);
}
