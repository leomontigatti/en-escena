import { describe, expect, test } from "vitest";

import {
  formatDancerIdentificationPendingItemLabel,
  getDancerIdentificationPendingItems,
  getDancerVerificationStatus,
} from "@/lib/dancers/verification";

describe("dancer verification", () => {
  test("derives pending identification items from the same data as verification status", () => {
    const missingDocumentData = dancerVerificationInput({
      documentFrontImageStorageKey: "dancers/front.jpg",
      documentBackImageStorageKey: "dancers/back.jpg",
    });
    const missingImages = dancerVerificationInput({
      documentType: "dni",
      documentNumber: "12345678",
    });

    expect(getDancerVerificationStatus(missingDocumentData)).toBe("incomplete");
    expect(getDancerIdentificationPendingItems(missingDocumentData)).toEqual([
      "documentType",
      "documentNumber",
    ]);

    expect(getDancerVerificationStatus(missingImages)).toBe("incomplete");
    expect(getDancerIdentificationPendingItems(missingImages)).toEqual([
      "documentFrontImage",
      "documentBackImage",
    ]);
    expect(
      formatDancerIdentificationPendingItemLabel("documentFrontImage"),
    ).toBe("frente del documento");
  });
});

function dancerVerificationInput(
  overrides: Partial<Parameters<typeof getDancerVerificationStatus>[0]> = {},
): Parameters<typeof getDancerVerificationStatus>[0] {
  return {
    documentType: null,
    documentNumber: null,
    documentFrontImageStorageKey: null,
    documentBackImageStorageKey: null,
    identityVerifiedAt: null,
    ...overrides,
  };
}
