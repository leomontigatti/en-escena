import { eq } from "drizzle-orm";

import { db } from "@/db";
import { events } from "@/db/schema";
import { getEventBases, type EventBases } from "@/lib/events/bases.server";
import type {
  EventRegistrationMissingItem,
  EventRegistrationReadiness,
} from "@/lib/events/registration-readiness";

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
  const cachedReadiness = await db.query.events.findFirst({
    columns: {
      registrationReady: true,
      registrationReadinessMissingItems: true,
      registrationReadinessDirty: true,
    },
    where: eq(events.id, eventId),
  });

  if (cachedReadiness && !cachedReadiness.registrationReadinessDirty) {
    return {
      eventId,
      isReady: cachedReadiness.registrationReady,
      missingItems:
        cachedReadiness.registrationReadinessMissingItems as EventRegistrationMissingItem[],
    };
  }

  const readiness = await calculateEventRegistrationReadiness(eventId);

  await saveEventRegistrationReadiness(readiness);

  return readiness;
}

export async function markEventRegistrationReadinessDirty(eventId: string) {
  await db
    .update(events)
    .set({ registrationReadinessDirty: true })
    .where(eq(events.id, eventId));
}

async function calculateEventRegistrationReadiness(
  eventId: string,
): Promise<EventRegistrationReadiness> {
  const eventBases = await getEventBases(eventId);

  return getEventRegistrationReadinessForBases(eventId, eventBases);
}

async function saveEventRegistrationReadiness(
  readiness: EventRegistrationReadiness,
) {
  await db
    .update(events)
    .set({
      registrationReady: readiness.isReady,
      registrationReadinessMissingItems: readiness.missingItems,
      registrationReadinessDirty: false,
      registrationReadinessCalculatedAt: new Date(),
    })
    .where(eq(events.id, readiness.eventId));
}

export async function getEventRegistrationReadinessForBases(
  eventId: string,
  eventBases: EventBases,
): Promise<EventRegistrationReadiness> {
  const missingItems = collectBaseMissingItems(eventBases);

  const modalitiesById = new Map(
    eventBases.modalities.map((modality) => [modality.id, modality]),
  );
  const submodalityCountByModalityId = countSubmodalitiesByModalityId(
    eventBases.submodalities,
  );

  for (const category of eventBases.categories) {
    const requiresExperienceLevel = category.experienceLevelIds.length > 0;

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
          });

          if (!priceResolution.ok) {
            missingItems.push({
              code: "price-coverage",
              label: "Precios aplicables",
              detail: `Falta un precio aplicable para ${registrationPath} en el cronograma ${option.schedule.name}.`,
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
  input: { groupType: string; scheduleId: string | null },
) {
  if (!isGroupType(input.groupType)) {
    return { ok: false as const };
  }

  if (input.scheduleId) {
    const specificPrice = selectApplicablePrice(
      eventBases.prices.filter(
        (price) =>
          price.groupType === input.groupType &&
          price.scheduleId === input.scheduleId,
      ),
    );

    if (specificPrice) {
      return { ok: true as const, price: specificPrice };
    }
  }

  const generalPrice = selectApplicablePrice(
    eventBases.prices.filter(
      (price) =>
        price.groupType === input.groupType && price.scheduleId === null,
    ),
  );

  if (generalPrice) {
    return { ok: true as const, price: generalPrice };
  }

  return { ok: false as const };
}

function selectApplicablePrice(candidates: EventBases["prices"]) {
  return [...candidates].sort(compareApplicablePrices)[0] ?? null;
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
