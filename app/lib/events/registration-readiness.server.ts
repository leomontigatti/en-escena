import { eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import { events } from "@/db/schema";
import { getEventBases, type EventBases } from "@/lib/events/bases.server";
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

// Readiness depends on the current date (a precio expires by the mere passage
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

        for (const option of scheduleResolution.options) {
          const priceResolution = resolvePriceFromBases(eventBases, {
            groupType,
            scheduleId: option.schedule.id,
            referenceDate,
          });

          if (!priceResolution.ok) {
            missingItems.push({
              code: "price-coverage",
              label: "Precios aplicables",
              detail: priceResolution.expiredDeadline
                ? `El precio para ${registrationPath} en el cronograma ${option.schedule.name} venció el ${formatDeadline(priceResolution.expiredDeadline)} y no hay otro vigente.`
                : `Falta un precio aplicable para ${registrationPath} en el cronograma ${option.schedule.name}.`,
            });
          }
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

function resolvePriceFromBases(
  eventBases: EventBases,
  input: {
    groupType: string;
    scheduleId: string | null;
    referenceDate: string;
  },
) {
  if (!isGroupType(input.groupType)) {
    return { ok: false as const, expiredDeadline: null };
  }

  const scheduleCandidates = input.scheduleId
    ? eventBases.prices.filter(
        (price) =>
          price.groupType === input.groupType &&
          price.scheduleId === input.scheduleId,
      )
    : [];
  const specificPrice = selectApplicablePrice(
    scheduleCandidates,
    input.referenceDate,
  );

  if (specificPrice) {
    return { ok: true as const, price: specificPrice };
  }

  const generalCandidates = eventBases.prices.filter(
    (price) => price.groupType === input.groupType && price.scheduleId === null,
  );
  const generalPrice = selectApplicablePrice(
    generalCandidates,
    input.referenceDate,
  );

  if (generalPrice) {
    return { ok: true as const, price: generalPrice };
  }

  return {
    ok: false as const,
    expiredDeadline: findLatestDeadline([
      ...scheduleCandidates,
      ...generalCandidates,
    ]),
  };
}

// Same rule as the runtime resolver (`selectApplicablePriceFromCandidates`):
// a row whose paymentDeadline already passed cannot be charged, and there is
// no fallback to an expired row.
function selectApplicablePrice(
  candidates: EventBases["prices"],
  referenceDate: string,
) {
  return (
    candidates
      .filter(
        (price) =>
          price.paymentDeadline === null ||
          price.paymentDeadline >= referenceDate,
      )
      .sort(compareApplicablePrices)[0] ?? null
  );
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

function compareApplicablePrices(
  first: EventBases["prices"][number],
  second: EventBases["prices"][number],
) {
  if (first.paymentDeadline === null && second.paymentDeadline !== null) {
    return 1;
  }

  if (first.paymentDeadline !== null && second.paymentDeadline === null) {
    return -1;
  }

  if (first.paymentDeadline && second.paymentDeadline) {
    const deadlineComparison = first.paymentDeadline.localeCompare(
      second.paymentDeadline,
    );

    if (deadlineComparison !== 0) {
      return deadlineComparison;
    }
  }

  return first.amount - second.amount;
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

// Same shape the admin precios table uses to render a paymentDeadline, so the
// readiness message and the row it points at read the same. UTC, because a
// paymentDeadline is a date-only value with no time zone of its own.
const deadlineFormatter = new Intl.DateTimeFormat("es-AR", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

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
