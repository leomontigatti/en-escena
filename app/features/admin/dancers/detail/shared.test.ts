import { describe, expect, test } from "vitest";

import { expectSharedBirthDateRules } from "@/lib/test-support/dancer-birth-date-schema";

import { buildDancerUpdateSchema, getInitialDialogIntent } from "./shared";

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

  test("re-opens the status dialog for a failure carrying no update values", () => {
    expect(
      getInitialDialogIntent({
        actionData: {
          status: "error",
          message: "No se pudo archivar.",
          fieldErrors: {},
          values: { firstName: "Ana" } as never,
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
