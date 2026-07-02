import { redirect } from "react-router";

import { readEventBasesActionInput } from "@/lib/admin/events/bases-action/input.server";
import {
  actionError,
  type ActionData,
  type EventBasesActionInput,
  type EventBasesActionResult,
} from "@/lib/admin/events/bases-action/shared.server";
import { markEventRegistrationReadinessDirty } from "@/lib/events/registration-readiness.server";

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

async function runEventBasesActionWithHandler({
  allowedIntents,
  eventId,
  handler,
  request,
}: {
  allowedIntents?: string[];
  eventId: string;
  handler: EventBasesActionHandler;
  request: Request;
}) {
  const formData = await request.formData();
  const input = readEventBasesActionInput(eventId, formData);

  if (
    allowedIntents &&
    !allowedIntents.some((allowedIntent) => allowedIntent === input.intent)
  ) {
    return actionError(
      "No se pudo interpretar la acción de registro de configuración.",
      {},
      handler.buildErrorScope(input),
      handler.readSubmittedValues(input, formData),
    );
  }

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

export { runEventBasesActionWithHandler };
export type { EventBasesActionHandler };
