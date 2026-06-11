import {
  listEventCatalogs,
  resolveApplicablePrice,
  resolveCompatibleScheduleEntries,
} from "@/lib/admin-catalogs.server";
import type {
  EventRegistrationMissingItem,
  EventRegistrationReadiness,
} from "@/lib/event-registration-readiness";

type RegistrationPathDescriptor = {
  categoryName: string;
  modalityName: string;
  groupType: string;
  requiresSubmodality: boolean;
  requiresExperienceLevel: boolean;
};

const baseMissingItemDefinitions = {
  modalities: {
    label: "Modalidades",
    detail: "Falta al menos una Modalidad en este Evento.",
  },
  categories: {
    label: "Categorías",
    detail: "Falta al menos una Categoría en este Evento.",
  },
  "schedule-blocks": {
    label: "Bloques horarios",
    detail: "Falta al menos un Bloque horario en este Evento.",
  },
  "schedule-entries": {
    label: "Cronogramas",
    detail: "Falta al menos un Cronograma en este Evento.",
  },
  prices: {
    label: "Precios",
    detail: "Falta al menos un Precio en este Evento.",
  },
} satisfies Record<
  | "modalities"
  | "categories"
  | "schedule-blocks"
  | "schedule-entries"
  | "prices",
  Pick<EventRegistrationMissingItem, "label" | "detail">
>;

export async function getEventRegistrationReadiness(
  eventId: string,
): Promise<EventRegistrationReadiness> {
  const catalogs = await listEventCatalogs(eventId);
  const missingItems = collectBaseMissingItems(catalogs);

  const modalitiesById = new Map(
    catalogs.modalities.map((modality) => [modality.id, modality]),
  );
  const submodalityCountByModalityId = countSubmodalitiesByModalityId(
    catalogs.submodalities,
  );

  for (const category of catalogs.categories) {
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
        const scheduleResolution = await resolveCompatibleScheduleEntries({
          eventId,
          modalityId,
          groupType,
        });

        if (scheduleResolution.status === "none") {
          missingItems.push({
            code: "schedule-compatibility",
            label: "Cronogramas compatibles",
            detail: `Falta un Cronograma compatible para ${registrationPath}.`,
          });
          continue;
        }

        for (const option of scheduleResolution.options) {
          const priceResolution = await resolveApplicablePrice({
            eventId,
            groupType,
            scheduleBlockId: option.scheduleBlock.id,
          });

          if (!priceResolution.ok) {
            missingItems.push({
              code: "price-coverage",
              label: "Precios aplicables",
              detail: `Falta un Precio aplicable para ${registrationPath} en el Bloque horario ${option.scheduleBlock.name}.`,
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

function collectBaseMissingItems(
  catalogs: Awaited<ReturnType<typeof listEventCatalogs>>,
) {
  const missingItems: EventRegistrationMissingItem[] = [];

  if (catalogs.modalities.length === 0) {
    missingItems.push({
      code: "modalities",
      ...baseMissingItemDefinitions.modalities,
    });
  }

  if (catalogs.categories.length === 0) {
    missingItems.push({
      code: "categories",
      ...baseMissingItemDefinitions.categories,
    });
  }

  if (catalogs.scheduleBlocks.length === 0) {
    missingItems.push({
      code: "schedule-blocks",
      ...baseMissingItemDefinitions["schedule-blocks"],
    });
  }

  const hasScheduleEntries = catalogs.scheduleBlocks.some(
    (scheduleBlock) => scheduleBlock.scheduleEntries.length > 0,
  );

  if (!hasScheduleEntries) {
    missingItems.push({
      code: "schedule-entries",
      ...baseMissingItemDefinitions["schedule-entries"],
    });
  }

  if (catalogs.prices.length === 0) {
    missingItems.push({ code: "prices", ...baseMissingItemDefinitions.prices });
  }

  return missingItems;
}

function countSubmodalitiesByModalityId(
  submodalities: Awaited<ReturnType<typeof listEventCatalogs>>["submodalities"],
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
