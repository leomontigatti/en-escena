import { describe, expect, test } from "vitest";

import { expectSharedBirthDateRules } from "@/lib/test-support/dancer-birth-date-schema";

import {
  buildDancerDetailViewState,
  buildDancerUpdateSchema,
  getInitialDialogIntent,
  type DancerDetailLoaderData,
} from "./shared";

describe("admin dancer update schema", () => {
  test("applies the shared birth-date rules", () => {
    expectSharedBirthDateRules({
      buildSchema: buildDancerUpdateSchema,
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

const updateValues = {
  firstName: "Ana",
  lastName: "Paz",
  birthDate: "2010-01-01",
  documentType: "",
  documentNumber: "",
  documentFrontImageStorageKey: "",
  documentBackImageStorageKey: "",
};

describe("getInitialDialogIntent", () => {
  test("re-opens the save confirmation for a rejected update", () => {
    expect(
      getInitialDialogIntent({
        actionData: {
          status: "error",
          message: "Revisá los campos marcados.",
          fieldErrors: {},
          values: updateValues,
        },
        shouldConfirmSave: true,
        statusIntent: "archive-dancer",
      }),
    ).toBe("save");
  });

  // Carrying `values` is what marks a failure as a rejected edit, and an edit
  // that needs no confirmation re-opens no dialog at all: the form is already
  // mounted with the submitted values back in it.
  test("opens no dialog for a rejected update that needs no confirmation", () => {
    expect(
      getInitialDialogIntent({
        actionData: {
          status: "error",
          message: "Revisá los campos marcados.",
          fieldErrors: {},
          values: updateValues,
        },
        shouldConfirmSave: false,
        statusIntent: "archive-dancer",
      }),
    ).toBeNull();
  });

  test("re-opens the status dialog for an archive the server refused", () => {
    expect(
      getInitialDialogIntent({
        actionData: {
          status: "error",
          message:
            "Este bailarín no puede archivarse porque está participando del evento activo.",
          fieldErrors: {},
        },
        shouldConfirmSave: false,
        statusIntent: "archive-dancer",
      }),
    ).toBe("archive-dancer");
  });

  // The generic error carries no `values` either, and it may well come from
  // "Guardar": opening the archive dialog would be an action nobody asked for.
  test("opens no dialog for an unexpected failure", () => {
    expect(
      getInitialDialogIntent({
        actionData: {
          status: "error",
          message: "No pudimos completar la acción. Intentá nuevamente.",
        },
        shouldConfirmSave: true,
        statusIntent: "archive-dancer",
      }),
    ).toBeNull();
  });
});

const dancer = {
  active: true,
  birthDate: "2010-01-01",
  documentBackImageStorageKey: null,
  documentFrontImageStorageKey: null,
  documentNumber: null,
  documentType: null,
  editConsequence: null,
  identificationStatus: "incomplete",
  participatedInAnyEvent: false,
} as unknown as DancerDetailLoaderData["dancer"];

function buildViewState(
  overrides: {
    dancer?: Partial<DancerDetailLoaderData["dancer"]>;
    isParticipatingInActiveEvent?: boolean;
  } = {},
) {
  return buildDancerDetailViewState({
    actionData: undefined,
    canEdit: true,
    dancer: { ...dancer, ...overrides.dancer },
    isParticipatingInActiveEvent:
      overrides.isParticipatingInActiveEvent ?? false,
    requestedEditMode: false,
    watchedBirthDate: "2010-01-01",
  });
}

describe("buildDancerDetailViewState", () => {
  test("disables archiving and explains it for a participant of the active event", () => {
    const viewState = buildViewState({ isParticipatingInActiveEvent: true });

    expect(viewState.statusAction.intent).toBe("archive-dancer");
    expect(viewState.statusAction.disabled).toBe(true);
    expect(viewState.participatingAlert).toBe(
      "Este bailarín no puede archivarse porque está participando del evento activo.",
    );
  });

  test("leaves archiving alone when the dancer participates in nothing live", () => {
    const viewState = buildViewState();

    expect(viewState.statusAction.disabled).toBe(false);
    expect(viewState.participatingAlert).toBeNull();
  });

  // Reactivating is never refused, so the archived participant —the one row the
  // rule grandfathers— keeps her action and gets no alert about it.
  test("never disables reactivating an archived participant", () => {
    const viewState = buildViewState({
      dancer: { active: false },
      isParticipatingInActiveEvent: true,
    });

    expect(viewState.statusAction.intent).toBe("reactivate-dancer");
    expect(viewState.statusAction.disabled).toBe(false);
    expect(viewState.participatingAlert).toBeNull();
  });
});
