import { describe, expect, test } from "vitest";

import {
  renameAdministrativeChoreographyIntent,
  resolveAdministrativeChoreographyRosterIntent,
  shouldRevalidateChoreographyDetail,
  updateAdministrativeChoreographyRosterIntent,
} from "./shared";

describe("shouldRevalidateChoreographyDetail", () => {
  test("does not revalidate after resolving a tentative roster", () => {
    expect(
      shouldRevalidateChoreographyDetail({
        defaultShouldRevalidate: true,
        formData: buildFormData(resolveAdministrativeChoreographyRosterIntent),
      }),
    ).toBe(false);
  });

  test("revalidates after the roster is actually saved", () => {
    expect(
      shouldRevalidateChoreographyDetail({
        defaultShouldRevalidate: true,
        formData: buildFormData(updateAdministrativeChoreographyRosterIntent),
      }),
    ).toBe(true);
  });

  test("revalidates after a rename", () => {
    expect(
      shouldRevalidateChoreographyDetail({
        defaultShouldRevalidate: true,
        formData: buildFormData(renameAdministrativeChoreographyIntent),
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

function buildFormData(intent: string) {
  const formData = new FormData();
  formData.set("intent", intent);

  return formData;
}
