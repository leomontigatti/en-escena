import { describe, expect, test } from "vitest";

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
