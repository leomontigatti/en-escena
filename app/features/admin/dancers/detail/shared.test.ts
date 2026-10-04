import { describe, expect, test } from "vitest";

import { expectSharedBirthDateRules } from "@/lib/test-support/dancer-birth-date-schema";

import {
  buildDancerDetailViewState,
  buildDancerUpdateSchema,
  getDancerConfirmation,
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
      }),
    ).toBeNull();
  });

  // A refused status change carries no `values`, and re-opens no dialog: the
  // reloaded page already has `Archivar` opening the blocked acknowledgment, so
  // the confirmation would offer a confirm the server refuses again.
  test("opens no dialog for an archive the server refused", () => {
    expect(
      getInitialDialogIntent({
        actionData: {
          status: "error",
          message:
            "Este bailarín no puede archivarse porque está participando del evento activo.",
          fieldErrors: {},
        },
        shouldConfirmSave: false,
      }),
    ).toBeNull();
  });

  test("opens no dialog for an unexpected failure", () => {
    expect(
      getInitialDialogIntent({
        actionData: {
          status: "error",
          message: "No pudimos completar la acción. Intentá nuevamente.",
        },
        shouldConfirmSave: true,
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
    canEdit: true,
    dancer: { ...dancer, ...overrides.dancer },
    isParticipatingInActiveEvent:
      overrides.isParticipatingInActiveEvent ?? false,
    watchedBirthDate: "2010-01-01",
  });
}

describe("buildDancerDetailViewState", () => {
  test("blocks archiving for a participant of the active event", () => {
    const viewState = buildViewState({ isParticipatingInActiveEvent: true });

    expect(viewState.statusAction.intent).toBe("archive-dancer");
    expect(viewState.statusAction.isBlocked).toBe(true);
  });

  test("leaves archiving alone when the dancer participates in nothing live", () => {
    const viewState = buildViewState();

    expect(viewState.statusAction.isBlocked).toBe(false);
  });

  // Reactivating is never refused, so the archived participant —the one row the
  // rule grandfathers— keeps her action.
  test("never blocks reactivating an archived participant", () => {
    const viewState = buildViewState({
      dancer: { active: false },
      isParticipatingInActiveEvent: true,
    });

    expect(viewState.statusAction.intent).toBe("reactivate-dancer");
    expect(viewState.statusAction.isBlocked).toBe(false);
  });
});

describe("getDancerConfirmation", () => {
  const archive = {
    description: "Archivá este Bailarín.",
    isBlocked: false,
    intent: "archive-dancer",
    label: "Archivar",
  } as const;
  const reactivate = {
    description: "Reactivá este Bailarín.",
    isBlocked: false,
    intent: "reactivate-dancer",
    label: "Reactivar Bailarín",
  } as const;

  test("asks to save with the consequence, and confirms with Guardar", () => {
    const confirmation = getDancerConfirmation({
      editConsequence: "participated",
      intent: "save",
      statusAction: archive,
    });

    expect(confirmation).toMatchObject({
      confirmLabel: "Guardar",
      destructive: false,
      submittedIntent: null,
      title: "¿Guardar los cambios?",
    });
    expect(confirmation.description).toContain("ya participó de un evento");
    expect(confirmation.confirmIcon).toBeDefined();
  });

  test("asks to archive with the verb alone, painted destructive", () => {
    expect(
      getDancerConfirmation({
        editConsequence: null,
        intent: "archive-dancer",
        statusAction: archive,
      }),
    ).toMatchObject({
      confirmLabel: "Archivar",
      description: "Archivá este Bailarín.",
      destructive: true,
      submittedIntent: "archive-dancer",
      title: "¿Archivar al bailarín?",
    });
  });

  // The menu item names the record; the dialog's verb repeats its title.
  test("confirms a reactivation with Reactivar, not the menu item's label", () => {
    expect(
      getDancerConfirmation({
        editConsequence: null,
        intent: "reactivate-dancer",
        statusAction: reactivate,
      }),
    ).toMatchObject({
      confirmLabel: "Reactivar",
      destructive: false,
      submittedIntent: "reactivate-dancer",
      title: "¿Reactivar al bailarín?",
    });
  });

  test("names what a verification verifies", () => {
    expect(
      getDancerConfirmation({
        editConsequence: null,
        intent: "verify",
        statusAction: archive,
      }),
    ).toMatchObject({
      confirmLabel: "Verificar",
      destructive: false,
      submittedIntent: "verify-dancer-identity",
      title: "¿Verificar la identidad del bailarín?",
    });
  });
});
