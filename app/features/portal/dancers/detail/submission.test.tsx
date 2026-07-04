/** @vitest-environment jsdom */

import { MemoryRouter } from "react-router";
import { describe, expect, test, vi } from "vitest";

import {
  installPortalSubmissionTestHooks,
  portalSubmissionRouterMocks,
  renderPortalSubmission,
} from "@/features/portal/test-support/submission";
import { getButton } from "@/lib/test-support/react-dom";
import { PortalDancerDetailRouteView } from "@/features/portal/dancers/detail/view";

installPortalSubmissionTestHooks();

describe("dancer detail submissions", () => {
  test("disables the save action while the edit submission is pending", async () => {
    const formData = new FormData();
    formData.set("intent", "update-dancer");

    portalSubmissionRouterMocks.useFetcher.mockReturnValue({
      data: undefined,
      state: "idle",
      submit: vi.fn(),
    });
    portalSubmissionRouterMocks.useNavigation.mockReturnValue({
      formData,
      state: "submitting",
    });
    portalSubmissionRouterMocks.useSubmit.mockReturnValue(vi.fn());

    await renderPortalSubmission(
      <MemoryRouter initialEntries={["/portal/bailarines/dancer_1"]}>
        <PortalDancerDetailRouteView
          loaderData={buildDancerDetailLoaderData()}
        />
      </MemoryRouter>,
    );

    const submitButton = getButton("Guardar");

    expect(submitButton.disabled).toBe(true);
    expect(submitButton.querySelector("svg.animate-spin")).not.toBeNull();
  });
});

function buildDancerDetailLoaderData(): Parameters<
  typeof PortalDancerDetailRouteView
>[0]["loaderData"] {
  return {
    documentImageUrls: {
      back: null,
      front: null,
    },
    dancer: {
      id: "dancer_1",
      academyId: "academy_1",
      firstName: "Ana",
      lastName: "Paz",
      birthDate: "2014-01-01",
      documentType: null,
      documentNumber: null,
      documentFrontImageStorageKey: null,
      documentBackImageStorageKey: null,
      identityVerifiedAt: null,
      active: true,
      createdAt: new Date("2026-01-01T12:00:00Z"),
      updatedAt: new Date("2026-01-02T12:00:00Z"),
    },
  };
}
