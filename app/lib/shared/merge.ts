/**
 * What the panel's merges share, whatever they merge: the form field that
 * carries the record that stays, and the refusal the dialog's state toasts. It
 * has its own status, apart from an edit's `"error"`, because it opens the
 * merge dialog again and must not be read as a rejected edit.
 */
export const mergeSurvivorFieldName = "survivorId";

export type MergeRefusedActionData = {
  status: "merge-refused";
  message: string;
};
