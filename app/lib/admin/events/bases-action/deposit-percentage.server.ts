import {
  type DepositPercentageActionValues,
  type EventBasesActionInput,
  withEventBasesNotification,
} from "@/lib/admin/events/bases-action/shared.server";
import { updateEventRequiredDepositPercentage } from "@/lib/events/management.server";

const depositPercentageIntent = "update-required-deposit-percentage";
const depositPercentageSavedNotification = "sena-coreografia-guardada";
const invalidDepositPercentageError = "Revisá la seña de coreografía.";

export function handlesDepositPercentageIntent(intent: string) {
  return intent === depositPercentageIntent;
}

export function buildDepositPercentageActionErrorScope(
  input: EventBasesActionInput,
) {
  return { intent: input.intent };
}

export function buildDepositPercentageRedirectUrl(requestUrl: string) {
  const pathname = new URL(requestUrl).pathname;

  return withEventBasesNotification(
    pathname,
    depositPercentageSavedNotification,
  );
}

export function getDepositPercentageConfirmationError() {
  return null;
}

export function readDepositPercentageSubmittedValues(
  input: EventBasesActionInput,
): DepositPercentageActionValues {
  return {
    requiredDepositPercentage: Number.isNaN(input.requiredDepositPercentage)
      ? ""
      : String(input.requiredDepositPercentage),
  };
}

export async function runDepositPercentageIntent(input: EventBasesActionInput) {
  const result = await updateEventRequiredDepositPercentage(
    input.eventId,
    input.requiredDepositPercentage,
  );

  if (!result.ok) {
    return {
      ok: false,
      code:
        result.code === "event-not-found"
          ? "event-bases-not-found"
          : "invalid-event-bases",
      error:
        result.fieldErrors?.requiredDepositPercentage !== undefined
          ? invalidDepositPercentageError
          : result.error,
      fieldErrors: result.fieldErrors ?? {},
    } as const;
  }

  return {
    ok: true,
    record: result.event,
  } as const;
}
