import { describe, expect, test } from "vitest";

import { expectSharedBirthDateRules } from "@/lib/test-support/dancer-birth-date-schema";

import {
  buildPortalDancerDetailViewModel,
  buildPortalDancerSchema,
  type PortalDancerDetailLoaderData,
} from "./shared";

describe("portal dancer update schema", () => {
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
});

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
    identificationPendingItems: [],
    isParticipatingInActiveEvent:
      overrides.isParticipatingInActiveEvent ?? false,
    verificationStatus: "unverified",
  });
}

describe("buildPortalDancerDetailViewModel", () => {
  test("disables archiving and explains it for a participant of the active event", () => {
    const viewModel = buildViewModel({ isParticipatingInActiveEvent: true });

    expect(viewModel.statusAction.intent).toBe("archive-dancer");
    expect(viewModel.statusAction.disabled).toBe(true);
    expect(viewModel.participatingAlert).toBe(
      "Este bailarín no puede archivarse porque está participando del evento activo.",
    );
  });

  test("leaves archiving alone when the dancer participates in nothing live", () => {
    const viewModel = buildViewModel();

    expect(viewModel.statusAction.disabled).toBe(false);
    expect(viewModel.participatingAlert).toBeNull();
  });

  // Reactivating is never refused, so an archived participant keeps her action.
  test("never disables reactivating an archived participant", () => {
    const viewModel = buildViewModel({
      dancer: { active: false },
      isParticipatingInActiveEvent: true,
    });

    expect(viewModel.statusAction.intent).toBe("reactivate-dancer");
    expect(viewModel.statusAction.disabled).toBe(false);
    expect(viewModel.participatingAlert).toBeNull();
  });
});
