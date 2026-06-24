import {
  buildScheduleDetailPath,
  buildSchedulesPath,
  isScheduleDetailPath,
} from "@/lib/admin/events/event-bases-navigation";
import {
  readScheduleCapacityActionValues,
  readScheduleCapacityActionValuesList,
} from "@/lib/admin/events/bases-action/input.server";
import type {
  ActionErrorScope,
  EventBasesActionInput,
  EventBasesActionResult,
  EventBasesActionValues,
  RequiredFieldErrorResult,
  ScheduleActionValues,
  ScheduleCapacityActionValues,
} from "@/lib/admin/events/bases-action/shared.server";
import {
  buildDefaultActionErrorScope,
  buildParentRecordActionScope,
  buildRecordActionScope,
  buildRequiredFieldError,
  getRequiredArrayErrors,
  getRequiredErrors,
  hasEventBaseRecord,
  invalidEventBasesActionResult,
  withEventBasesNotification,
} from "@/lib/admin/events/bases-action/shared.server";
import {
  createScheduleCapacity,
  createScheduleWithEntries,
  deleteSchedule,
  deleteScheduleCapacity,
  type ScheduleCapacityInput,
  type ScheduleInput,
  type ScheduleWithEntriesInput,
  updateScheduleCapacity,
  updateScheduleWithEntries,
} from "@/lib/events/bases-repository.server";

const scheduleSavedNotification = "cronograma-guardado";
const scheduleDeletedNotification = "cronograma-eliminado";
const scheduleCapacitySavedNotification = "cupo-cronograma-guardado";
const scheduleCapacityDeletedNotification = "cupo-cronograma-eliminado";
const scheduleDeleteConfirmationMessage =
  "Confirmá el borrado del cronograma antes de continuar.";

export function handlesScheduleIntent(intent: string) {
  return (
    intent === "create-schedule" ||
    intent === "update-schedule" ||
    intent === "delete-schedule" ||
    intent === "create-schedule-capacity" ||
    intent === "update-schedule-capacity" ||
    intent === "delete-schedule-capacity"
  );
}

export function getScheduleConfirmationError(
  requestUrl: string,
  input: EventBasesActionInput,
) {
  if (
    input.intent === "delete-schedule" &&
    isScheduleDetailPath(requestUrl) &&
    !input.confirmDelete
  ) {
    return {
      message: scheduleDeleteConfirmationMessage,
      fieldErrors: {
        confirmDelete: scheduleDeleteConfirmationMessage,
      },
    };
  }

  return null;
}

export function getScheduleRequiredFieldErrors(
  input: EventBasesActionInput,
  formData: FormData,
): RequiredFieldErrorResult | null {
  switch (input.intent) {
    case "create-schedule":
    case "update-schedule":
      return getScheduleMutationRequiredFieldErrors(formData);
    case "create-schedule-capacity":
    case "update-schedule-capacity":
      return getScheduleCapacityRequiredFieldErrors(formData);
    default:
      return null;
  }
}

export function buildScheduleActionErrorScope(
  input: EventBasesActionInput,
): ActionErrorScope | null {
  if (!handlesScheduleIntent(input.intent)) {
    return buildDefaultActionErrorScope(input);
  }

  if (input.intent === "create-schedule-capacity") {
    return buildParentRecordActionScope(input.intent, input.scheduleId);
  }

  return buildRecordActionScope(input.intent, input.id);
}

export function readScheduleSubmittedValues(
  input: EventBasesActionInput,
  formData: FormData,
): EventBasesActionValues | undefined {
  if (
    input.intent === "create-schedule" ||
    input.intent === "update-schedule"
  ) {
    return readScheduleActionValues(formData);
  }

  if (
    input.intent === "create-schedule-capacity" ||
    input.intent === "update-schedule-capacity"
  ) {
    return readScheduleCapacityActionValues(formData);
  }

  return undefined;
}

export async function runScheduleIntent(
  input: EventBasesActionInput,
): Promise<EventBasesActionResult> {
  switch (input.intent) {
    case "create-schedule":
      return createScheduleWithEntries(
        input.eventId,
        getScheduleWithEntriesInput(input),
      );
    case "update-schedule":
      return updateScheduleWithEntries(
        input.id,
        getScheduleWithEntriesInput(input),
      );
    case "delete-schedule":
      return deleteSchedule(input.id);
    case "create-schedule-capacity":
      return createScheduleCapacity(
        input.scheduleId,
        getScheduleCapacityInput(input),
      );
    case "update-schedule-capacity":
      return updateScheduleCapacity(input.id, getScheduleCapacityInput(input));
    case "delete-schedule-capacity":
      return deleteScheduleCapacity(input.id);
    default:
      return invalidEventBasesActionResult();
  }
}

export function buildScheduleRedirectUrl(
  requestUrl: string,
  input: EventBasesActionInput,
  result: EventBasesActionResult,
) {
  const currentUrl = new URL(requestUrl);

  if (input.intent === "delete-schedule") {
    return withEventBasesNotification(
      buildSchedulesPath(null),
      scheduleDeletedNotification,
    );
  }

  if (input.intent === "delete-schedule-capacity") {
    return withEventBasesNotification(
      currentUrl.pathname,
      scheduleCapacityDeletedNotification,
    );
  }

  if (
    input.intent === "create-schedule" &&
    result.ok &&
    hasEventBaseRecord(result)
  ) {
    return withEventBasesNotification(
      buildScheduleDetailPath(result.record.id, null),
      scheduleSavedNotification,
    );
  }

  if (
    input.intent === "create-schedule" ||
    input.intent === "update-schedule"
  ) {
    return withEventBasesNotification(
      currentUrl.pathname,
      scheduleSavedNotification,
    );
  }

  if (
    input.intent === "create-schedule-capacity" ||
    input.intent === "update-schedule-capacity"
  ) {
    return withEventBasesNotification(
      currentUrl.pathname,
      scheduleCapacitySavedNotification,
    );
  }

  return currentUrl.pathname;
}

function readScheduleActionValues(formData: FormData): ScheduleActionValues {
  return {
    name: String(formData.get("name") ?? ""),
    scheduledDate: String(formData.get("scheduledDate") ?? ""),
    startTime: String(formData.get("startTime") ?? ""),
    totalCapacity: String(formData.get("totalCapacity") ?? ""),
    modalityIds: formData.getAll("modalityIds").map(String),
    scheduleCapacities: readScheduleCapacityActionValuesList(formData),
  };
}

function getScheduleMutationRequiredFieldErrors(
  formData: FormData,
): RequiredFieldErrorResult | null {
  const fieldErrors = {
    ...getRequiredErrors({
      name: formData.get("name"),
      scheduledDate: formData.get("scheduledDate"),
      startTime: formData.get("startTime"),
      totalCapacity: formData.get("totalCapacity"),
    }),
    ...getRequiredArrayErrors({
      modalityIds: formData.getAll("modalityIds"),
    }),
    ...getScheduleCapacitiesRequiredFieldErrors(formData),
  };

  return buildRequiredFieldError(
    "Revisá los datos del cronograma.",
    fieldErrors,
  );
}

function getScheduleCapacitiesRequiredFieldErrors(formData: FormData) {
  const fieldErrors: Record<string, string> = {};
  const entryIndexes = getScheduleCapacityIndexes(formData);

  for (const index of entryIndexes) {
    const capacity = formData.get(`scheduleCapacities.${index}.capacity`);
    const groupType = formData.get(`scheduleCapacities.${index}.groupType`);

    if (typeof capacity !== "string" || capacity.trim().length === 0) {
      fieldErrors[`scheduleCapacities.${index}.capacity`] =
        "Este campo es obligatorio.";
    }

    if (typeof groupType !== "string" || groupType.trim().length === 0) {
      fieldErrors[`scheduleCapacities.${index}.groupType`] =
        "Este campo es obligatorio.";
    }
  }

  return fieldErrors;
}

function getScheduleCapacityIndexes(formData: FormData) {
  const indexes = new Set<number>();

  for (const key of formData.keys()) {
    const match = /^scheduleCapacities\.(\d+)\./.exec(key);

    if (!match) {
      continue;
    }

    indexes.add(Number.parseInt(match[1] ?? "", 10));
  }

  return Array.from(indexes).sort(
    (firstIndex, secondIndex) => firstIndex - secondIndex,
  );
}

function getScheduleCapacityRequiredFieldErrors(
  formData: FormData,
): RequiredFieldErrorResult | null {
  const fieldErrors = getRequiredErrors({
    capacity: formData.get("capacity"),
    groupType: formData.get("groupType"),
  });

  return buildRequiredFieldError(
    "Revisá los datos del cupo de cronograma.",
    fieldErrors,
  );
}

function getScheduleInput(input: EventBasesActionInput): ScheduleInput {
  return {
    name: input.name,
    scheduledDate: input.scheduledDate,
    startTime: input.startTime,
    totalCapacity: input.totalCapacity,
    modalityIds: input.modalityIds,
  };
}

function getScheduleWithEntriesInput(
  input: EventBasesActionInput,
): ScheduleWithEntriesInput {
  return {
    ...getScheduleInput(input),
    scheduleCapacities: input.scheduleCapacities,
  };
}

function getScheduleCapacityInput(
  input: EventBasesActionInput,
): ScheduleCapacityInput {
  return {
    groupType: input.groupType,
    capacity: input.capacity,
  };
}
