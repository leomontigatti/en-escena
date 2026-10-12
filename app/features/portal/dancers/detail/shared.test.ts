import { describe, expect, test } from "vitest";

import { buildDancerUpdateSchema } from "@/features/admin/dancers/detail/shared";
import { normalizeDancerDocumentPair } from "@/lib/dancers/dancer-records";
import { expectSharedBirthDateRules } from "@/lib/test-support/dancer-birth-date-schema";

import {
  buildPortalDancerDetailViewModel,
  buildPortalDancerSchema,
  type PortalDancerDetailLoaderData,
} from "./shared";

// The create page parses with this schema too.
describe("portal dancer schema", () => {
  test("applies the shared birth-date rules", () => {
    expectSharedBirthDateRules({
      buildSchema: buildPortalDancerSchema,
      values: {
        firstName: "Ana",
        lastName: "Paz",
        documentType: "",
        documentNumber: "",
        documentFrontImageStorageKey: "",
        documentBackImageStorageKey: "",
      },
    });
  });

  test("accepts a dancer without a document", () => {
    expect(
      fieldErrors(buildPortalDancerSchema(null), {
        documentType: "",
        documentNumber: "",
      }),
    ).toEqual({});
  });

  // The portal form once checked only the pair, and an academy learned of a
  // bad type or a DNI with letters from the failed save.
  test.each([
    { documentType: "", documentNumber: "30111222" },
    { documentType: "dni", documentNumber: "" },
    { documentType: "cedula", documentNumber: "30111222" },
    { documentType: "dni", documentNumber: "30A11222" },
  ])(
    "refuses $documentType/$documentNumber as the panel form and the server do",
    (document) => {
      const serverResult = normalizeDancerDocumentPair(
        document.documentType,
        document.documentNumber,
      );
      const serverErrors = serverResult.ok ? {} : serverResult.fieldErrors;

      expect(Object.keys(serverErrors)).not.toHaveLength(0);
      expect(fieldErrors(buildPortalDancerSchema(null), document)).toEqual(
        serverErrors,
      );
      expect(fieldErrors(buildDancerUpdateSchema(null), document)).toEqual(
        serverErrors,
      );
    },
  );
});

function fieldErrors(
  schema: ReturnType<typeof buildPortalDancerSchema>,
  document: { documentType: string; documentNumber: string },
) {
  const result = schema.safeParse({
    firstName: "Ana",
    lastName: "Paz",
    birthDate: "2014-01-01",
    documentFrontImageStorageKey: "",
    documentBackImageStorageKey: "",
    ...document,
  });

  return Object.fromEntries(
    (result.error?.issues ?? []).map((issue) => [
      String(issue.path[0]),
      issue.message,
    ]),
  );
}

const dancer = {
  active: true,
  birthDate: "2010-01-01",
  documentBackImageStorageKey: null,
  documentFrontImageStorageKey: null,
  documentNumber: null,
  documentType: null,
  firstName: "Ana",
  id: "dancer_1",
  lastName: "Paz",
} as unknown as PortalDancerDetailLoaderData["dancer"];

function buildViewModel(
  overrides: {
    dancer?: Partial<PortalDancerDetailLoaderData["dancer"]>;
    isParticipatingInActiveEvent?: boolean;
  } = {},
) {
  return buildPortalDancerDetailViewModel({
    dancer: { ...dancer, ...overrides.dancer },
    formValues: {
      firstName: "Ana",
      lastName: "Paz",
      birthDate: "2010-01-01",
      documentType: "",
      documentNumber: "",
      documentFrontImageStorageKey: "",
      documentBackImageStorageKey: "",
    },
    isParticipatingInActiveEvent:
      overrides.isParticipatingInActiveEvent ?? false,
    verificationStatus: { code: "unverified", pendingItems: [] },
  });
}

describe("buildPortalDancerDetailViewModel", () => {
  test("blocks archiving for a participant of the active event", () => {
    const viewModel = buildViewModel({ isParticipatingInActiveEvent: true });

    expect(viewModel.statusAction.intent).toBe("archive-dancer");
    expect(viewModel.statusAction.isBlocked).toBe(true);
  });

  test("leaves archiving alone when the dancer participates in nothing live", () => {
    const viewModel = buildViewModel();

    expect(viewModel.statusAction.isBlocked).toBe(false);
  });

  // Reactivating is never refused, so an archived participant keeps her action.
  test("never blocks reactivating an archived participant", () => {
    const viewModel = buildViewModel({
      dancer: { active: false },
      isParticipatingInActiveEvent: true,
    });

    expect(viewModel.statusAction.intent).toBe("reactivate-dancer");
    expect(viewModel.statusAction.isBlocked).toBe(false);
  });
});
