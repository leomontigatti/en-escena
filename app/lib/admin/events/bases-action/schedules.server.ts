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
import type { NotificationKey } from "@/lib/shared/notification-toasts";
import {
  buildDefaultActionErrorScope,
  buildParentRecordActionScope,
  buildRecordActionScope,
  buildRequiredFieldError,
  getRequiredArrayErrors,
  getRequiredErrors,
  hasEventBaseRecord,
  invalidEventBasesActionResult,
  invalidEventBasesFormResult,
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
  closeScheduleRegistration,
  openScheduleRegistration,
} from "@/lib/schedules/registration-open.server";
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
const scheduleRegistrationOpenedNotification = "inscripciones-abiertas";
const scheduleRegistrationClosedNotification = "inscripciones-cerradas";
const scheduleDeleteConfirmationMessage =
  "Confirmá el borrado del cronograma antes de continuar.";
const scheduleCapacityFieldNames = ["id", "groupType", "capacity"] as const;

type ScheduleActionInput = EventBasesActionBaseInput & {
  capacity: number;
  formValues: ScheduleActionValues;
  groupType: string;
  modalityIds: string[];
  categoryIds: string[];
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
    invalidatesRegistrationReadiness: isScheduleBasesIntent,
  };

/**
 * The inscriptions switch is the one schedule intent that changes no
 * `Bases del evento`: readiness measures configuration, not availability, so
 * opening or closing a `Cronograma` leaves its cached calculation alone.
 */
function isScheduleBasesIntent(input: ScheduleActionInput) {
  return (
    input.intent !== "open-schedule-registration" &&
    input.intent !== "close-schedule-registration"
  );
}

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
    categoryIds: formData.getAll("categoryIds").map(String),
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

/**
 * Every intent this handler answers, in one place: the union the route derives
 * its `allowedIntents` from is read off this list, so adding an intent is one
 * edit rather than a list and a union that drift apart.
 */
const eventScheduleIntents = [
  "create-schedule",
  "update-schedule",
  "delete-schedule",
  "create-schedule-capacity",
  "update-schedule-capacity",
  "delete-schedule-capacity",
  "open-schedule-registration",
  "close-schedule-registration",
] as const;

export type EventScheduleIntent = (typeof eventScheduleIntents)[number];

const eventScheduleIntentSet: ReadonlySet<string> = new Set(
  eventScheduleIntents,
);

function handlesScheduleIntent(intent: string) {
  return eventScheduleIntentSet.has(intent);
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
  const registrationSwitch = runScheduleRegistrationSwitchIntent(input);

  if (registrationSwitch) {
    return registrationSwitch;
  }

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

function runScheduleRegistrationSwitchIntent(input: ScheduleActionInput) {
  if (input.intent === "open-schedule-registration") {
    return openScheduleRegistration(input.id);
  }

  if (input.intent === "close-schedule-registration") {
    return closeScheduleRegistration(input.id);
  }

  return null;
}

/**
 * The intents that rebuild the page they were posted from. They all say their
 * line through the flash cookie on a redirect back to the same path, which is
 * what "staying" means for an event bases action (docs/agents/form-feedback.md).
 */
const scheduleStayingNotifications: Partial<
  Record<EventScheduleIntent, NotificationKey>
> = {
  "update-schedule": scheduleSavedNotification,
  "create-schedule-capacity": scheduleCapacitySavedNotification,
  "update-schedule-capacity": scheduleCapacitySavedNotification,
  "delete-schedule-capacity": scheduleCapacityDeletedNotification,
  "open-schedule-registration": scheduleRegistrationOpenedNotification,
  "close-schedule-registration": scheduleRegistrationClosedNotification,
};

function buildScheduleRedirectUrl(
  requestUrl: string,
  input: ScheduleActionInput,
  result: EventBasesActionResult,
) {
  const currentPath = new URL(requestUrl).pathname;
  const stayingNotification =
    scheduleStayingNotifications[input.intent as EventScheduleIntent];

  if (stayingNotification) {
    return withEventBasesFlashNotification(currentPath, stayingNotification);
  }

  if (input.intent === "delete-schedule") {
    return withEventBasesFlashNotification(
      buildListPath(scheduleBasePath, null),
      scheduleDeletedNotification,
    );
  }

  if (input.intent !== "create-schedule") {
    return plainEventBasesRedirect(currentPath);
  }

  return withEventBasesFlashNotification(
    result.ok && hasEventBaseRecord(result)
      ? buildDetailPath(scheduleBasePath, result.record.id, null)
      : currentPath,
    scheduleSavedNotification,
  );
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
    categoryIds: formData.getAll("categoryIds").map(String),
    scheduleCapacities: readScheduleCapacityActionValuesList(formData),
  };
}

/**
 * Revalidates the schedule's nested rows on the server with the **same** Zod
 * schema the client uses (`scheduleFormSchema`), including the duplicate
 * group-type `superRefine`, closing the client/server asymmetry of the bases
 * forms (PRD #465). On failure it returns the error through the
 * `EventBasesActionResult` channel, which the runner turns into the
 * `submittedValues`/`ActionData` round trip that repopulates the form and its
 * capacities.
 */
function revalidateScheduleForm(
  input: ScheduleActionInput,
): EventBasesActionResult | null {
  const result = scheduleFormSchema.safeParse(input.formValues);

  if (result.success) {
    return null;
  }

  return invalidEventBasesFormResult(
    result.error,
    "Revisá los datos del cronograma.",
  );
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
    categoryIds: input.categoryIds,
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
