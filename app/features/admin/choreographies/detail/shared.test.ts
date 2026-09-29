import { describe, expect, test } from "vitest";

import {
  resolveChoreographyDraftIntent,
  saveChoreographyDraftIntent,
} from "./draft.shared";
import {
  formatChoreographyRemovalDescription,
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

describe("formatChoreographyRemovalDescription", () => {
  test("announces a withdrawal that moves no money", () => {
    const description = formatChoreographyRemovalDescription({
      outcome: "withdrawn",
      presentationOrderNumber: null,
    });

    expect(description).toContain("queda retirada");
    expect(description).toContain("No se mueve dinero");
  });

  test("announces an outright removal that leaves nothing behind", () => {
    const description = formatChoreographyRemovalDescription({
      outcome: "deleted",
      presentationOrderNumber: null,
    });

    expect(description).toContain("se elimina por completo");
    expect(description).not.toContain("retirada");
  });

  test("names the presentation it will pull out of the order in both outcomes", () => {
    for (const outcome of ["deleted", "withdrawn"] as const) {
      expect(
        formatChoreographyRemovalDescription({
          outcome,
          presentationOrderNumber: 7,
        }),
      ).toContain("presentación n.º 7");
    }
  });
});

function buildFormData(intent: string) {
  const formData = new FormData();
  formData.set("intent", intent);

  return formData;
}
