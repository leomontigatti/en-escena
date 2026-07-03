import type { dancers } from "@/db/schema";

type DancerVerificationInput = {
  documentType: (typeof dancers.$inferSelect)["documentType"];
  documentNumber: string | null;
  documentFrontImageStorageKey: string | null;
  documentBackImageStorageKey: string | null;
  identityVerifiedAt: Date | null;
};

export type DancerVerificationStatus = "incomplete" | "unverified" | "verified";

export type DancerIdentificationPendingItem =
  | "documentType"
  | "documentNumber"
  | "documentFrontImage"
  | "documentBackImage";

export function getDancerVerificationStatus(
  input: DancerVerificationInput,
): DancerVerificationStatus {
  if (!hasCompleteIdentification(input)) {
    return "incomplete";
  }

  if (input.identityVerifiedAt !== null) {
    return "verified";
  }

  return "unverified";
}

export function getDancerIdentificationPendingItems(
  input: DancerVerificationInput,
): DancerIdentificationPendingItem[] {
  const pendingItems: DancerIdentificationPendingItem[] = [];

  if (!input.documentType) {
    pendingItems.push("documentType");
  }

  if (!input.documentNumber) {
    pendingItems.push("documentNumber");
  }

  if (!input.documentFrontImageStorageKey) {
    pendingItems.push("documentFrontImage");
  }

  if (!input.documentBackImageStorageKey) {
    pendingItems.push("documentBackImage");
  }

  return pendingItems;
}

export function formatDancerIdentificationPendingItemLabel(
  pendingItem: DancerIdentificationPendingItem,
) {
  switch (pendingItem) {
    case "documentType":
      return "tipo de documento";
    case "documentNumber":
      return "número de documento";
    case "documentFrontImage":
      return "frente del documento";
    case "documentBackImage":
      return "dorso del documento";
  }
}

function hasCompleteIdentification(input: DancerVerificationInput) {
  return hasDocumentPair(input) && hasDocumentImages(input);
}

function hasDocumentPair(input: DancerVerificationInput) {
  return Boolean(input.documentType && input.documentNumber);
}

function hasDocumentImages(input: DancerVerificationInput) {
  return Boolean(
    input.documentFrontImageStorageKey && input.documentBackImageStorageKey,
  );
}
