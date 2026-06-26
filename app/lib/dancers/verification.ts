import type { dancers } from "@/db/schema";

type DancerVerificationInput = {
  documentType: (typeof dancers.$inferSelect)["documentType"];
  documentNumber: string | null;
  documentFrontImageStorageKey: string | null;
  documentBackImageStorageKey: string | null;
  identityVerifiedAt: Date | null;
};

export type DancerVerificationStatus = "incomplete" | "unverified" | "verified";

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
