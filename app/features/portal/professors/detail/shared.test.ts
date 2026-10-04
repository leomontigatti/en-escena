import { describe, expect, test } from "vitest";

import { buildPortalProfessorDetailViewModel, professorSchema } from "./shared";

function buildViewModel(
  overrides: {
    active?: boolean;
    isParticipatingInActiveEvent?: boolean;
  } = {},
) {
  return buildPortalProfessorDetailViewModel({
    active: overrides.active ?? true,
    isParticipatingInActiveEvent:
      overrides.isParticipatingInActiveEvent ?? false,
  });
}

describe("buildPortalProfessorDetailViewModel", () => {
  test("blocks archiving for a participant of the active event", () => {
    const viewModel = buildViewModel({ isParticipatingInActiveEvent: true });

    expect(viewModel.statusAction.intent).toBe("archive-professor");
    expect(viewModel.statusAction.isBlocked).toBe(true);
  });

  test("leaves archiving alone when the professor participates in nothing live", () => {
    const viewModel = buildViewModel();

    expect(viewModel.statusAction.isBlocked).toBe(false);
  });

  // Reactivating is never refused, so an archived participant keeps his action.
  test("never blocks reactivating an archived participant", () => {
    const viewModel = buildViewModel({
      active: false,
      isParticipatingInActiveEvent: true,
    });

    expect(viewModel.statusAction.intent).toBe("reactivate-professor");
    expect(viewModel.statusAction.isBlocked).toBe(false);
  });
});

describe("portal professor schema", () => {
  test("accepts a professor without a document", () => {
    expect(parse({ documentType: "", documentNumber: "" }).success).toBe(true);
  });

  test("refuses half a document pair", () => {
    expect(
      parse({ documentType: "", documentNumber: "30111222" }).error?.issues,
    ).toMatchObject([
      {
        message: "Seleccion\u00e1 el tipo de documento.",
        path: ["documentType"],
      },
    ]);
    expect(
      parse({ documentType: "dni", documentNumber: "" }).error?.issues,
    ).toMatchObject([
      {
        message: "Ingres\u00e1 el n\u00famero de documento.",
        path: ["documentNumber"],
      },
    ]);
  });
});

function parse(document: { documentType: string; documentNumber: string }) {
  return professorSchema.safeParse({
    firstName: "Ana",
    lastName: "Paz",
    ...document,
  });
}
