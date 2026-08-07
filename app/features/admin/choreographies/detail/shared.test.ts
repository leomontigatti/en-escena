import { describe, expect, test } from "vitest";

import {
  renameChoreographyIntent,
  resolveChoreographyRosterIntent,
  shouldRevalidateChoreographyDetail,
  toChoreographyDetailViewActionData,
  updateChoreographyRosterIntent,
} from "./shared";

describe("shouldRevalidateChoreographyDetail", () => {
  test("does not revalidate after resolving a tentative roster", () => {
    expect(
      shouldRevalidateChoreographyDetail({
        defaultShouldRevalidate: true,
        formData: buildFormData(resolveChoreographyRosterIntent),
      }),
    ).toBe(false);
  });

  test("revalidates after the roster is actually saved", () => {
    expect(
      shouldRevalidateChoreographyDetail({
        defaultShouldRevalidate: true,
        formData: buildFormData(updateChoreographyRosterIntent),
      }),
    ).toBe(true);
  });

  test("revalidates after a rename", () => {
    expect(
      shouldRevalidateChoreographyDetail({
        defaultShouldRevalidate: true,
        formData: buildFormData(renameChoreographyIntent),
      }),
    ).toBe(true);
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
  test("forwards the rejection of a cupo de cronograma to the view", () => {
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

  test("drops a bespoke status the view never reads", () => {
    expect(
      toChoreographyDetailViewActionData({
        message: "Revisá el roster.",
        section: "dancers",
        status: "roster-error",
      }),
    ).toBeUndefined();
  });

  test("drops results without a status and redirects", () => {
    expect(
      toChoreographyDetailViewActionData({
        intent: resolveChoreographyRosterIntent,
      }),
    ).toBeUndefined();
    expect(toChoreographyDetailViewActionData(new Response())).toBeUndefined();
    expect(toChoreographyDetailViewActionData()).toBeUndefined();
  });
});

function buildFormData(intent: string) {
  const formData = new FormData();
  formData.set("intent", intent);

  return formData;
}
