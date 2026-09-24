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
      <MemoryRouter initialEntries={["/portal/bailarines/dancer_1"]}>
        <PortalDancerDetailRouteView
          loaderData={buildDancerDetailLoaderData()}
          actionData={{
            status: "error",
            message: "Revisá los datos del Bailarín.",
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
              documentFrontImageStorageKey: "",
              documentBackImageStorageKey: "",
            },
            duplicateDocumentDancerId: "dancer_archived_1",
          }}
        />
      </MemoryRouter>,
    );

    const documentField = getDocumentNumberField();

    expect(documentField.getAttribute("aria-invalid")).toBe("true");
    expect(document.body.textContent).toContain(
      "Ya existe un Bailarín archivado con ese documento en tu academia.",
    );

    const matchLink = document.querySelector<HTMLAnchorElement>(
      'a[href="/portal/bailarines/dancer_archived_1"]',
    );

    expect(matchLink?.textContent).toBe(
      "Ver la ficha del bailarín con ese documento",
    );
  });
});

function getDocumentNumberField() {
  const field = document.querySelector<HTMLInputElement>(
    'input[name="documentNumber"]',
  );

  if (!field) {
    throw new Error("The document number field is not in the DOM.");
  }

  return field;
}

function buildDancerDetailLoaderData(): Parameters<
  typeof PortalDancerDetailRouteView
>[0]["loaderData"] {
  return {
    activeEventStartDate: "2026-09-25",
    documentImageUrls: {
      back: null,
      front: null,
    },
    inscriptions: [],
    isParticipatingInActiveEvent: false,
    selectedEventId: "event_1",
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
