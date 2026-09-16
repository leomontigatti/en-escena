import {
  isUnexpectedActionError,
  type UnexpectedActionError,
} from "@/lib/shared/recoverable-client-action";

export const deletePaymentIntent = "delete-payment";
export const updatePaymentIntent = "update-payment";

/**
 * Whether the delete dialog has to be open after a submit came back.
 *
 * A result of the delete intent re-opens it, as it always did. The generic
 * error `recoverableClientAction` returns carries no intent, so the only way to
 * tell whose failure it was is the intent that was in flight: an unexpected
 * failure of the delete form re-opens the dialog it came from, one of the
 * update form leaves it closed and is reported by the toast alone.
 */
export function shouldOpenPaymentDeleteDialog({
  actionData,
  submittedIntent,
}: {
  actionData: { intent?: string } | UnexpectedActionError | undefined;
  submittedIntent: string | null;
}) {
  if (!actionData) {
    return false;
  }

  const intent = "intent" in actionData ? actionData.intent : undefined;

  if (intent === deletePaymentIntent) {
    return true;
  }

  return (
    intent === undefined &&
    isUnexpectedActionError(actionData) &&
    submittedIntent === deletePaymentIntent
  );
}
