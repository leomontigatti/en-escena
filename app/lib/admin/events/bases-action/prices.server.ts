import {
  buildPriceDetailPath,
  buildPriceListPath,
  isPriceDetailPath,
} from "@/lib/admin/events/event-bases-navigation";
import type {
  ActionErrorScope,
  EventBasesActionInput,
  EventBasesActionResult,
  EventBasesActionValues,
  PriceActionValues,
  RequiredFieldErrorResult,
} from "@/lib/admin/events/bases-action/shared.server";
import {
  buildDefaultActionErrorScope,
  buildRecordActionScope,
  buildRequiredFieldError,
  getRequiredErrors,
  hasEventBaseRecord,
  invalidEventBasesActionResult,
  withEventBasesNotification,
} from "@/lib/admin/events/bases-action/shared.server";
import {
  createPrice,
  deletePrice,
  type PriceInput,
  updatePrice,
} from "@/lib/events/bases-repository.server";

const priceSavedNotification = "precio-guardado";
const priceDeletedNotification = "precio-eliminado";

export function handlesPriceIntent(intent: string) {
  return (
    intent === "create-price" ||
    intent === "update-price" ||
    intent === "delete-price"
  );
}

export function getPriceConfirmationError(
  requestUrl: string,
  input: EventBasesActionInput,
) {
  if (
    input.intent === "delete-price" &&
    isPriceDetailPath(requestUrl) &&
    input.confirmDeletion !== input.id
  ) {
    return {
      message: "Confirmá el borrado del precio.",
      fieldErrors: {},
    };
  }

  return null;
}

export function getPriceRequiredFieldErrors(
  input: EventBasesActionInput,
  formData: FormData,
): RequiredFieldErrorResult | null {
  if (input.intent !== "create-price" && input.intent !== "update-price") {
    return null;
  }

  const fieldErrors = getRequiredErrors({
    name: formData.get("name"),
    groupType: formData.get("groupType"),
    amount: formData.get("amount"),
    paymentDeadline: formData.get("paymentDeadline"),
  });

  if (
    String(formData.get("isSpecialPrice") ?? "") === "true" &&
    !formData.get("scheduleId")
  ) {
    fieldErrors.scheduleId = "Este campo es obligatorio.";
  }

  return buildRequiredFieldError("Revisá los datos del precio.", fieldErrors);
}

export function buildPriceActionErrorScope(
  input: EventBasesActionInput,
): ActionErrorScope | null {
  if (!handlesPriceIntent(input.intent)) {
    return buildDefaultActionErrorScope(input);
  }

  return buildRecordActionScope(input.intent, input.id);
}

export function readPriceSubmittedValues(
  input: EventBasesActionInput,
  formData: FormData,
): EventBasesActionValues | undefined {
  if (input.intent !== "create-price" && input.intent !== "update-price") {
    return undefined;
  }

  return readPriceActionValues(formData);
}

export async function runPriceIntent(
  input: EventBasesActionInput,
): Promise<EventBasesActionResult> {
  switch (input.intent) {
    case "create-price":
      return createPrice(input.eventId, getPriceInput(input));
    case "update-price":
      return updatePrice(input.id, getPriceInput(input));
    case "delete-price":
      return deletePrice(input.id);
    default:
      return invalidEventBasesActionResult();
  }
}

export function buildPriceRedirectUrl(
  requestUrl: string,
  input: EventBasesActionInput,
  result: EventBasesActionResult,
) {
  const currentUrl = new URL(requestUrl);

  if (input.intent === "delete-price") {
    return withEventBasesNotification(
      buildPriceListPath(null),
      priceDeletedNotification,
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

  if (input.intent === "create-price" || input.intent === "update-price") {
    return withEventBasesNotification(
      currentUrl.pathname,
      priceSavedNotification,
    );
  }

  return currentUrl.pathname;
}

function readPriceActionValues(formData: FormData): PriceActionValues {
  return {
    name: String(formData.get("name") ?? ""),
    isSpecialPrice: String(formData.get("isSpecialPrice") ?? ""),
    groupType: String(formData.get("groupType") ?? ""),
    amount: String(formData.get("amount") ?? ""),
    paymentDeadline: String(formData.get("paymentDeadline") ?? ""),
    scheduleId: String(formData.get("scheduleId") ?? ""),
  };
}

function getPriceInput(input: EventBasesActionInput): PriceInput {
  return {
    name: input.name,
    groupType: input.groupType,
    amount: input.amount,
    paymentDeadline: input.paymentDeadline,
    scheduleId: input.priceScheduleId,
  };
}
