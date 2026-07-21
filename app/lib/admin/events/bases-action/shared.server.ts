import type { RouteNotificationKey } from "@/lib/shared/route-notification-toasts";
import type {
  EventBasesDeleteResult,
  EventBasesMutationResult,
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
  experienceLevels: string[];
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

export type EventBasesActionBaseInput = {
  eventId: string;
  confirmDelete: boolean;
  confirmDeletion: string;
  id: string;
  intent: string;
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
  input: EventBasesActionBaseInput,
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

/**
 * Destino de un `action` de Bases del evento que redirige. El transporte del
 * toast depende del caso de la matriz (ver docs/agents/form-feedback.md):
 *
 * - `param`: mecanismo legacy `?notificacion=` (updates/deletes que todavía no
 *   migraron; se retiran en el ticket de contract #416).
 * - `flash`: cookie de un solo uso para los creates en ruta dedicada, que
 *   redirigen al detalle del nuevo recurso sin ensuciar la URL (PRD #409).
 */
export type EventBasesRedirect =
  | { transport: "param"; url: string }
  | { transport: "flash"; url: string; notification: RouteNotificationKey };

export function withEventBasesNotification(
  pathname: string,
  notification: string,
): EventBasesRedirect {
  const redirectUrl = new URL(`http://localhost${pathname}`);
  redirectUrl.searchParams.set("notificacion", notification);

  return {
    transport: "param",
    url: `${redirectUrl.pathname}${redirectUrl.search}`,
  };
}

export function withEventBasesFlashNotification(
  pathname: string,
  notification: RouteNotificationKey,
): EventBasesRedirect {
  return { transport: "flash", url: pathname, notification };
}

export function plainEventBasesRedirect(pathname: string): EventBasesRedirect {
  return { transport: "param", url: pathname };
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
