import { describe, expect, test } from "vitest";

import {
  resolveChoreographyDraftIntent,
  saveChoreographyDraftIntent,
} from "./draft.shared";
import {
  describeChoreographyRemoval,
  shouldRevalidateChoreographyDetail,
  toChoreographyDetailViewActionData,
} from "./shared";

describe("shouldRevalidateChoreographyDetail", () => {
  test("does not revalidate after previewing a draft", () => {
    expect(
      shouldRevalidateChoreographyDetail({
        defaultShouldRevalidate: true,
        formData: buildFormData(resolveChoreographyDraftIntent),
      }),
    ).toBe(false);
  });

  test("revalidates after the draft is saved", () => {
    expect(
      shouldRevalidateChoreographyDetail({
        actionResult: { message: "Coreografía guardada.", status: "success" },
        defaultShouldRevalidate: true,
        formData: buildFormData(saveChoreographyDraftIntent),
      }),
    ).toBe(true);
  });

  // A refused save wrote nothing: reloading would only start the draft over.
  test("does not revalidate after a refused save", () => {
    expect(
      shouldRevalidateChoreographyDetail({
        actionResult: { message: "Sin cupo.", status: "error" },
        defaultShouldRevalidate: true,
        formData: buildFormData(saveChoreographyDraftIntent),
      }),
    ).toBe(false);
  });

  test("defers to the router when there is no form data", () => {
    expect(
      shouldRevalidateChoreographyDetail({
        defaultShouldRevalidate: false,
      }),
    ).toBe(false);
  });
});

describe("toChoreographyDetailViewActionData", () => {
  test("forwards a refused save to the view", () => {
    const rejection = {
      message:
        "El cupo de cronograma seleccionado ya no tiene cupo disponible.",
      status: "error",
    } as const;

    expect(toChoreographyDetailViewActionData(rejection)).toBe(rejection);
  });

  test("forwards a saved confirmation", () => {
    const success = {
      message: "Coreografía guardada.",
      status: "success",
    } as const;

    expect(toChoreographyDetailViewActionData(success)).toBe(success);
  });

  test("drops a preview's answer and redirects", () => {
    expect(
      toChoreographyDetailViewActionData({
        intent: resolveChoreographyDraftIntent,
      }),
    ).toBeUndefined();
    expect(toChoreographyDetailViewActionData(new Response())).toBeUndefined();
    expect(toChoreographyDetailViewActionData()).toBeUndefined();
  });
});

describe("describeChoreographyRemoval", () => {
  test("asks to withdraw a choreography that holds money or comprobantes", () => {
    expect(
      describeChoreographyRemoval({
        outcome: "withdrawn",
        presentationOrderNumber: null,
      }),
    ).toEqual({
      consequence: "Al retirarla también libera su cupo del cronograma.",
      description:
        "Al tener dinero asignado o comprobantes emitidos, no puede eliminarse. Podés revisarla desde la lista de finanzas.",
      outcome: "withdrawn",
      title: "¿Retirar la coreografía?",
    });
  });

  test("asks to delete outright a choreography that holds neither", () => {
    expect(
      describeChoreographyRemoval({
        outcome: "deleted",
        presentationOrderNumber: null,
      }),
    ).toEqual({
      description:
        "Al no tener dinero asignado ni comprobantes emitidos, se elimina por completo. Al eliminarla también libera su cupo del cronograma.",
      outcome: "deleted",
      title: "¿Eliminar la coreografía?",
    });
  });

  test("says the order number is lost in both outcomes", () => {
    const withdrawal = describeChoreographyRemoval({
      outcome: "withdrawn",
      presentationOrderNumber: 7,
    });
    const deletion = describeChoreographyRemoval({
      outcome: "deleted",
      presentationOrderNumber: 7,
    });

    expect(withdrawal.outcome === "withdrawn" && withdrawal.consequence).toBe(
      "Al retirarla también libera su cupo del cronograma y pierde el número de orden.",
    );
    expect(deletion.description).toMatch(
      /cupo del cronograma y pierde el número de orden\.$/,
    );
  });
});

function buildFormData(intent: string) {
  const formData = new FormData();
  formData.set("intent", intent);

  return formData;
}
