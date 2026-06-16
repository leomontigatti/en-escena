import type { dancers } from "@/db/schema";

type DancerVerificationInput = {
  documentType: (typeof dancers.$inferSelect)["documentType"];
  documentNumber: string | null;
  documentFrontImageStorageKey: string | null;
  documentBackImageStorageKey: string | null;
  identityVerifiedAt: Date | null;
};

export type DancerVerificationStatus =
  | "incomplete"
  | "missingImages"
  | "unverified"
  | "verified";

export function getDancerVerificationStatus(
  input: DancerVerificationInput,
): DancerVerificationStatus {
  if (!hasDocumentPair(input)) {
    return "incomplete";
  }

  if (!hasDocumentImages(input)) {
    return "missingImages";
  }

  return input.identityVerifiedAt === null ? "unverified" : "verified";
}

export function hasDocumentPair(input: DancerVerificationInput) {
  return Boolean(input.documentType && input.documentNumber);
}

export function hasDocumentImages(input: DancerVerificationInput) {
  return Boolean(
    input.documentFrontImageStorageKey && input.documentBackImageStorageKey,
  );
}
