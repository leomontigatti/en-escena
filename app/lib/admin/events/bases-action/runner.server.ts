import { redirect } from "react-router";

import { readEventBasesActionBaseInput } from "@/lib/admin/events/bases-action/input.server";
import {
  actionError,
  type ActionData,
  type EventBasesActionBaseInput,
  type EventBasesActionResult,
} from "@/lib/admin/events/bases-action/shared.server";
import { markEventRegistrationReadinessDirty } from "@/lib/events/registration-readiness.server";

type EventBasesActionHandler<
  TInput extends EventBasesActionBaseInput = EventBasesActionBaseInput,
> = {
  readInput: (
    baseInput: EventBasesActionBaseInput,
    formData: FormData,
  ) => TInput;
  buildErrorScope: (input: TInput) => ActionData["scope"];
  buildRedirectUrl: (
    requestUrl: string,
    input: TInput,
    result: EventBasesActionResult,
  ) => string;
  getConfirmationError: (
    requestUrl: string,
    input: TInput,
  ) => { message: string; fieldErrors: Record<string, string> } | null;
  getRequiredFieldErrors?: (
    input: TInput,
    formData: FormData,
  ) => { message: string; fieldErrors: Record<string, string> } | null;
  readSubmittedValues: (
    input: TInput,
    formData: FormData,
  ) => ActionData["values"];
  run: (input: TInput) => Promise<EventBasesActionResult>;
  invalidateRegistrationReadiness?: boolean;
};

async function runEventBasesActionWithHandler<
  TInput extends EventBasesActionBaseInput,
>({
  allowedIntents,
  eventId,
  handler,
  recordId,
  request,
}: {
  allowedIntents?: string[];
  eventId: string;
  handler: EventBasesActionHandler<TInput>;
  recordId?: string;
  request: Request;
}) {
  const formData = await request.formData();
  const input = readSubmittedEventBasesActionInput({
    eventId,
    formData,
    handler,
    recordId,
  });
  const preflightError = getEventBasesActionPreflightError({
    allowedIntents,
    formData,
    handler,
    input,
    requestUrl: request.url,
  });

  if (preflightError) {
    return preflightError;
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

function readSubmittedEventBasesActionInput<
  TInput extends EventBasesActionBaseInput,
>({
  eventId,
  formData,
  handler,
  recordId,
}: {
  eventId: string;
  formData: FormData;
  handler: EventBasesActionHandler<TInput>;
  recordId?: string;
}): TInput {
  const baseInput = readEventBasesActionBaseInput(eventId, formData);
  const submittedInput = handler.readInput(baseInput, formData);

  if (recordId === undefined) {
    return submittedInput;
  }

  return { ...submittedInput, id: recordId };
}

function getEventBasesActionPreflightError<
  TInput extends EventBasesActionBaseInput,
>({
  allowedIntents,
  formData,
  handler,
  input,
  requestUrl,
}: {
  allowedIntents?: string[];
  formData: FormData;
  handler: EventBasesActionHandler<TInput>;
  input: TInput;
  requestUrl: string;
}): ActionData | null {
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

  const confirmationError = handler.getConfirmationError(requestUrl, input);

  if (confirmationError) {
    return actionError(
      confirmationError.message,
      confirmationError.fieldErrors,
      handler.buildErrorScope(input),
    );
  }

  const requiredFieldErrors = handler.getRequiredFieldErrors?.(input, formData);

  if (!requiredFieldErrors) {
    return null;
  }

  return actionError(
    requiredFieldErrors.message,
    requiredFieldErrors.fieldErrors,
    handler.buildErrorScope(input),
    handler.readSubmittedValues(input, formData),
  );
}

async function runEventBasesIntentWithReadinessInvalidation<
  TInput extends EventBasesActionBaseInput,
>(input: TInput, handler: EventBasesActionHandler<TInput>) {
  const result = await handler.run(input);

  if (result.ok) {
    if (handler.invalidateRegistrationReadiness === false) {
      return result;
    }

    await markEventRegistrationReadinessDirty(input.eventId);
  }

  return result;
}

export { runEventBasesActionWithHandler, type EventBasesActionHandler };
