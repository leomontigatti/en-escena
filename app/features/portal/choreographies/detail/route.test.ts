import { describe, expect, test } from "vitest";

import { shouldRevalidate } from "@/routes/portal.coreografias_.$choreographyId";

describe("portal choreography detail route", () => {
  test("does not revalidate the loader after dancer roster resolution", () => {
    const resolveFormData = new FormData();
    resolveFormData.set("intent", "resolve-choreography-dancers");

    expect(
      shouldRevalidate({
        defaultShouldRevalidate: true,
        formData: resolveFormData,
      }),
    ).toBe(false);

    const updateFormData = new FormData();
    updateFormData.set("intent", "update-choreography");

    expect(
      shouldRevalidate({
        defaultShouldRevalidate: true,
        formData: updateFormData,
      }),
    ).toBe(true);
  });
});
