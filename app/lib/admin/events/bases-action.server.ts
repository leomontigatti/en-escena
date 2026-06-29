import { redirect } from "react-router";

import {
  buildCategoryActionErrorScope,
  buildCategoryRedirectUrl,
  getCategoryConfirmationError,
  handlesCategoryIntent,
  readCategorySubmittedValues,
  runCategoryIntent,
} from "@/lib/admin/events/bases-action/categories.server";
import {
  buildDepositPercentageActionErrorScope,
  buildDepositPercentageRedirectUrl,
  getDepositPercentageConfirmationError,
  handlesDepositPercentageIntent,
  readDepositPercentageSubmittedValues,
  runDepositPercentageIntent,
} from "@/lib/admin/events/bases-action/deposit-percentage.server";
import { readEventBasesActionInput } from "@/lib/admin/events/bases-action/input.server";
import {
  buildModalityActionErrorScope,
  buildModalityRedirectUrl,
  getModalityConfirmationError,
  handlesModalityIntent,
  readModalitySubmittedValues,
  runModalityIntent,
} from "@/lib/admin/events/bases-action/modalities.server";
import {
  buildPriceActionErrorScope,
  buildPriceRedirectUrl,
  getPriceConfirmationError,
  getPriceRequiredFieldErrors,
  handlesPriceIntent,
  readPriceSubmittedValues,
  runPriceIntent,
} from "@/lib/admin/events/bases-action/prices.server";
import {
  buildScheduleActionErrorScope,
  buildScheduleRedirectUrl,
  getScheduleConfirmationError,
  getScheduleRequiredFieldErrors,
  handlesScheduleIntent,
  readScheduleSubmittedValues,
  runScheduleIntent,
} from "@/lib/admin/events/bases-action/schedules.server";
import {
  actionError,
  buildDefaultActionErrorScope,
  invalidEventBasesActionResult,
  type ActionData,
  type EventBasesActionInput,
  type EventBasesActionResult,
} from "@/lib/admin/events/bases-action/shared.server";
import { markEventRegistrationReadinessDirty } from "@/lib/events/registration-readiness.server";

export type {
  ActionData,
  ActionErrorScope,
  CategoryActionValues,
  EventBasesActionValues,
  ModalityActionValues,
  NameActionValues,
  NameActionValuesWithId,
  PriceActionValues,
  ScheduleActionValues,
  ScheduleCapacityActionValues,
} from "@/lib/admin/events/bases-action/shared.server";

type EventBasesActionHandler = {
  buildErrorScope: (input: EventBasesActionInput) => ActionData["scope"];
  buildRedirectUrl: (
    requestUrl: string,
    input: EventBasesActionInput,
    result: EventBasesActionResult,
  ) => string;
  getConfirmationError: (
    requestUrl: string,
    input: EventBasesActionInput,
  ) => { message: string; fieldErrors: Record<string, string> } | null;
  getRequiredFieldErrors?: (
    input: EventBasesActionInput,
    formData: FormData,
  ) => { message: string; fieldErrors: Record<string, string> } | null;
  readSubmittedValues: (
    input: EventBasesActionInput,
    formData: FormData,
  ) => ActionData["values"];
  run: (input: EventBasesActionInput) => Promise<EventBasesActionResult>;
  invalidateRegistrationReadiness?: boolean;
};

const categoryActionHandler: EventBasesActionHandler = {
  buildErrorScope: buildCategoryActionErrorScope,
  buildRedirectUrl: buildCategoryRedirectUrl,
  getConfirmationError: getCategoryConfirmationError,
  readSubmittedValues: readCategorySubmittedValues,
  run: runCategoryIntent,
};

const modalityActionHandler: EventBasesActionHandler = {
  buildErrorScope: buildModalityActionErrorScope,
  buildRedirectUrl: buildModalityRedirectUrl,
  getConfirmationError: getModalityConfirmationError,
  readSubmittedValues: readModalitySubmittedValues,
  run: runModalityIntent,
};

const depositPercentageActionHandler: EventBasesActionHandler = {
  buildErrorScope: buildDepositPercentageActionErrorScope,
  buildRedirectUrl: (requestUrl) =>
    buildDepositPercentageRedirectUrl(requestUrl),
  getConfirmationError: getDepositPercentageConfirmationError,
  readSubmittedValues: (input) => readDepositPercentageSubmittedValues(input),
  run: runDepositPercentageIntent,
  invalidateRegistrationReadiness: false,
};

const priceActionHandler: EventBasesActionHandler = {
  buildErrorScope: buildPriceActionErrorScope,
  buildRedirectUrl: buildPriceRedirectUrl,
  getConfirmationError: getPriceConfirmationError,
  getRequiredFieldErrors: getPriceRequiredFieldErrors,
  readSubmittedValues: readPriceSubmittedValues,
  run: runPriceIntent,
};

const scheduleActionHandler: EventBasesActionHandler = {
  buildErrorScope: buildScheduleActionErrorScope,
  buildRedirectUrl: buildScheduleRedirectUrl,
  getConfirmationError: getScheduleConfirmationError,
  getRequiredFieldErrors: getScheduleRequiredFieldErrors,
  readSubmittedValues: readScheduleSubmittedValues,
  run: runScheduleIntent,
};

export async function runEventBasesAction({
  eventId,
  request,
}: {
  eventId: string;
  request: Request;
}) {
  const formData = await request.formData();
  const input = readEventBasesActionInput(eventId, formData);
  const handler = getEventBasesActionHandler(input.intent);
  const confirmationError = handler.getConfirmationError(request.url, input);

  if (confirmationError) {
    return actionError(
      confirmationError.message,
      confirmationError.fieldErrors,
      handler.buildErrorScope(input),
    );
  }

  const requiredFieldErrors = handler.getRequiredFieldErrors?.(input, formData);

  if (requiredFieldErrors) {
    return actionError(
      requiredFieldErrors.message,
      requiredFieldErrors.fieldErrors,
      handler.buildErrorScope(input),
      handler.readSubmittedValues(input, formData),
    );
  }

  const result = await runEventBasesIntentWithReadinessInvalidation(
    input,
    handler,
  );

  if (!result.ok) {
    return actionError(
      result.error,
      result.fieldErrors,
      handler.buildErrorScope(input),
      handler.readSubmittedValues(input, formData),
    );
  }

  throw redirect(handler.buildRedirectUrl(request.url, input, result));
}

async function runEventBasesIntentWithReadinessInvalidation(
  input: EventBasesActionInput,
  handler: EventBasesActionHandler,
) {
  const result = await handler.run(input);

  if (result.ok) {
    if (handler.invalidateRegistrationReadiness === false) {
      return result;
    }

    await markEventRegistrationReadinessDirty(input.eventId);
  }

  return result;
}

function getEventBasesActionHandler(intent: string): EventBasesActionHandler {
  if (handlesCategoryIntent(intent)) {
    return categoryActionHandler;
  }

  if (handlesDepositPercentageIntent(intent)) {
    return depositPercentageActionHandler;
  }

  if (handlesModalityIntent(intent)) {
    return modalityActionHandler;
  }

  if (handlesScheduleIntent(intent)) {
    return scheduleActionHandler;
  }

  if (handlesPriceIntent(intent)) {
    return priceActionHandler;
  }

  return {
    buildErrorScope: buildDefaultActionErrorScope,
    buildRedirectUrl: (requestUrl) => new URL(requestUrl).pathname,
    getConfirmationError: () => null,
    readSubmittedValues: () => undefined,
    run: async () => invalidEventBasesActionResult(),
  };
}
