import type {
  EventBasesDeleteResult,
  EventBasesMutationResult,
  ScheduleCapacityInput,
} from "@/lib/schedules/repository.server";

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

export type NameActionValues = {
  name: string;
};

export type NameActionValuesWithId = NameActionValues & {
  id?: string;
};

export type CategoryActionValues = {
  name: string;
  minAge: string;
  maxAge: string;
  groupTypes: string[];
  modalityIds: string[];
  experienceLevelIds: string[];
};

export type ModalityActionValues = NameActionValues & {
  submodalities: NameActionValuesWithId[];
};

export type PriceActionValues = {
  name: string;
  isSpecialPrice: string;
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

export type EventBasesActionInput = {
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
  isSpecialPrice: boolean;
  modalityIds: string[];
  modalityId: string;
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

export type EventBasesActionResult =
  | EventBasesDeleteResult
  | EventBasesMutationResult;

export type RequiredFieldErrorResult = {
  message: string;
  fieldErrors: Record<string, string>;
};

export function actionError(
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

export function buildRecordActionScope(
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

export function buildParentRecordActionScope(
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

export function buildDefaultActionErrorScope(
  input: EventBasesActionInput,
): ActionErrorScope | null {
  if (!input.intent) {
    return null;
  }

  return buildRecordActionScope(input.intent, input.id);
}

function emptyStringToUndefined(value: string) {
  return value || undefined;
}

export function buildRequiredFieldError(
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

export function getRequiredErrors(
  values: Record<string, FormDataEntryValue | null>,
) {
  const fieldErrors: Record<string, string> = {};

  for (const [fieldName, value] of Object.entries(values)) {
    if (typeof value !== "string" || value.trim().length > 0) {
      continue;
    }

    fieldErrors[fieldName] = "Este campo es obligatorio.";
  }

  return fieldErrors;
}

export function getRequiredArrayErrors(
  values: Record<string, FormDataEntryValue[]>,
) {
  const fieldErrors: Record<string, string> = {};

  for (const [fieldName, entries] of Object.entries(values)) {
    const hasValue = entries.some(
      (entry) => typeof entry === "string" && entry.trim().length > 0,
    );

    if (!hasValue) {
      fieldErrors[fieldName] = "Este campo es obligatorio.";
    }
  }

  return fieldErrors;
}

export function withEventBasesNotification(
  pathname: string,
  notification: string,
) {
  const redirectUrl = new URL(`http://localhost${pathname}`);
  redirectUrl.searchParams.set("notificacion", notification);

  return `${redirectUrl.pathname}${redirectUrl.search}`;
}

export function hasEventBaseRecord(
  result: EventBasesActionResult,
): result is Extract<EventBasesMutationResult, { ok: true }> {
  return "record" in result;
}

export function invalidEventBasesActionResult(): EventBasesActionResult {
  return {
    ok: false,
    code: "invalid-event-bases",
    error: "No se pudo interpretar la acción de registro de configuración.",
    fieldErrors: {},
  };
}
