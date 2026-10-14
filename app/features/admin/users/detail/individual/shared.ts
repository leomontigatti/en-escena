import type { IdentityDocumentType } from "@/lib/roster/identity-document";
import type { IndividualLinkState } from "@/lib/individuals/link-state";

export const confirmLinkIntent = "confirm-link";
export const revokeLinkIntent = "revoke-link";

/**
 * The confirmation names the number and the photo administration read on
 * screen, so a document or a photo the individual changes meanwhile is never
 * the one confirmed.
 */
export const confirmedDocumentNumberField = "documentNumber";
export const confirmedDocumentPhotoField = "documentPhotoStorageKey";

/** The individual behind a user's detail, and its link. */
export type IndividualLinkDetail = {
  /** Who confirmed the link and when, while it is `linked`. */
  confirmation: {
    confirmedAt: Date;
    /** `null` once the confirming user is gone. */
    confirmedByName: string | null;
  } | null;
  documentNumber: string;
  documentPhotoStorageKey: string | null;
  documentPhotoUrl: string | null;
  documentType: IdentityDocumentType;
  email: string;
  firstName: string;
  lastName: string;
  linkState: IndividualLinkState;
  phone: string;
};
