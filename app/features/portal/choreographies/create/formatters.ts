import type { ChoreographyRegistrationBaseOptions } from "@/lib/events/bases.server";
import {
  formatGroupTypeLabel,
  type RegistrationResolution,
} from "@/features/portal/choreographies/create/flow";
import { formatScheduleDateTime } from "@/lib/choreographies/schedule-formatters";

type SummaryPerson = {
  firstName: string;
  lastName: string;
};

export function formatModalitySummary(
  baseOptions: ChoreographyRegistrationBaseOptions,
  modalityId: string,
  submodalityId: string,
) {
  const modalityName =
    baseOptions.modalities.find((modality) => modality.id === modalityId)
      ?.name ?? "Pendiente";

  if (!submodalityId) {
    return modalityName;
  }

  const submodalityName = baseOptions.submodalities.find(
    (submodality) => submodality.id === submodalityId,
  )?.name;

  if (!submodalityName) {
    return modalityName;
  }

  return `${modalityName} - ${submodalityName}`;
}

export function formatCategoryAndGroupTypeSummary(
  resolution: RegistrationResolution,
) {
  const categoryName =
    resolution.category.status === "resolved"
      ? resolution.category.name
      : "Sin confirmar";

  return `${categoryName} - ${formatGroupTypeLabel(resolution.groupType)}`;
}

export function formatExperienceLevelSummary(
  resolution: RegistrationResolution,
  selectedExperienceLevelId: string,
) {
  return (
    resolution.experienceLevel.options.find(
      (option) => option.id === selectedExperienceLevelId,
    )?.name ?? "Pendiente"
  );
}

export function formatScheduleSummary(
  resolution: RegistrationResolution,
  scheduleCapacityId: string,
) {
  const selectedOption =
    resolution.schedule.status === "auto"
      ? resolution.schedule.options[0]
      : resolution.schedule.options.find(
          (option) => option.id === scheduleCapacityId,
        );

  if (!selectedOption) {
    return "Pendiente";
  }

  return formatScheduleDateTime(selectedOption.schedule);
}

export function formatRosterSummary(
  roster: SummaryPerson[],
  noun: "bailarines" | "profesores",
) {
  if (roster.length === 0) {
    if (noun === "profesores") {
      return "Sin profesores seleccionados";
    }

    return "Sin bailarines seleccionados";
  }

  if (roster.length > 3) {
    return `${roster.length} ${noun} seleccionados`;
  }

  return roster
    .map((person) => `${person.firstName} ${person.lastName}`)
    .join(" - ");
}
