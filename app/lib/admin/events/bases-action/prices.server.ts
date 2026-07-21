import type {
  ActionErrorScope,
  EventBasesActionBaseInput,
  EventBasesActionResult,
  EventBasesActionValues,
  PriceActionValues,
  RequiredFieldErrorResult,
} from "@/lib/admin/events/bases-action/shared.server";
import type { EventBasesActionHandler } from "@/lib/admin/events/bases-action/runner.server";
import {
  buildDefaultActionErrorScope,
  buildRecordActionScope,
  buildRequiredFieldError,
  getRequiredErrors,
  hasEventBaseRecord,
  invalidEventBasesActionResult,
  plainEventBasesRedirect,
  withEventBasesFlashNotification,
  withEventBasesNotification,
} from "@/lib/admin/events/bases-action/shared.server";
import {
  createPrice,
  deletePrice,
  type PriceInput,
  updatePrice,
} from "@/lib/prices/repository.server";
import {
  buildDetailPath,
  buildListPath,
  isDetailPath,
} from "@/lib/shared/navigation";

const priceBasePath = "/administracion/precios";
const priceSavedNotification = "precio-guardado";
const priceDeletedNotification = "precio-eliminado";

export const priceActionHandler: EventBasesActionHandler<PriceActionInput> = {
  readInput: readPriceActionInput,
  buildErrorScope: buildPriceActionErrorScope,
  buildRedirectUrl: buildPriceRedirectUrl,
  getConfirmationError: getPriceConfirmationError,
  getRequiredFieldErrors: getPriceRequiredFieldErrors,
  readSubmittedValues: readPriceSubmittedValues,
  run: runPriceIntent,
};

type PriceActionInput = EventBasesActionBaseInput & {
  name: string;
  groupType: string;
  amount: number;
  paymentDeadline: string;
  priceScheduleId: string | null;
};

function handlesPriceIntent(intent: string) {
  return (
    intent === "create-price" ||
    intent === "update-price" ||
    intent === "delete-price"
  );
}

function getPriceConfirmationError(
  requestUrl: string,
  input: PriceActionInput,
) {
  if (
    input.intent === "delete-price" &&
    isDetailPath(priceBasePath, requestUrl) &&
    input.confirmDeletion !== input.id
  ) {
    return {
      message: "Confirmá el borrado del precio.",
      fieldErrors: {},
    };
  }

  return null;
}

function getPriceRequiredFieldErrors(
  input: PriceActionInput,
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

function buildPriceActionErrorScope(
  input: PriceActionInput,
): ActionErrorScope | null {
  if (!handlesPriceIntent(input.intent)) {
    return buildDefaultActionErrorScope(input);
  }

  return buildRecordActionScope(input.intent, input.id);
}

function readPriceSubmittedValues(
  input: PriceActionInput,
  formData: FormData,
): EventBasesActionValues | undefined {
  if (input.intent !== "create-price" && input.intent !== "update-price") {
    return undefined;
  }

  return readPriceActionValues(formData);
}

async function runPriceIntent(
  input: PriceActionInput,
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

function buildPriceRedirectUrl(
  requestUrl: string,
  input: PriceActionInput,
  result: EventBasesActionResult,
) {
  const currentUrl = new URL(requestUrl);

  if (input.intent === "delete-price") {
    return withEventBasesFlashNotification(
      buildListPath(priceBasePath, null),
      priceDeletedNotification,
    );
  }

  if (
    input.intent === "create-price" &&
    result.ok &&
    hasEventBaseRecord(result)
  ) {
    return withEventBasesFlashNotification(
      buildDetailPath(priceBasePath, result.record.id, null),
      priceSavedNotification,
    );
  }

  if (input.intent === "create-price" || input.intent === "update-price") {
    return withEventBasesNotification(
      currentUrl.pathname,
      priceSavedNotification,
    );
  }

  return plainEventBasesRedirect(currentUrl.pathname);
}

function readPriceActionInput(
  baseInput: EventBasesActionBaseInput,
  formData: FormData,
): PriceActionInput {
  return {
    ...baseInput,
    name: String(formData.get("name") ?? ""),
    groupType: String(formData.get("groupType") ?? ""),
    amount: Number.parseInt(String(formData.get("amount") ?? ""), 10),
    paymentDeadline: String(formData.get("paymentDeadline") ?? ""),
    priceScheduleId: String(formData.get("scheduleId") ?? "") || null,
  };
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

function getPriceInput(input: PriceActionInput): PriceInput {
  return {
    name: input.name,
    groupType: input.groupType,
    amount: input.amount,
    paymentDeadline: input.paymentDeadline,
    scheduleId: input.priceScheduleId,
  };
}
