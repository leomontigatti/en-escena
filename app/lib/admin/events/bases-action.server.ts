import { redirect } from "react-router";

import {
  buildCategoriasListPath,
  buildCategoryDetailPath,
} from "@/components/admin/events/event-categories";
import {
  buildModalidadDetallePath,
  buildModalidadesListPath,
  isModalityDetailPath,
} from "@/components/admin/events/event-modalities";
import {
  buildPriceDetailPath,
  buildPriceListPath,
  isPriceDetailPath,
} from "@/components/admin/events/event-prices";
import {
  buildScheduleDetailPath,
  buildSchedulesPath,
  isScheduleDetailPath,
} from "@/components/admin/events/event-schedules";
import {
  createCategory,
  createExperienceLevel,
  createModality,
  createPrice,
  createScheduleCapacity,
  createSubmodality,
  deleteCategory,
  deleteExperienceLevel,
  deleteModality,
  deletePrice,
  deleteSchedule,
  deleteScheduleCapacity,
  deleteSubmodality,
  ensureExperienceLevelsForEvent,
  type EventBasesDeleteResult,
  type EventBasesMutationResult,
  type PriceInput,
  type ScheduleInput,
  type ScheduleWithEntriesInput,
  type ScheduleCapacityInput,
  updateCategory,
  updateExperienceLevel,
  updateModality,
  updateModalityWithSubmodalities,
  updatePrice,
  updateScheduleWithEntries,
  updateScheduleCapacity,
  updateSubmodality,
  createScheduleWithEntries,
} from "@/lib/events/bases-repository.server";
import { isExperienceLevel } from "@/lib/events/experience-levels";
import { requiredFieldMessage } from "@/lib/shared/forms";

export type ActionData = {
  status: "error";
  message: string;
  fieldErrors: Record<string, string>;
  scope: ActionErrorScope | null;
  values?: EventBasesActionValues;
};

export type ActionErrorScope = {
  intent: string;
  parentRecordId?: string;
  recordId?: string;
};

type EventBasesActionInput = {
  eventId: string;
  confirmDelete: boolean;
  confirmDeletion: string;
  id: string;
  intent: string;
  capacity: number;
  scheduleId: string;
  priceScheduleId: string | null;
  paymentDeadline: string;
  minAge: number;
  maxAge: number;
  groupTypes: string[];
  groupType: string;
  modalityIds: string[];
  modalityId: string;
  newExperienceLevelName: string;
  name: string;
  experienceLevelIds: string[];
  scheduledDate: string;
  startTime: string;
  totalCapacity: number;
  amount: number;
  scheduleCapacities: Array<ScheduleCapacityInput & { id?: string }>;
  submodalities: NameActionValuesWithId[];
  submodalitiesMode: string;
};

type EventBasesActionResult = EventBasesDeleteResult | EventBasesMutationResult;
type CategoryMutationIntent = "create-category" | "update-category";
type CategoryMutationInput = {
  name: string;
  minAge: number;
  maxAge: number;
  groupTypes: string[];
  modalityIds: string[];
  experienceLevelIds: string[];
};
export type CategoryActionValues = {
  name: string;
  minAge: string;
  maxAge: string;
  groupTypes: string[];
  modalityIds: string[];
  experienceLevelIds: string[];
};
export type NameActionValues = {
  name: string;
};
export type NameActionValuesWithId = NameActionValues & {
  id?: string;
};
export type ModalityActionValues = NameActionValues & {
  submodalities: NameActionValuesWithId[];
};
export type PriceActionValues = {
  groupType: string;
  amount: string;
  paymentDeadline: string;
  scheduleId: string;
};
export type ScheduleCapacityActionValues = {
  id?: string;
  groupType: string;
  capacity: string;
};
export type ScheduleActionValues = {
  name: string;
  scheduledDate: string;
  startTime: string;
  totalCapacity: string;
  modalityIds: string[];
  scheduleCapacities: ScheduleCapacityActionValues[];
};
export type EventBasesActionValues =
  | CategoryActionValues
  | ModalityActionValues
  | NameActionValues
  | PriceActionValues
  | ScheduleActionValues
  | ScheduleCapacityActionValues;
type RequiredFieldErrorResult = {
  message: string;
  fieldErrors: Record<string, string>;
};

const eventBasesNotificationSearchParam = "notificacion";
const categorySavedNotification = "categoria-guardada";
const categoryDeletedNotification = "categoria-eliminada";
const scheduleSavedNotification = "cronograma-guardado";
const scheduleDeletedNotification = "cronograma-eliminado";
const scheduleCapacitySavedNotification = "cupo-cronograma-guardado";
const scheduleCapacityDeletedNotification = "cupo-cronograma-eliminado";
const modalitySavedNotification = "modalidad-guardada";
const modalityDeletedNotification = "modalidad-eliminada";
const priceSavedNotification = "precio-guardado";
const priceDeletedNotification = "precio-eliminado";
const categoryDeleteConfirmationMessage =
  "Confirmá el borrado de la categoría antes de continuar.";
const scheduleDeleteConfirmationMessage =
  "Confirmá el borrado del cronograma antes de continuar.";

export async function runEventBasesAction({
  eventId,
  request,
}: {
  eventId: string;
  request: Request;
}) {
  const formData = await request.formData();
  const input = readEventBasesActionInput(eventId, formData);

  if (requiresCategoryDeletionConfirmation(request.url, input)) {
    return actionError(
      categoryDeleteConfirmationMessage,
      {
        confirmDelete: categoryDeleteConfirmationMessage,
      },
      buildActionErrorScope(input),
    );
  }

  if (requiresModalityDeletionConfirmation(request.url, input)) {
    return actionError(
      "Confirmá el borrado de la modalidad.",
      {},
      buildActionErrorScope(input),
    );
  }

  if (requiresPriceDeletionConfirmation(request.url, input)) {
    return actionError(
      "Confirmá el borrado del precio.",
      {},
      buildActionErrorScope(input),
    );
  }

  if (requiresScheduleDeletionConfirmation(request.url, input)) {
    return actionError(
      scheduleDeleteConfirmationMessage,
      {
        confirmDelete: scheduleDeleteConfirmationMessage,
      },
      buildActionErrorScope(input),
    );
  }

  const requiredFieldErrors = getRequiredFieldErrors(input, formData);

  if (requiredFieldErrors) {
    return actionError(
      requiredFieldErrors.message,
      requiredFieldErrors.fieldErrors,
      buildActionErrorScope(input),
      getActionErrorValues(input, formData),
    );
  }

  const result = await runEventBasesIntent(input);

  if (!result.ok) {
    return actionError(
      result.error,
      result.fieldErrors,
      buildActionErrorScope(input),
      getActionErrorValues(input, formData),
    );
  }

  throw redirect(buildActionRedirectUrl(request.url, eventId, input, result));
}

function isCategoryDetailPath(requestUrl: string) {
  return new RegExp("^/administracion/categorias/[^/]+$").test(
    new URL(requestUrl).pathname,
  );
}

function requiresCategoryDeletionConfirmation(
  requestUrl: string,
  input: EventBasesActionInput,
) {
  return (
    input.intent === "delete-category" &&
    isCategoryDetailPath(requestUrl) &&
    input.confirmDeletion !== input.id
  );
}

function requiresModalityDeletionConfirmation(
  requestUrl: string,
  input: EventBasesActionInput,
) {
  return (
    input.intent === "delete-modality" &&
    isModalityDetailPath(requestUrl) &&
    input.confirmDeletion !== input.id
  );
}

function requiresPriceDeletionConfirmation(
  requestUrl: string,
  input: EventBasesActionInput,
) {
  return (
    input.intent === "delete-price" &&
    isPriceDetailPath(requestUrl) &&
    input.confirmDeletion !== input.id
  );
}

function requiresScheduleDeletionConfirmation(
  requestUrl: string,
  input: EventBasesActionInput,
) {
  return (
    input.intent === "delete-schedule" &&
    isScheduleDetailPath(requestUrl) &&
    !input.confirmDelete
  );
}

function readEventBasesActionInput(
  eventId: string,
  formData: FormData,
): EventBasesActionInput {
  return {
    confirmDelete:
      String(formData.get("confirmDelete") ?? "") === "1" ||
      String(formData.get("confirmDelete") ?? "") === "on" ||
      String(formData.get("confirmDelete") ?? "") === "yes",
    confirmDeletion: String(formData.get("confirmDeletion") ?? ""),
    eventId,
    capacity: Number.parseInt(String(formData.get("capacity") ?? ""), 10),
    id: String(formData.get("id") ?? ""),
    intent: String(formData.get("intent") ?? ""),
    minAge: Number(formData.get("minAge")),
    maxAge: Number(formData.get("maxAge")),
    groupTypes: formData.getAll("groupTypes").map(String),
    groupType: String(formData.get("groupType") ?? ""),
    modalityIds: formData.getAll("modalityIds").map(String),
    modalityId: String(formData.get("modalityId") ?? ""),
    newExperienceLevelName: String(
      formData.get("newExperienceLevelName") ?? "",
    ),
    name: String(formData.get("name") ?? ""),
    scheduleId: String(formData.get("scheduleId") ?? ""),
    priceScheduleId: String(formData.get("scheduleId") ?? "") || null,
    paymentDeadline: String(formData.get("paymentDeadline") ?? ""),
    experienceLevelIds: formData.getAll("experienceLevelIds").map(String),
    scheduledDate: String(formData.get("scheduledDate") ?? ""),
    startTime: String(formData.get("startTime") ?? ""),
    totalCapacity: Number.parseInt(
      String(formData.get("totalCapacity") ?? ""),
      10,
    ),
    amount: Number.parseInt(String(formData.get("amount") ?? ""), 10),
    scheduleCapacities: readScheduleCapacitiesInput(formData),
    submodalities: readSubmodalitiesInput(formData),
    submodalitiesMode: String(formData.get("submodalitiesMode") ?? ""),
  };
}

function readScheduleCapacitiesInput(formData: FormData) {
  const entriesByIndex = new Map<
    number,
    { id?: string; groupType: string; capacity: number }
  >();

  for (const [key, value] of formData.entries()) {
    const match = /^scheduleCapacities\.(\d+)\.(id|groupType|capacity)$/.exec(
      key,
    );

    if (!match || typeof value !== "string") {
      continue;
    }

    const index = Number.parseInt(match[1] ?? "", 10);
    const fieldName = match[2];
    const entry = entriesByIndex.get(index) ?? {
      groupType: "",
      capacity: Number.NaN,
    };

    if (fieldName === "id" && value.trim().length > 0) {
      entry.id = value;
    }

    if (fieldName === "groupType") {
      entry.groupType = value;
    }

    if (fieldName === "capacity") {
      entry.capacity = Number.parseInt(value, 10);
    }

    entriesByIndex.set(index, entry);
  }

  return Array.from(entriesByIndex.entries())
    .sort(([firstIndex], [secondIndex]) => firstIndex - secondIndex)
    .map(([, entry]) => entry);
}

function readSubmodalitiesInput(formData: FormData) {
  const entriesByIndex = new Map<number, { id?: string; name: string }>();

  for (const [key, value] of formData.entries()) {
    const match = /^submodalities\.(\d+)\.(id|name)$/.exec(key);

    if (!match || typeof value !== "string") {
      continue;
    }

    const index = Number.parseInt(match[1] ?? "", 10);
    const fieldName = match[2];
    const entry = entriesByIndex.get(index) ?? { name: "" };

    if (fieldName === "id" && value.trim().length > 0) {
      entry.id = value;
    }

    if (fieldName === "name") {
      entry.name = value;
    }

    entriesByIndex.set(index, entry);
  }

  return Array.from(entriesByIndex.entries())
    .sort(([firstIndex], [secondIndex]) => firstIndex - secondIndex)
    .map(([, entry]) => entry);
}

function actionError(
  message: string,
  fieldErrors: Record<string, string> = {},
  scope: ActionErrorScope | null = null,
  values?: EventBasesActionValues,
): ActionData {
  const actionData: ActionData = {
    status: "error",
    message,
    fieldErrors,
    scope,
  };

  if (values) {
    actionData.values = values;
  }

  return actionData;
}

function getActionErrorValues(
  input: EventBasesActionInput,
  formData: FormData,
) {
  if (isCategoryMutationIntent(input.intent)) {
    return readCategoryActionValues(formData);
  }

  if (isModalityFormMutation(input)) {
    return readModalityActionValues(formData);
  }

  if (isNameMutationIntent(input.intent)) {
    return readNameActionValues(formData);
  }

  if (isPriceMutationIntent(input.intent)) {
    return readPriceActionValues(formData);
  }

  if (isScheduleMutationIntent(input.intent)) {
    return readScheduleActionValues(formData);
  }

  if (isScheduleCapacityMutationIntent(input.intent)) {
    return readScheduleCapacityActionValues(formData);
  }

  return undefined;
}

function readCategoryActionValues(formData: FormData): CategoryActionValues {
  return {
    name: String(formData.get("name") ?? ""),
    minAge: String(formData.get("minAge") ?? ""),
    maxAge: String(formData.get("maxAge") ?? ""),
    groupTypes: formData.getAll("groupTypes").map(String),
    modalityIds: formData.getAll("modalityIds").map(String),
    experienceLevelIds: formData.getAll("experienceLevelIds").map(String),
  };
}

function readNameActionValues(formData: FormData): NameActionValues {
  return {
    name: String(formData.get("name") ?? ""),
  };
}

function readModalityActionValues(formData: FormData): ModalityActionValues {
  return {
    name: String(formData.get("name") ?? ""),
    submodalities: readSubmodalitiesInput(formData),
  };
}

function readPriceActionValues(formData: FormData): PriceActionValues {
  return {
    groupType: String(formData.get("groupType") ?? ""),
    amount: String(formData.get("amount") ?? ""),
    paymentDeadline: String(formData.get("paymentDeadline") ?? ""),
    scheduleId: String(formData.get("scheduleId") ?? ""),
  };
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

function readScheduleCapacityActionValues(
  formData: FormData,
): ScheduleCapacityActionValues {
  return {
    groupType: String(formData.get("groupType") ?? ""),
    capacity: String(formData.get("capacity") ?? ""),
  };
}

function readScheduleCapacityActionValuesList(formData: FormData) {
  const entriesByIndex = new Map<
    number,
    { id?: string; groupType: string; capacity: string }
  >();

  for (const [key, value] of formData.entries()) {
    const match = /^scheduleCapacities\.(\d+)\.(id|groupType|capacity)$/.exec(
      key,
    );

    if (!match || typeof value !== "string") {
      continue;
    }

    const index = Number.parseInt(match[1] ?? "", 10);
    const fieldName = match[2];
    const entry = entriesByIndex.get(index) ?? {
      groupType: "",
      capacity: "",
    };

    if (fieldName === "id" && value.trim().length > 0) {
      entry.id = value;
    }

    if (fieldName === "groupType") {
      entry.groupType = value;
    }

    if (fieldName === "capacity") {
      entry.capacity = value;
    }

    entriesByIndex.set(index, entry);
  }

  return Array.from(entriesByIndex.entries())
    .sort(([firstIndex], [secondIndex]) => firstIndex - secondIndex)
    .map(([, entry]) => entry);
}

function buildActionErrorScope(
  input: EventBasesActionInput,
): ActionErrorScope | null {
  if (!input.intent) {
    return null;
  }

  switch (input.intent) {
    case "create-submodality":
      return buildParentRecordActionScope(input.intent, input.modalityId);
    case "update-submodality":
      return {
        intent: input.intent,
        recordId: emptyStringToUndefined(input.id),
        parentRecordId: emptyStringToUndefined(input.modalityId),
      };
    case "create-schedule-capacity":
      return buildParentRecordActionScope(input.intent, input.scheduleId);
    default:
      return buildRecordActionScope(input.intent, input.id);
  }
}

function buildRecordActionScope(
  intent: string,
  recordId: string,
): ActionErrorScope {
  const scope: ActionErrorScope = { intent };
  const normalizedRecordId = emptyStringToUndefined(recordId);

  if (normalizedRecordId) {
    scope.recordId = normalizedRecordId;
  }

  return scope;
}

function buildParentRecordActionScope(
  intent: string,
  parentRecordId: string,
): ActionErrorScope {
  const scope: ActionErrorScope = { intent };
  const normalizedParentRecordId = emptyStringToUndefined(parentRecordId);

  if (normalizedParentRecordId) {
    scope.parentRecordId = normalizedParentRecordId;
  }

  return scope;
}

function emptyStringToUndefined(value: string) {
  return value || undefined;
}

function buildActionRedirectUrl(
  requestUrl: string,
  eventId: string,
  input: EventBasesActionInput,
  result: EventBasesActionResult,
) {
  const currentUrl = new URL(requestUrl);

  if (input.intent === "delete-category") {
    return withEventBasesNotification(
      buildCategoriasListPath(null),
      categoryDeletedNotification,
    );
  }

  if (input.intent === "delete-modality") {
    return withEventBasesNotification(
      buildModalidadesListPath(null),
      modalityDeletedNotification,
    );
  }

  if (input.intent === "delete-price") {
    return withEventBasesNotification(
      buildPriceListPath(null),
      priceDeletedNotification,
    );
  }

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
    input.intent === "create-category" &&
    result.ok &&
    hasEventBaseRecord(result)
  ) {
    return withEventBasesNotification(
      buildCategoryDetailPath(result.record.id, null),
      categorySavedNotification,
    );
  }

  if (
    input.intent === "create-modality" &&
    result.ok &&
    hasEventBaseRecord(result)
  ) {
    return withEventBasesNotification(
      buildModalidadDetallePath(result.record.id, null),
      modalitySavedNotification,
    );
  }

  if (
    input.intent === "create-price" &&
    result.ok &&
    hasEventBaseRecord(result)
  ) {
    return withEventBasesNotification(
      buildPriceDetailPath(result.record.id, null),
      priceSavedNotification,
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

  if (isModalityMutationIntent(input.intent)) {
    return withEventBasesNotification(
      currentUrl.pathname,
      modalitySavedNotification,
    );
  }

  if (isCategoryMutationIntent(input.intent)) {
    return withEventBasesNotification(
      currentUrl.pathname,
      categorySavedNotification,
    );
  }

  if (isPriceMutationIntent(input.intent)) {
    return withEventBasesNotification(
      currentUrl.pathname,
      priceSavedNotification,
    );
  }

  if (isScheduleMutationIntent(input.intent)) {
    return withEventBasesNotification(
      currentUrl.pathname,
      scheduleSavedNotification,
    );
  }

  if (isScheduleCapacityMutationIntent(input.intent)) {
    return withEventBasesNotification(
      currentUrl.pathname,
      scheduleCapacitySavedNotification,
    );
  }

  return currentUrl.pathname;
}

function withEventBasesNotification(pathname: string, notification: string) {
  const redirectUrl = new URL(`http://localhost${pathname}`);
  redirectUrl.searchParams.set(eventBasesNotificationSearchParam, notification);

  return `${redirectUrl.pathname}${redirectUrl.search}`;
}

function isModalityMutationIntent(intent: string) {
  return (
    intent === "update-modality" ||
    intent === "create-submodality" ||
    intent === "update-submodality" ||
    intent === "delete-submodality"
  );
}

function isModalityFormMutation(input: EventBasesActionInput) {
  return (
    input.intent === "update-modality" && input.submodalitiesMode === "replace"
  );
}

function isNameMutationIntent(intent: string) {
  return (
    intent === "create-modality" ||
    intent === "update-modality" ||
    intent === "create-submodality" ||
    intent === "update-submodality" ||
    intent === "create-experience-level" ||
    intent === "update-experience-level"
  );
}

function isPriceMutationIntent(intent: string) {
  return intent === "create-price" || intent === "update-price";
}

function isScheduleMutationIntent(intent: string) {
  return intent === "create-schedule" || intent === "update-schedule";
}

function isScheduleCapacityMutationIntent(intent: string) {
  return (
    intent === "create-schedule-capacity" ||
    intent === "update-schedule-capacity"
  );
}

function getRequiredFieldErrors(
  input: EventBasesActionInput,
  formData: FormData,
): RequiredFieldErrorResult | null {
  switch (input.intent) {
    case "create-price":
    case "update-price":
      return getPriceRequiredFieldErrors(formData);
    case "create-schedule":
    case "update-schedule":
      return getScheduleRequiredFieldErrors(formData);
    case "create-schedule-capacity":
    case "update-schedule-capacity":
      return getScheduleCapacityRequiredFieldErrors(formData);
    default:
      return null;
  }
}

function getPriceRequiredFieldErrors(
  formData: FormData,
): RequiredFieldErrorResult | null {
  const fieldErrors = getRequiredErrors({
    groupType: formData.get("groupType"),
    amount: formData.get("amount"),
    paymentDeadline: formData.get("paymentDeadline"),
  });

  return buildRequiredFieldError("Revisá los datos del precio.", fieldErrors);
}

function getScheduleRequiredFieldErrors(
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
        requiredFieldMessage;
    }

    if (typeof groupType !== "string" || groupType.trim().length === 0) {
      fieldErrors[`scheduleCapacities.${index}.groupType`] =
        requiredFieldMessage;
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
  const fieldErrors = {
    ...getRequiredErrors({
      capacity: formData.get("capacity"),
      groupType: formData.get("groupType"),
    }),
  };

  return buildRequiredFieldError(
    "Revisá los datos del cupo de cronograma.",
    fieldErrors,
  );
}

function buildRequiredFieldError(
  message: string,
  fieldErrors: Record<string, string>,
): RequiredFieldErrorResult | null {
  if (Object.keys(fieldErrors).length === 0) {
    return null;
  }

  return {
    message,
    fieldErrors,
  };
}

function getRequiredErrors(values: Record<string, FormDataEntryValue | null>) {
  const fieldErrors: Record<string, string> = {};

  for (const [fieldName, value] of Object.entries(values)) {
    if (typeof value !== "string" || value.trim().length > 0) {
      continue;
    }

    fieldErrors[fieldName] = requiredFieldMessage;
  }

  return fieldErrors;
}

function getRequiredArrayErrors(values: Record<string, FormDataEntryValue[]>) {
  const fieldErrors: Record<string, string> = {};

  for (const [fieldName, entries] of Object.entries(values)) {
    const hasValue = entries.some(
      (entry) => typeof entry === "string" && entry.trim().length > 0,
    );

    if (!hasValue) {
      fieldErrors[fieldName] = requiredFieldMessage;
    }
  }

  return fieldErrors;
}

function hasEventBaseRecord(
  result: EventBasesActionResult,
): result is Extract<EventBasesMutationResult, { ok: true }> {
  return "record" in result;
}

async function runEventBasesIntent(
  input: EventBasesActionInput,
): Promise<EventBasesActionResult> {
  switch (input.intent) {
    case "create-category":
      return saveCategory(input);
    case "update-category":
      return saveCategory(input);
    case "delete-category":
      if (!input.confirmDelete && input.confirmDeletion !== input.id) {
        return {
          ok: false as const,
          code: "invalid-event-bases" as const,
          error: categoryDeleteConfirmationMessage,
          fieldErrors: {
            confirmDelete: categoryDeleteConfirmationMessage,
          },
        };
      }
      return deleteCategory(input.id);
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
    case "create-price":
      return createPrice(input.eventId, getPriceInput(input));
    case "update-price":
      return updatePrice(input.id, getPriceInput(input));
    case "delete-price":
      return deletePrice(input.id);
    case "create-schedule-capacity":
      return createScheduleCapacity(
        input.scheduleId,
        getScheduleCapacityInput(input),
      );
    case "update-schedule-capacity":
      return updateScheduleCapacity(input.id, getScheduleCapacityInput(input));
    case "delete-schedule-capacity":
      return deleteScheduleCapacity(input.id);
    case "create-modality":
      return createModality(input.eventId, { name: input.name });
    case "update-modality":
      if (isModalityFormMutation(input)) {
        return updateModalityWithSubmodalities(input.id, {
          name: input.name,
          submodalities: input.submodalities,
        });
      }

      return updateModality(input.id, { name: input.name });
    case "delete-modality":
      return deleteModality(input.id);
    case "create-submodality":
      return createSubmodality(input.eventId, {
        modalityId: input.modalityId,
        name: input.name,
      });
    case "update-submodality":
      return updateSubmodality(input.id, {
        modalityId: input.modalityId,
        name: input.name,
      });
    case "delete-submodality":
      return deleteSubmodality(input.id);
    case "create-experience-level":
      return createExperienceLevel(input.eventId, { name: input.name });
    case "update-experience-level":
      return updateExperienceLevel(input.id, { name: input.name });
    case "delete-experience-level":
      return deleteExperienceLevel(input.id);
    default:
      return {
        ok: false as const,
        code: "invalid-event-bases" as const,
        error: "No se pudo interpretar la acción de registro de configuración.",
        fieldErrors: {},
      };
  }
}

function getCategoryMutationInput(
  input: EventBasesActionInput,
): CategoryMutationInput {
  return {
    name: input.name,
    minAge: input.minAge,
    maxAge: input.maxAge,
    groupTypes: input.groupTypes,
    modalityIds: input.modalityIds,
    experienceLevelIds: input.experienceLevelIds,
  };
}

function isCategoryMutationIntent(
  intent: string,
): intent is CategoryMutationIntent {
  return intent === "create-category" || intent === "update-category";
}

function appendExperienceLevelId(
  input: CategoryMutationInput,
  experienceLevelId: string,
): CategoryMutationInput {
  return {
    ...input,
    experienceLevelIds: [...input.experienceLevelIds, experienceLevelId],
  };
}

async function runCategoryMutation(
  input: EventBasesActionInput,
  categoryInput: CategoryMutationInput,
): Promise<EventBasesMutationResult> {
  if (!isCategoryMutationIntent(input.intent)) {
    return {
      ok: false,
      code: "invalid-event-bases",
      error: "No se pudo interpretar la acción de registro de configuración.",
      fieldErrors: {},
    };
  }

  if (input.intent === "create-category") {
    return createCategory(input.eventId, categoryInput);
  }

  return updateCategory(input.id, categoryInput);
}

async function saveCategory(
  input: EventBasesActionInput,
): Promise<EventBasesMutationResult> {
  const fixedExperienceLevelNames =
    input.experienceLevelIds.filter(isExperienceLevel);
  const fixedExperienceLevelIds = await ensureExperienceLevelsForEvent(
    input.eventId,
    fixedExperienceLevelNames,
  );
  const categoryInput = {
    ...getCategoryMutationInput(input),
    experienceLevelIds: [
      ...input.experienceLevelIds.filter(
        (experienceLevelId) => !isExperienceLevel(experienceLevelId),
      ),
      ...fixedExperienceLevelIds,
    ],
  };
  const normalizedNewExperienceLevelName = input.newExperienceLevelName.trim();

  if (!normalizedNewExperienceLevelName) {
    return runCategoryMutation(input, categoryInput);
  }

  const levelResult = await createExperienceLevel(input.eventId, {
    name: normalizedNewExperienceLevelName,
  });

  if (!levelResult.ok) {
    return {
      ...levelResult,
      fieldErrors: {
        ...(levelResult.fieldErrors ?? {}),
        newExperienceLevelName:
          levelResult.fieldErrors?.name ?? levelResult.error,
      },
    };
  }

  const categoryResult = await runCategoryMutation(
    input,
    appendExperienceLevelId(categoryInput, levelResult.record.id),
  );

  if (!categoryResult.ok) {
    await deleteExperienceLevel(levelResult.record.id);
  }

  return categoryResult;
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

function getPriceInput(input: EventBasesActionInput): PriceInput {
  return {
    groupType: input.groupType,
    amount: input.amount,
    paymentDeadline: input.paymentDeadline,
    scheduleId: input.priceScheduleId,
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
