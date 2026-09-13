import type {
  ActionErrorScope,
  EventBasesActionBaseInput,
  EventBasesActionResult,
  EventBasesActionValues,
  RequiredFieldErrorResult,
  SeminarPriceActionValues,
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
} from "@/lib/admin/events/bases-action/shared.server";
import {
  createSeminarPrice,
  deleteSeminarPrice,
  updateSeminarPrice,
  type SeminarPriceInput,
} from "@/lib/seminar-prices/repository.server";
import { buildDetailPath, isDetailPath } from "@/lib/shared/navigation";

const seminarPriceBasePath = "/administracion/precios/seminarios";
// Deleting a row leaves the detail, and the list it returns to is the seminar
// tab of `Precios`: the tab is a search param so the redirect can name it.
const seminarPriceListPath = "/administracion/precios?lista=seminarios";
const seminarPriceSavedNotification = "precio-guardado";
const seminarPriceDeletedNotification = "precio-eliminado";

export const seminarPriceActionHandler: EventBasesActionHandler<SeminarPriceActionInput> =
  {
    readInput: readSeminarPriceActionInput,
    buildErrorScope: buildSeminarPriceActionErrorScope,
    buildRedirectUrl: buildSeminarPriceRedirectUrl,
    getConfirmationError: getSeminarPriceConfirmationError,
    getRequiredFieldErrors: getSeminarPriceRequiredFieldErrors,
    readSubmittedValues: readSeminarPriceSubmittedValues,
    run: runSeminarPriceIntent,
  };

type SeminarPriceActionInput = EventBasesActionBaseInput & {
  name: string;
  kind: string;
  forParticipants: boolean;
  amount: number;
  isOpenEnded: boolean;
  paymentDeadline: string;
};

function handlesSeminarPriceIntent(intent: string) {
  return (
    intent === "create-seminar-price" ||
    intent === "update-seminar-price" ||
    intent === "delete-seminar-price"
  );
}

function isSeminarPriceFormIntent(intent: string) {
  return intent === "create-seminar-price" || intent === "update-seminar-price";
}

function getSeminarPriceConfirmationError(
  requestUrl: string,
  input: SeminarPriceActionInput,
) {
  if (
    input.intent === "delete-seminar-price" &&
    isDetailPath(seminarPriceBasePath, requestUrl) &&
    input.confirmDeletion !== input.id
  ) {
    return {
      message: "Confirmá el borrado del precio.",
      fieldErrors: {},
    };
  }

  return null;
}

function getSeminarPriceRequiredFieldErrors(
  input: SeminarPriceActionInput,
  formData: FormData,
): RequiredFieldErrorResult | null {
  if (!isSeminarPriceFormIntent(input.intent)) {
    return null;
  }

  // An open-ended row carries no deadline on purpose, so the field only joins
  // the required set while the switch is off.
  const requiredFields: Record<string, FormDataEntryValue | null> = {
    name: formData.get("name"),
    kind: formData.get("kind"),
    amount: formData.get("amount"),
  };

  if (!input.isOpenEnded) {
    requiredFields.paymentDeadline = formData.get("paymentDeadline");
  }

  return buildRequiredFieldError(
    "Revisá los datos del precio de seminario.",
    getRequiredErrors(requiredFields),
  );
}

function buildSeminarPriceActionErrorScope(
  input: SeminarPriceActionInput,
): ActionErrorScope | null {
  if (!handlesSeminarPriceIntent(input.intent)) {
    return buildDefaultActionErrorScope(input);
  }

  return buildRecordActionScope(input.intent, input.id);
}

function readSeminarPriceSubmittedValues(
  input: SeminarPriceActionInput,
  formData: FormData,
): EventBasesActionValues | undefined {
  if (!isSeminarPriceFormIntent(input.intent)) {
    return undefined;
  }

  return readSeminarPriceActionValues(formData);
}

async function runSeminarPriceIntent(
  input: SeminarPriceActionInput,
): Promise<EventBasesActionResult> {
  switch (input.intent) {
    case "create-seminar-price":
      return createSeminarPrice(input.eventId, getSeminarPriceInput(input));
    case "update-seminar-price":
      return updateSeminarPrice(input.id, getSeminarPriceInput(input));
    case "delete-seminar-price":
      return deleteSeminarPrice(input.id);
    default:
      return invalidEventBasesActionResult();
  }
}

function buildSeminarPriceRedirectUrl(
  requestUrl: string,
  input: SeminarPriceActionInput,
  result: EventBasesActionResult,
) {
  const currentUrl = new URL(requestUrl);

  if (input.intent === "delete-seminar-price") {
    return withEventBasesFlashNotification(
      seminarPriceListPath,
      seminarPriceDeletedNotification,
    );
  }

  if (
    input.intent === "create-seminar-price" &&
    result.ok &&
    hasEventBaseRecord(result)
  ) {
    return withEventBasesFlashNotification(
      buildDetailPath(seminarPriceBasePath, result.record.id, null),
      seminarPriceSavedNotification,
    );
  }

  if (isSeminarPriceFormIntent(input.intent)) {
    return withEventBasesFlashNotification(
      currentUrl.pathname,
      seminarPriceSavedNotification,
    );
  }

  return plainEventBasesRedirect(currentUrl.pathname);
}

function readSeminarPriceActionInput(
  baseInput: EventBasesActionBaseInput,
  formData: FormData,
): SeminarPriceActionInput {
  return {
    ...baseInput,
    name: String(formData.get("name") ?? ""),
    kind: String(formData.get("kind") ?? ""),
    forParticipants: String(formData.get("forParticipants") ?? "") === "true",
    amount: Number.parseInt(String(formData.get("amount") ?? ""), 10),
    isOpenEnded: String(formData.get("isOpenEnded") ?? "") === "true",
    paymentDeadline: String(formData.get("paymentDeadline") ?? ""),
  };
}

function readSeminarPriceActionValues(
  formData: FormData,
): SeminarPriceActionValues {
  return {
    name: String(formData.get("name") ?? ""),
    forParticipants: String(formData.get("forParticipants") ?? ""),
    isOpenEnded: String(formData.get("isOpenEnded") ?? ""),
    kind: String(formData.get("kind") ?? ""),
    amount: String(formData.get("amount") ?? ""),
    paymentDeadline: String(formData.get("paymentDeadline") ?? ""),
  };
}

function getSeminarPriceInput(
  input: SeminarPriceActionInput,
): SeminarPriceInput {
  return {
    name: input.name,
    kind: input.kind,
    forParticipants: input.forParticipants,
    amount: input.amount,
    paymentDeadline: input.isOpenEnded ? null : input.paymentDeadline,
  };
}
