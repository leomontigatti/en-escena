/** @vitest-environment jsdom */

import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, test, vi } from "vitest";

import { createReactDomTestRenderer } from "@/lib/test-support/react-dom";

const useNavigationMock = vi.hoisted(() => vi.fn());

vi.mock("react-router", async () => {
  const actual =
    await vi.importActual<typeof import("react-router")>("react-router");

  return {
    ...actual,
    useNavigation: useNavigationMock,
  };
});

import { PortalDancerDetailRouteView } from "@/features/portal/dancers/detail/view";

type DancerDetailViewProps = Parameters<typeof PortalDancerDetailRouteView>[0];

describe("PortalDancerStatusDialog", () => {
  const renderer = createReactDomTestRenderer();

  afterEach(() => {
    renderer.cleanup();
    useNavigationMock.mockReset();
  });

  async function renderReactivation() {
    const router = createMemoryRouter(
      [
        {
          path: "/portal/bailarines/:dancerId",
          action: async () => null,
          element: (
            <PortalDancerDetailRouteView
              loaderData={archivedDancerLoaderData()}
              initialStatusDialogIntent="reactivate-dancer"
            />
          ),
        },
      ],
      { initialEntries: ["/portal/bailarines/dancer_1"] },
    );

    await renderer.renderAsync(<RouterProvider router={router} />);
  }

  test("disables `Cancelar` with `Reactivar` while the status change is in flight", async () => {
    const formData = new FormData();
    formData.set("intent", "reactivate-dancer");
    useNavigationMock.mockReturnValue({
      formData,
      formMethod: "post",
      state: "submitting",
    });

    await renderReactivation();

    expect(dialogButton("Cancelar").disabled).toBe(true);
    expect(dialogButton("Reactivar").disabled).toBe(true);
    expect(
      dialogButton("Reactivar").querySelector('[data-slot="spinner"]'),
    ).not.toBeNull();
  });

  test("offers both buttons while nothing is in flight", async () => {
    useNavigationMock.mockReturnValue({ state: "idle" });

    await renderReactivation();

    expect(dialogButton("Cancelar").disabled).toBe(false);
    expect(dialogButton("Reactivar").disabled).toBe(false);
  });
});

function archivedDancerLoaderData() {
  return {
    activeEventStartDate: "2026-09-25",
    documentImageUrls: { back: null, front: null },
    dancer: {
      id: "dancer_1",
      academyId: "academy_1",
      firstName: "Bailarina",
      lastName: "Prueba",
      active: false,
      birthDate: "2015-01-01",
      documentType: null,
      documentNumber: null,
      documentFrontImageStorageKey: null,
      documentBackImageStorageKey: null,
      identityVerifiedAt: null,
      createdAt: new Date("2026-01-01T12:00:00Z"),
      updatedAt: new Date("2026-01-02T12:00:00Z"),
    },
    inscriptions: [],
    seminarInscriptions: [],
    isParticipatingInActiveEvent: false,
    selectedEventId: "event_1",
  } satisfies DancerDetailViewProps["loaderData"];
}

/** The page has its own `Reactivar`; the dialog's footer is what is under test. */
function dialogButton(label: string) {
  const dialog = document.querySelector('[role="alertdialog"]');
  const button = Array.from(dialog?.querySelectorAll("button") ?? []).find(
    (candidate) => candidate.textContent?.trim() === label,
  );

  if (!button) {
    throw new Error(`Expected the dialog to offer "${label}".`);
  }

  return button;
}
