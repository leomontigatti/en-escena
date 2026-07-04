/** @vitest-environment jsdom */

import { MemoryRouter } from "react-router";
import { describe, expect, test, vi } from "vitest";

import {
  clickButton,
  installPortalSubmissionTestHooks,
  portalSubmissionRouterMocks,
  renderPortalSubmission,
  rerenderPortalSubmission,
  type PortalSubmissionFetcherState,
} from "@/features/portal/test-support/submission";
import { PortalDancersListRouteView } from "@/features/portal/dancers/list/view";

installPortalSubmissionTestHooks();

describe("dancer create submissions", () => {
  test("closes the create dialog after a successful fetcher submission", async () => {
    let fetcherState: PortalSubmissionFetcherState = {
      data: undefined,
      state: "submitting",
      submit: vi.fn(),
    };

    portalSubmissionRouterMocks.useFetcher.mockImplementation(
      () => fetcherState,
    );
    portalSubmissionRouterMocks.useNavigation.mockReturnValue({
      formData: undefined,
      state: "idle",
    });
    portalSubmissionRouterMocks.useSubmit.mockReturnValue(vi.fn());

    const buildElement = () => (
      <MemoryRouter initialEntries={["/portal/bailarines"]}>
        <PortalDancersListRouteView loaderData={{ dancers: [] }} />
      </MemoryRouter>
    );

    await renderPortalSubmission(buildElement());

    await clickButton("Nuevo bailarín");

    expect(document.body.textContent).toContain("Nuevo bailarín");

    fetcherState = {
      data: undefined,
      state: "idle",
      submit: fetcherState.submit,
    };

    await rerenderPortalSubmission(buildElement());

    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });
});
