import { eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import { events } from "@/db/schema";
import { getEventBases, type EventBases } from "@/lib/events/bases.server";
import { hasNeverExpiringPrice } from "@/lib/events/never-expiring-price";
import type {
  EventRegistrationMissingItem,
  EventRegistrationReadiness,
} from "@/lib/events/registration-readiness";
import { getBusinessDateOnly } from "@/lib/shared/business-time-zone";

type GroupType = "solo" | "duo" | "trio" | "grupal";

type RegistrationPathDescriptor = {
  categoryName: string;
  modalityName: string;
  groupType: string;
  requiresSubmodality: boolean;
  requiresExperienceLevel: boolean;
};

type ReadinessScheduleOption = {
  id: string;
  scheduleId: string;
  scheduleCapacityId: string | null;
  groupType: GroupType;
  capacity: number;
  createdAt: Date;
  usesGlobalCapacity: boolean;
  schedule: {
    id: string;
    name: string;
    scheduledDate: string;
    startTime: string;
  };
};

const baseMissingItemDefinitions = {
  modalities: {
    label: "Modalidades",
    detail: "Falta al menos una modalidad en este evento.",
  },
  categories: {
    label: "Categorías",
    detail: "Falta al menos una categoría en este evento.",
  },
  schedules: {
    label: "Cronogramas",
    detail: "Falta al menos un cronograma en este evento.",
  },
  "schedule-entries": {
    label: "Cupos de cronograma",
    detail: "Falta al menos un cupo de cronograma en este evento.",
  },
  prices: {
    label: "Precios",
    detail: "Falta al menos un precio en este evento.",
  },
} satisfies Record<
  "modalities" | "categories" | "schedules" | "schedule-entries" | "prices",
  Pick<EventRegistrationMissingItem, "label" | "detail">
>;

export async function getEventRegistrationReadiness(
  eventId: string,
): Promise<EventRegistrationReadiness> {
  // Derive both the reference date and the cache stamp from a single instant:
  // a calculation that starts before business midnight and writes after it
  // would otherwise be stamped with a day it never used, and look fresh all of
  // it.
  const calculatedAt = new Date();
  const referenceDate = getBusinessDateOnly(calculatedAt);
  const cachedReadiness = await db.query.events.findFirst({
    columns: {
      registrationReady: true,
      registrationReadinessMissingItems: true,
      registrationReadinessDirty: true,
      registrationReadinessCalculatedAt: true,
    },
    where: eq(events.id, eventId),
  });

  if (
    cachedReadiness &&
    isCachedReadinessUsable(cachedReadiness, referenceDate)
  ) {
    return {
      eventId,
      isReady: cachedReadiness.registrationReady,
      missingItems:
        cachedReadiness.registrationReadinessMissingItems as EventRegistrationMissingItem[],
    };
  }

  const readiness = await calculateEventRegistrationReadiness(
    eventId,
    referenceDate,
  );

  await saveEventRegistrationReadiness(readiness, calculatedAt);

  return readiness;
}

export async function getEventRegistrationReadinessByEventId(
  eventIds: string[],
): Promise<Map<string, EventRegistrationReadiness>> {
  const uniqueEventIds = [...new Set(eventIds)];

  if (uniqueEventIds.length === 0) {
    return new Map();
  }

  const referenceDate = getBusinessDateOnly();

  const cachedReadinessRows = await db.query.events.findMany({
    columns: {
      id: true,
      registrationReady: true,
      registrationReadinessMissingItems: true,
      registrationReadinessDirty: true,
      registrationReadinessCalculatedAt: true,
    },
    where: inArray(events.id, uniqueEventIds),
  });
  const cachedReadinessByEventId = new Map(
    cachedReadinessRows.map((row) => [row.id, row]),
  );
  const readinessByEventId = new Map<string, EventRegistrationReadiness>();
  const dirtyOrMissingEventIds: string[] = [];

  for (const eventId of uniqueEventIds) {
    const cachedReadiness = cachedReadinessByEventId.get(eventId);

    if (
      cachedReadiness &&
      isCachedReadinessUsable(cachedReadiness, referenceDate)
    ) {
      readinessByEventId.set(eventId, {
        eventId,
        isReady: cachedReadiness.registrationReady,
        missingItems:
          cachedReadiness.registrationReadinessMissingItems as EventRegistrationMissingItem[],
      });
      continue;
    }

    dirtyOrMissingEventIds.push(eventId);
  }

  await Promise.all(
    dirtyOrMissingEventIds.map(async (eventId) => {
      readinessByEventId.set(
        eventId,
        await getEventRegistrationReadiness(eventId),
      );
    }),
  );

  return readinessByEventId;
}

// Readiness depends on the current date (a price expires by the mere passage
// of time, with no write to dirty the cache), so an entry calculated on an
// earlier day is stale even when nothing was written since. "Day" is the
// business day here too: stamping the cache in UTC would both expire it three
// hours early every evening and keep serving it past business midnight.
function isCachedReadinessUsable(
  cachedReadiness: {
    registrationReadinessDirty: boolean;
    registrationReadinessCalculatedAt: Date | null;
  },
  referenceDate: string,
) {
  if (cachedReadiness.registrationReadinessDirty) {
    return false;
  }

  const calculatedAt = cachedReadiness.registrationReadinessCalculatedAt;

  return (
    calculatedAt !== null && getBusinessDateOnly(calculatedAt) === referenceDate
  );
}

export async function markEventRegistrationReadinessDirty(eventId: string) {
  await db
    .update(events)
    .set({ registrationReadinessDirty: true })
    .where(eq(events.id, eventId));
}

async function calculateEventRegistrationReadiness(
  eventId: string,
  referenceDate: string,
): Promise<EventRegistrationReadiness> {
  const eventBases = await getEventBases(eventId);

  return getEventRegistrationReadinessForBases(eventId, eventBases, {
    referenceDate,
  });
}

async function saveEventRegistrationReadiness(
  readiness: EventRegistrationReadiness,
  calculatedAt: Date,
) {
  await db
    .update(events)
    .set({
      registrationReady: readiness.isReady,
      registrationReadinessMissingItems: readiness.missingItems,
      registrationReadinessDirty: false,
      registrationReadinessCalculatedAt: calculatedAt,
    })
    .where(eq(events.id, readiness.eventId));
}

export async function getEventRegistrationReadinessForBases(
  eventId: string,
  eventBases: EventBases,
  options: { referenceDate?: string } = {},
): Promise<EventRegistrationReadiness> {
  const referenceDate = options.referenceDate ?? getBusinessDateOnly();
  const missingItems = collectBaseMissingItems(eventBases);

  const modalitiesById = new Map(
    eventBases.modalities.map((modality) => [modality.id, modality]),
  );

  missingItems.push(
    ...collectAgeCoverageMissingItems(eventBases, modalitiesById),
  );

  const submodalityCountByModalityId = countSubmodalitiesByModalityId(
    eventBases.submodalities,
  );

  for (const category of eventBases.categories) {
    const requiresExperienceLevel = category.experienceLevels.length > 0;

    for (const modalityId of category.modalityIds) {
      const modality = modalitiesById.get(modalityId);

      if (!modality) {
        continue;
      }

      const requiresSubmodality =
        (submodalityCountByModalityId.get(modalityId) ?? 0) > 0;

      for (const groupType of category.groupTypes) {
        const registrationPath = describeRegistrationPath({
          categoryName: category.name,
          modalityName: modality.name,
          groupType,
          requiresSubmodality,
          requiresExperienceLevel,
        });
        const scheduleResolution = resolveScheduleOptionsFromBases(eventBases, {
          modalityId,
          groupType,
        });

        if (scheduleResolution.status === "none") {
          missingItems.push({
            code: "schedule-compatibility",
            label: "Cupos de cronograma compatibles",
            detail: `Falta un cupo de cronograma compatible para ${registrationPath}.`,
          });
          continue;
        }

        const priceResolution = resolvePriceFromBases(eventBases, {
          groupType,
        });

        if (!priceResolution.ok) {
          missingItems.push({
            code: "price-coverage",
            label: "Precios aplicables",
            detail: priceResolution.lastDeadline
              ? `El último precio general para ${registrationPath} ${formatDeadlineExpiryVerb(priceResolution.lastDeadline, referenceDate)} el ${formatDeadline(priceResolution.lastDeadline)} y no hay uno sin fecha límite.`
              : `Falta un precio general sin fecha límite para ${registrationPath}.`,
          });
        }
      }
    }
  }

  const dedupedMissingItems = dedupeMissingItems(missingItems);

  return {
    eventId,
    isReady: dedupedMissingItems.length === 0,
    missingItems: dedupedMissingItems,
  };
}

// Every age a choreography can be registered with has to land on exactly one
// category, or the placement is either impossible or ambiguous. The floor is
// the same one the dancer guard enforces at registration, and the ceiling is
// the one the data already uses everywhere.
const youngestCoveredAge = 1;
const oldestCoveredAge = 100;

type AgeCoveragePair = {
  modalityName: string;
  groupType: GroupType;
  categoryCountByAge: number[];
};

type AgeRange = { from: number; to: number };

// Only the pairs the categories themselves reach are checked. A modality that
// declares no category for a group type is offering nothing there, which is the
// documented "no rule applies" case, not a hole in a ladder that exists.
function collectAgeCoverageMissingItems(
  eventBases: EventBases,
  modalitiesById: Map<string, { id: string; name: string }>,
) {
  const pairs = countCategoriesByAge(eventBases, modalitiesById);
  const missingItems: EventRegistrationMissingItem[] = [];

  for (const pair of pairs.values()) {
    missingItems.push(...describeAgeCoverageFailures(pair));
  }

  return missingItems;
}

function countCategoriesByAge(
  eventBases: EventBases,
  modalitiesById: Map<string, { id: string; name: string }>,
) {
  const pairs = new Map<string, AgeCoveragePair>();

  for (const category of eventBases.categories) {
    const reachedModalities = category.modalityIds
      .map((modalityId) => modalitiesById.get(modalityId))
      .filter((modality) => modality !== undefined);
    const reachedGroupTypes = category.groupTypes.filter(isGroupType);

    for (const modality of reachedModalities) {
      for (const groupType of reachedGroupTypes) {
        const pair = getOrCreateAgeCoveragePair(pairs, modality, groupType);
        const from = Math.max(category.minAge, youngestCoveredAge);
        const to = Math.min(category.maxAge, oldestCoveredAge);

        for (let age = from; age <= to; age += 1) {
          pair.categoryCountByAge[age - youngestCoveredAge] += 1;
        }
      }
    }
  }

  return pairs;
}

function getOrCreateAgeCoveragePair(
  pairs: Map<string, AgeCoveragePair>,
  modality: { id: string; name: string },
  groupType: GroupType,
) {
  const key = `${modality.id}\0${groupType}`;
  const existingPair = pairs.get(key);

  if (existingPair) {
    return existingPair;
  }

  const pair: AgeCoveragePair = {
    modalityName: modality.name,
    groupType,
    categoryCountByAge: new Array<number>(
      oldestCoveredAge - youngestCoveredAge + 1,
    ).fill(0),
  };

  pairs.set(key, pair);

  return pair;
}

function describeAgeCoverageFailures(pair: AgeCoveragePair) {
  const path = `Modalidad ${pair.modalityName}, Tipo de grupo ${formatGroupType(pair.groupType)}`;
  const uncovered = collectAgeRanges(
    pair.categoryCountByAge,
    (count) => count === 0,
  );
  const overlapping = collectAgeRanges(
    pair.categoryCountByAge,
    (count) => count > 1,
  );
  const missingItems: EventRegistrationMissingItem[] = [];

  if (uncovered.length > 0) {
    missingItems.push({
      code: "age-coverage",
      label: "Cobertura de edades",
      detail: `Faltan categorías para ${path}: sin cobertura para ${formatAgeRanges(uncovered)}.`,
    });
  }

  if (overlapping.length > 0) {
    missingItems.push({
      code: "age-coverage",
      label: "Cobertura de edades",
      detail: `Se superponen categorías para ${path}: más de una categoría para ${formatAgeRanges(overlapping)}.`,
    });
  }

  return missingItems;
}

function collectAgeRanges(
  categoryCountByAge: number[],
  matches: (count: number) => boolean,
) {
  const ranges: AgeRange[] = [];

  categoryCountByAge.forEach((count, index) => {
    if (!matches(count)) {
      return;
    }

    const age = index + youngestCoveredAge;
    const lastRange = ranges.at(-1);

    if (lastRange && lastRange.to === age - 1) {
      lastRange.to = age;
      return;
    }

    ranges.push({ from: age, to: age });
  });

  return ranges;
}

function formatAgeRanges(ranges: AgeRange[]) {
  return ranges
    .map((range) =>
      range.from === range.to
        ? `la edad ${range.from}`
        : `las edades ${range.from} a ${range.to}`,
    )
    .join(", ");
}

function collectBaseMissingItems(eventBases: EventBases) {
  const missingItems: EventRegistrationMissingItem[] = [];

  if (eventBases.modalities.length === 0) {
    missingItems.push({
      code: "modalities",
      ...baseMissingItemDefinitions.modalities,
    });
  }

  if (eventBases.categories.length === 0) {
    missingItems.push({
      code: "categories",
      ...baseMissingItemDefinitions.categories,
    });
  }

  if (eventBases.schedules.length === 0) {
    missingItems.push({
      code: "schedules",
      ...baseMissingItemDefinitions["schedules"],
    });
  }

  if (eventBases.prices.length === 0) {
    missingItems.push({ code: "prices", ...baseMissingItemDefinitions.prices });
  }

  return missingItems;
}

function countSubmodalitiesByModalityId(
  submodalities: EventBases["submodalities"],
) {
  const counts = new Map<string, number>();

  for (const submodality of submodalities) {
    counts.set(
      submodality.modalityId,
      (counts.get(submodality.modalityId) ?? 0) + 1,
    );
  }

  return counts;
}

function resolveScheduleOptionsFromBases(
  eventBases: EventBases,
  input: { modalityId: string; groupType: string },
) {
  if (!isGroupType(input.groupType)) {
    return { status: "none" as const, options: [] };
  }

  const groupType = input.groupType;
  const options: ReadinessScheduleOption[] = eventBases.schedules.flatMap(
    (schedule): ReadinessScheduleOption[] => {
      if (!schedule.modalityIds.includes(input.modalityId)) {
        return [];
      }

      const specificCapacity = schedule.scheduleCapacities.find(
        (capacity) => capacity.groupType === groupType,
      );

      if (specificCapacity) {
        return [
          {
            ...specificCapacity,
            scheduleCapacityId: specificCapacity.id,
            usesGlobalCapacity: false,
            schedule: {
              id: schedule.id,
              name: schedule.name,
              scheduledDate: schedule.scheduledDate,
              startTime: schedule.startTime,
            },
          },
        ];
      }

      return [
        {
          id: `schedule:${schedule.id}:global`,
          scheduleId: schedule.id,
          scheduleCapacityId: null,
          groupType,
          capacity: schedule.totalCapacity,
          createdAt: schedule.createdAt,
          usesGlobalCapacity: true,
          schedule: {
            id: schedule.id,
            name: schedule.name,
            scheduledDate: schedule.scheduledDate,
            startTime: schedule.startTime,
          },
        },
      ];
    },
  );

  if (options.length === 0) {
    return { status: "none" as const, options: [] };
  }

  if (options.length === 1) {
    return {
      status: "auto" as const,
      scheduleCapacity: options[0],
      options: [options[0]],
    };
  }

  return { status: "multiple" as const, options };
}

// Readiness does not ask whether a price applies today, but whether the path
// can ever stop resolving: a row with no paymentDeadline is what keeps an open
// event from expiring silently mid-registration, and because it is applicable
// at every date it answers the today-question on its own.
// Only the general tier counts. A schedule-specific row with no deadline stays
// allowed — a schedule may want its own tail — but it does not cover the path:
// `resolveApplicablePrice` never consults the schedule tier when the caller
// hands it a null scheduleId, so such a path would still yield `missing-price`.
function resolvePriceFromBases(
  eventBases: EventBases,
  input: { groupType: string },
) {
  if (!isGroupType(input.groupType)) {
    return { ok: false as const, lastDeadline: null };
  }

  const generalCandidates = eventBases.prices.filter(
    (price) => price.groupType === input.groupType && price.scheduleId === null,
  );

  if (hasNeverExpiringPrice(generalCandidates)) {
    return { ok: true as const };
  }

  return {
    ok: false as const,
    lastDeadline: findLatestDeadline(generalCandidates),
  };
}

function findLatestDeadline(candidates: EventBases["prices"]) {
  return (
    candidates
      .map((price) => price.paymentDeadline)
      .filter((deadline): deadline is string => deadline !== null)
      .sort()
      .at(-1) ?? null
  );
}

function describeRegistrationPath(input: RegistrationPathDescriptor) {
  const details = [
    `Categoría ${input.categoryName}`,
    `Modalidad ${input.modalityName}`,
    `Tipo de grupo ${formatGroupType(input.groupType)}`,
  ];

  if (input.requiresSubmodality) {
    details.push("requiere Submodalidad");
  }

  if (input.requiresExperienceLevel) {
    details.push("requiere Nivel de experiencia");
  }

  return details.join(", ");
}

// Same shape the admin prices table uses to render a paymentDeadline, so the
// readiness message and the row it points at read the same. UTC, because a
// paymentDeadline is a date-only value with no time zone of its own.
const deadlineFormatter = new Intl.DateTimeFormat("es-AR", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

// The lead-time warning reads the same before and after the fact, so the copy
// only has to move the verb between past and present.
function formatDeadlineExpiryVerb(deadline: string, referenceDate: string) {
  return deadline < referenceDate ? "venció" : "vence";
}

function formatDeadline(deadline: string) {
  const parsed = new Date(`${deadline}T00:00:00.000Z`);

  if (Number.isNaN(parsed.getTime())) {
    return deadline;
  }

  return deadlineFormatter.format(parsed);
}

function formatGroupType(groupType: string) {
  switch (groupType) {
    case "solo":
      return "Solo";
    case "duo":
      return "Dúo";
    case "trio":
      return "Trío";
    case "grupal":
      return "Grupal";
    default:
      return groupType;
  }
}

function isGroupType(value: string): value is GroupType {
  return (
    value === "solo" ||
    value === "duo" ||
    value === "trio" ||
    value === "grupal"
  );
}

function dedupeMissingItems(items: EventRegistrationMissingItem[]) {
  const seen = new Set<string>();

  return items.filter((item) => {
    const key = `${item.code}\0${item.detail}`;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}
