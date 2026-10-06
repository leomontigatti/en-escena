/** @vitest-environment jsdom */

import type { ReactNode } from "react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, test, vi } from "vitest";

import {
  installPortalSubmissionTestHooks,
  portalSubmissionRouterMocks,
  renderPortalSubmission,
  updatePortalSubmissionForm,
} from "@/features/portal/test-support/submission";
import { getButton } from "@/lib/test-support/react-dom";
import { PortalDancerDetailRouteView } from "@/features/portal/dancers/detail/view";

const toastError = vi.hoisted(() => vi.fn());

vi.mock("sonner", () => ({
  toast: {
    error: toastError,
    info: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
  },
}));

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
      <DataRouter>
        <PortalDancerDetailRouteView
          loaderData={buildDancerDetailLoaderData()}
        />
      </DataRouter>,
    );

    const submitButton = getButton("Guardar");

    expect(submitButton.disabled).toBe(true);
    expect(submitButton.querySelector("svg.animate-spin")).not.toBeNull();
  });

  test("toasts the duplicate-document refusal with a link to the match, off the field", async () => {
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
      <DataRouter>
        <PortalDancerDetailRouteView
          loaderData={buildDancerDetailLoaderData()}
          actionData={{
            status: "error",
            message: "Revisá los datos del Bailarín.",
            fieldErrors: {
              documentNumber:
                "Ya existe un bailarín archivado con ese documento en tu academia.",
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
      </DataRouter>,
    );

    const documentField = getDocumentNumberField();

    await updatePortalSubmissionForm(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(documentField.getAttribute("aria-invalid")).toBeNull();
    expect(document.body.textContent).not.toContain(
      "Ya existe un bailarín archivado con ese documento en tu academia.",
    );
    expect(toastError).toHaveBeenCalledWith(
      "Ya existe un bailarín archivado con ese documento en tu academia.",
      expect.objectContaining({
        action: expect.objectContaining({
          props: expect.objectContaining({ children: "Ver ficha" }),
        }),
        id: "portal-bailarin-detail:error",
      }),
    );
  });
});

// The page's leave guard needs a data router.
function DataRouter({ children }: { children: ReactNode }) {
  const router = createMemoryRouter(
    [{ element: children, path: "/portal/bailarines/:dancerId" }],
    { initialEntries: ["/portal/bailarines/dancer_1"] },
  );

  return <RouterProvider router={router} />;
}

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
    seminarInscriptions: [],
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
