/**
 * What the panel's merges share, whatever they merge: the form field that
 * carries the record that stays, and the refusal the dialog's state toasts.
 */
export const mergeSurvivorFieldName = "survivorId";

/**
 * A refused merge is an error like any other. What tells the merge dialog it is
 * theirs, and keeps it from being read as a rejected edit, is the `intent` the
 * request carried (docs/agents/form-feedback.md).
 */
export type MergeRefusedActionData<Intent extends string = string> = {
  status: "error";
  intent: Intent;
  message: string;
};

/**
 * Whether an answer is the refusal of the merge posted with `mergeIntent`. A
 * detail page reads it twice: the dialog's state to toast and re-open, and the
 * edit form to leave the refusal alone.
 */
export function isMergeRefusal<
  ActionData extends { status: string },
  Intent extends string,
>(
  actionData: ActionData | null | undefined,
  mergeIntent: Intent,
): actionData is Extract<ActionData, MergeRefusedActionData<Intent>> {
  return (
    actionData?.status === "error" &&
    "intent" in actionData &&
    actionData.intent === mergeIntent
  );
}
