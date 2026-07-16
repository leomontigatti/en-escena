import { describe, expect, test } from "vitest";

import {
  renameAdministrativeChoreographyIntent,
  resolveAdministrativeChoreographyRosterIntent,
  shouldRevalidateAdministrativeChoreographyDetail,
  updateAdministrativeChoreographyRosterIntent,
} from "./shared";

describe("shouldRevalidateAdministrativeChoreographyDetail", () => {
  test("does not revalidate after resolving a tentative roster", () => {
    expect(
      shouldRevalidateAdministrativeChoreographyDetail({
        defaultShouldRevalidate: true,
        formData: buildFormData(resolveAdministrativeChoreographyRosterIntent),
      }),
    ).toBe(false);
  });

  test("revalidates after the roster is actually saved", () => {
    expect(
      shouldRevalidateAdministrativeChoreographyDetail({
        defaultShouldRevalidate: true,
        formData: buildFormData(updateAdministrativeChoreographyRosterIntent),
      }),
    ).toBe(true);
  });

  test("revalidates after a rename", () => {
    expect(
      shouldRevalidateAdministrativeChoreographyDetail({
        defaultShouldRevalidate: true,
        formData: buildFormData(renameAdministrativeChoreographyIntent),
      }),
    ).toBe(true);
  });

  test("defers to the router when there is no form data", () => {
    expect(
      shouldRevalidateAdministrativeChoreographyDetail({
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
