import { describe, expect, test } from "vitest";

import {
  canVerifyDancerIdentity,
  deriveDancerVerificationStatus,
  invalidatesDancerVerification,
  isDancerIdentityLockedForAcademy,
  type DancerAttestedIdentity,
} from "@/lib/dancers/verification";

const verifiedAt = new Date("2026-03-01T12:00:00Z");

describe("deriveDancerVerificationStatus", () => {
  test.each(everyDocumentCombination())(
    "$name is $code",
    ({ input, code, pendingItems }) => {
      expect(deriveDancerVerificationStatus(input)).toEqual({
        code,
        pendingItems,
      });
    },
  );

  test("reads an empty number as missing", () => {
    expect(
      deriveDancerVerificationStatus(
        verificationInput({ ...completeDocument(), documentNumber: "" }),
      ),
    ).toEqual({ code: "incomplete", pendingItems: ["documentNumber"] });
  });

  test("only an unverified complete dancer can be verified, and only a verified one is locked for the academy", () => {
    const incomplete = deriveDancerVerificationStatus(verificationInput({}));
    const unverified = deriveDancerVerificationStatus(
      verificationInput(completeDocument()),
    );
    const verified = deriveDancerVerificationStatus(
      verificationInput({
        ...completeDocument(),
        identityVerifiedAt: verifiedAt,
      }),
    );

    expect(
      [incomplete, unverified, verified].map(canVerifyDancerIdentity),
    ).toEqual([false, true, false]);
    expect(
      [incomplete, unverified, verified].map(isDancerIdentityLockedForAcademy),
    ).toEqual([false, false, true]);
  });
});

describe("invalidatesDancerVerification", () => {
  test.each([
    ["firstName", "Juana"],
    ["lastName", "Pérez"],
    ["birthDate", "2012-01-11"],
    ["documentType", "passport"],
    ["documentNumber", "87654321"],
    ["documentFrontImageStorageKey", "dancers/front-2.jpg"],
    ["documentBackImageStorageKey", "dancers/back-2.jpg"],
  ] as const)("a change to %s invalidates", (field, value) => {
    expect(
      invalidatesDancerVerification(attestedIdentity(), {
        ...attestedIdentity(),
        [field]: value,
      }),
    ).toBe(true);
  });

  test("clearing an attested value invalidates", () => {
    expect(
      invalidatesDancerVerification(attestedIdentity(), {
        ...attestedIdentity(),
        documentType: null,
        documentNumber: null,
      }),
    ).toBe(true);
  });

  // The panel stores `de la Cruz` where the portal stored `De la Cruz`, so an
  // untouched panel save of a portal-loaded dancer re-cases the surname.
  test("re-casing a name does not invalidate", () => {
    expect(
      invalidatesDancerVerification(
        { ...attestedIdentity(), lastName: "De la Cruz" },
        { ...attestedIdentity(), lastName: "de la Cruz" },
      ),
    ).toBe(false);
  });

  test("a save with the same values does not invalidate", () => {
    expect(
      invalidatesDancerVerification(attestedIdentity(), attestedIdentity()),
    ).toBe(false);
  });
});

const documentParts = [
  { field: "documentType", item: "documentType", value: "dni" },
  { field: "documentNumber", item: "documentNumber", value: "12345678" },
  {
    field: "documentFrontImageStorageKey",
    item: "documentFrontImage",
    value: "front.jpg",
  },
  {
    field: "documentBackImageStorageKey",
    item: "documentBackImage",
    value: "back.jpg",
  },
] as const;

/**
 * Every combination of the four document parts, verified or not. A dancer
 * missing any part is incomplete and lists exactly the missing ones, in this
 * order, whatever its verification date says.
 */
function everyDocumentCombination() {
  const presenceSets = documentParts.reduce<boolean[][]>(
    (sets) =>
      sets.flatMap((set) => [
        [...set, false],
        [...set, true],
      ]),
    [[]],
  );

  return presenceSets.flatMap((presence) =>
    [false, true].map((verified) => documentCase(presence, verified)),
  );
}

function documentCase(presence: boolean[], verified: boolean) {
  const present = documentParts.filter((_part, index) => presence[index]);
  const pendingItems = documentParts
    .filter((_part, index) => !presence[index])
    .map((part) => part.item);
  const input = verificationInput({
    ...Object.fromEntries(present.map((part) => [part.field, part.value])),
    identityVerifiedAt: verified ? verifiedAt : null,
  });

  return {
    name: `missing [${pendingItems.join(", ")}]${verified ? ", verified" : ""}`,
    input,
    code: expectedCode(pendingItems.length > 0, verified),
    pendingItems,
  };
}

function expectedCode(isMissingAnything: boolean, verified: boolean) {
  if (isMissingAnything) {
    return "incomplete";
  }

  return verified ? "verified" : "unverified";
}

function completeDocument() {
  return {
    documentType: "dni",
    documentNumber: "12345678",
    documentFrontImageStorageKey: "dancers/front.jpg",
    documentBackImageStorageKey: "dancers/back.jpg",
  } as const;
}

function verificationInput(
  overrides: Partial<Parameters<typeof deriveDancerVerificationStatus>[0]>,
): Parameters<typeof deriveDancerVerificationStatus>[0] {
  return {
    documentType: null,
    documentNumber: null,
    documentFrontImageStorageKey: null,
    documentBackImageStorageKey: null,
    identityVerifiedAt: null,
    ...overrides,
  };
}

function attestedIdentity(): DancerAttestedIdentity {
  return {
    firstName: "Ana",
    lastName: "Paz",
    birthDate: "2012-01-10",
    ...completeDocument(),
  };
}
