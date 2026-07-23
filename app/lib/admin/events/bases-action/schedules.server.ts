import { scheduleFormSchema } from "@/features/admin/schedules/view-shared";
import { readIndexedFormEntries } from "@/lib/admin/events/bases-action/input.server";
import type {
  ActionErrorScope,
  EventBasesActionBaseInput,
  EventBasesActionResult,
  EventBasesActionValues,
  RequiredFieldErrorResult,
  ScheduleActionValues,
} from "@/lib/admin/events/bases-action/shared.server";
import type { EventBasesActionHandler } from "@/lib/admin/events/bases-action/runner.server";
import {
  buildDefaultActionErrorScope,
  buildParentRecordActionScope,
  buildRecordActionScope,
  buildRequiredFieldError,
  getRequiredArrayErrors,
  getRequiredErrors,
  hasEventBaseRecord,
  invalidEventBasesActionResult,
  plainEventBasesRedirect,
  withEventBasesFlashNotification,
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
} from "@/lib/schedules/repository.server";
import {
  buildDetailPath,
  buildListPath,
  isDetailPath,
} from "@/lib/shared/navigation";

const scheduleBasePath = "/administracion/cronogramas";
const scheduleSavedNotification = "cronograma-guardado";
const scheduleDeletedNotification = "cronograma-eliminado";
const scheduleCapacitySavedNotification = "cupo-cronograma-guardado";
const scheduleCapacityDeletedNotification = "cupo-cronograma-eliminado";
const scheduleDeleteConfirmationMessage =
  "Confirmá el borrado del cronograma antes de continuar.";
const scheduleCapacityFieldNames = ["id", "groupType", "capacity"] as const;

type ScheduleActionInput = EventBasesActionBaseInput & {
  capacity: number;
  formValues: ScheduleActionValues;
  groupType: string;
  modalityIds: string[];
  name: string;
  scheduleCapacities: Array<ScheduleCapacityInput & { id?: string }>;
  scheduleId: string;
  scheduledDate: string;
  startTime: string;
  totalCapacity: number;
};

export const scheduleActionHandler: EventBasesActionHandler<ScheduleActionInput> =
  {
    readInput: readScheduleActionInput,
    buildErrorScope: buildScheduleActionErrorScope,
    buildRedirectUrl: buildScheduleRedirectUrl,
    getConfirmationError: getScheduleConfirmationError,
    getRequiredFieldErrors: getScheduleRequiredFieldErrors,
    readSubmittedValues: readScheduleSubmittedValues,
    run: runScheduleIntent,
  };

function readScheduleActionInput(
  baseInput: EventBasesActionBaseInput,
  formData: FormData,
): ScheduleActionInput {
  return {
    ...baseInput,
    capacity: Number.parseInt(String(formData.get("capacity") ?? ""), 10),
    formValues: readScheduleActionValues(formData),
    groupType: String(formData.get("groupType") ?? ""),
    modalityIds: formData.getAll("modalityIds").map(String),
    name: String(formData.get("name") ?? ""),
    scheduleCapacities: readScheduleCapacityInputList(formData),
    scheduleId: String(formData.get("scheduleId") ?? ""),
    scheduledDate: String(formData.get("scheduledDate") ?? ""),
    startTime: String(formData.get("startTime") ?? ""),
    totalCapacity: Number.parseInt(
      String(formData.get("totalCapacity") ?? ""),
      10,
    ),
  };
}

function readScheduleCapacityInputList(formData: FormData) {
  return readIndexedFormEntries({
    formData,
    prefix: "scheduleCapacities",
    fieldNames: scheduleCapacityFieldNames,
    createEntry: (): ScheduleCapacityInput & { id?: string } => ({
      groupType: "",
      capacity: Number.NaN,
    }),
    setField: (entry, fieldName, value) => {
      if (fieldName === "id" && value.trim().length > 0) {
        entry.id = value;
      }

      if (fieldName === "groupType") {
        entry.groupType = value;
      }

      if (fieldName === "capacity") {
        entry.capacity = Number.parseInt(value, 10);
      }
    },
  });
}

function handlesScheduleIntent(intent: string) {
  return (
    intent === "create-schedule" ||
    intent === "update-schedule" ||
    intent === "delete-schedule" ||
    intent === "create-schedule-capacity" ||
    intent === "update-schedule-capacity" ||
    intent === "delete-schedule-capacity"
  );
}

function getScheduleConfirmationError(
  requestUrl: string,
  input: ScheduleActionInput,
) {
  if (
    input.intent === "delete-schedule" &&
    isDetailPath(scheduleBasePath, requestUrl) &&
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

function getScheduleRequiredFieldErrors(
  input: ScheduleActionInput,
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

function buildScheduleActionErrorScope(
  input: ScheduleActionInput,
): ActionErrorScope | null {
  if (!handlesScheduleIntent(input.intent)) {
    return buildDefaultActionErrorScope(input);
  }

  if (input.intent === "create-schedule-capacity") {
    return buildParentRecordActionScope(input.intent, input.scheduleId);
  }

  return buildRecordActionScope(input.intent, input.id);
}

function readScheduleSubmittedValues(
  input: ScheduleActionInput,
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

async function runScheduleIntent(
  input: ScheduleActionInput,
): Promise<EventBasesActionResult> {
  switch (input.intent) {
    case "create-schedule": {
      const validationError = revalidateScheduleForm(input);

      if (validationError) {
        return validationError;
      }

      return createScheduleWithEntries(
        input.eventId,
        getScheduleWithEntriesInput(input),
      );
    }
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

function buildScheduleRedirectUrl(
  requestUrl: string,
  input: ScheduleActionInput,
  result: EventBasesActionResult,
) {
  const currentUrl = new URL(requestUrl);
  const currentPath = currentUrl.pathname;

  switch (input.intent) {
    case "delete-schedule":
      return withEventBasesFlashNotification(
        buildListPath(scheduleBasePath, null),
        scheduleDeletedNotification,
      );
    case "delete-schedule-capacity":
      return withEventBasesFlashNotification(
        currentPath,
        scheduleCapacityDeletedNotification,
      );
    case "create-schedule":
      if (result.ok && hasEventBaseRecord(result)) {
        return withEventBasesFlashNotification(
          buildDetailPath(scheduleBasePath, result.record.id, null),
          scheduleSavedNotification,
        );
      }

      return withEventBasesFlashNotification(
        currentPath,
        scheduleSavedNotification,
      );
    case "update-schedule":
      return withEventBasesFlashNotification(
        currentPath,
        scheduleSavedNotification,
      );
    case "create-schedule-capacity":
    case "update-schedule-capacity":
      return withEventBasesFlashNotification(
        currentPath,
        scheduleCapacitySavedNotification,
      );
    default:
      return plainEventBasesRedirect(currentPath);
  }
}

function readScheduleCapacityActionValues(
  formData: FormData,
): ScheduleActionValues["scheduleCapacities"][number] {
  return {
    groupType: String(formData.get("groupType") ?? ""),
    capacity: String(formData.get("capacity") ?? ""),
  };
}

function readScheduleCapacityActionValuesList(formData: FormData) {
  return readIndexedFormEntries({
    formData,
    prefix: "scheduleCapacities",
    fieldNames: scheduleCapacityFieldNames,
    createEntry: (): ScheduleActionValues["scheduleCapacities"][number] => ({
      groupType: "",
      capacity: "",
    }),
    setField: (entry, fieldName, value) => {
      if (fieldName === "id" && value.trim().length > 0) {
        entry.id = value;
      }

      if (fieldName === "groupType") {
        entry.groupType = value;
      }

      if (fieldName === "capacity") {
        entry.capacity = value;
      }
    },
  });
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

/**
 * Re-valida en el servidor las filas anidadas del cronograma con el **mismo**
 * esquema Zod que usa el cliente (`scheduleFormSchema`), incluyendo el
 * `superRefine` de tipo de grupo duplicado, cerrando la asimetría
 * cliente/servidor de los formularios de bases (PRD #465). Ante fallo devuelve
 * el error por el canal de `EventBasesActionResult`, que el runner convierte en
 * el round-trip de `submittedValues`/`ActionData` que repuebla el formulario y
 * sus cupos.
 */
function revalidateScheduleForm(
  input: ScheduleActionInput,
): EventBasesActionResult | null {
  const result = scheduleFormSchema.safeParse(input.formValues);

  if (result.success) {
    return null;
  }

  const fieldErrors: Record<string, string> = {};

  for (const issue of result.error.issues) {
    const fieldName = issue.path.join(".");

    if (fieldName && !fieldErrors[fieldName]) {
      fieldErrors[fieldName] = issue.message;
    }
  }

  return {
    ok: false,
    code: "invalid-event-bases",
    error: "Revisá los datos del cronograma.",
    fieldErrors,
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

function getScheduleInput(input: ScheduleActionInput): ScheduleInput {
  return {
    name: input.name,
    scheduledDate: input.scheduledDate,
    startTime: input.startTime,
    totalCapacity: input.totalCapacity,
    modalityIds: input.modalityIds,
  };
}

function getScheduleWithEntriesInput(
  input: ScheduleActionInput,
): ScheduleWithEntriesInput {
  return {
    ...getScheduleInput(input),
    scheduleCapacities: input.scheduleCapacities,
  };
}

function getScheduleCapacityInput(
  input: ScheduleActionInput,
): ScheduleCapacityInput {
  return {
    groupType: input.groupType,
    capacity: input.capacity,
  };
}
