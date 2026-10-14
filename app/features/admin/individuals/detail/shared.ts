import type { loadIndividualDetail } from "./server";

export const confirmLinkIntent = "confirm-link";
export const revokeLinkIntent = "revoke-link";

/**
 * The confirmation names the number and the photo administration read on
 * screen, so a document or a photo the individual changes meanwhile is never
 * the one confirmed.
 */
export const confirmedDocumentNumberField = "documentNumber";
export const confirmedDocumentPhotoField = "documentPhotoStorageKey";

export type IndividualDetailLoaderData = Awaited<
  ReturnType<typeof loadIndividualDetail>
>;

export type IndividualDetailActionData = {
  message: string;
  status: "error" | "success";
};
