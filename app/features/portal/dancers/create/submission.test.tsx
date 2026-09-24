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
import { eventDocumentDownloadUrls } from "@/lib/events/event-documents.test-support";

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
        <PortalDancersListRouteView
          loaderData={{
            activeEventStartDate: "2026-09-25",
            dancers: [],
            documentDownloadUrls: eventDocumentDownloadUrls(),
          }}
        />
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

  test("lands the duplicate-document refusal on the field and links to the match", async () => {
    portalSubmissionRouterMocks.useFetcher.mockReturnValue({
      data: undefined,
      state: "idle",
      submit: vi.fn(),
    });
    portalSubmissionRouterMocks.useNavigation.mockReturnValue({
      formData: undefined,
      state: "idle",
    });
    portalSubmissionRouterMocks.useSubmit.mockReturnValue(vi.fn());

    await renderPortalSubmission(
      <MemoryRouter initialEntries={["/portal/bailarines"]}>
        <PortalDancersListRouteView
          loaderData={{
            activeEventStartDate: "2026-09-25",
            dancers: [],
            documentDownloadUrls: eventDocumentDownloadUrls(),
          }}
          actionData={{
            status: "error",
            fieldErrors: {
              documentNumber:
                "Ya existe un Bailarín archivado con ese documento en tu academia.",
            },
            values: {
              firstName: "Ana",
              lastName: "Paz",
              birthDate: "2014-01-01",
              documentType: "dni",
              documentNumber: "30111222",
            },
            modalOpen: true,
            duplicateDocumentDancerId: "dancer_archived_1",
          }}
        />
      </MemoryRouter>,
    );

    const documentField = document.querySelector<HTMLInputElement>(
      'input[name="documentNumber"]',
    );

    expect(documentField?.value).toBe("30111222");
    expect(documentField?.getAttribute("aria-invalid")).toBe("true");
    expect(document.body.textContent).toContain(
      "Ya existe un Bailarín archivado con ese documento en tu academia.",
    );
    expect(
      document.querySelector<HTMLAnchorElement>(
        'a[href="/portal/bailarines/dancer_archived_1"]',
      )?.textContent,
    ).toBe("Ver la ficha del bailarín con ese documento");
  });
});
