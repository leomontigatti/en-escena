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

import { PortalProfessorDetailRouteView } from "@/features/portal/professors/detail/view";

type ProfessorDetailViewProps = Parameters<
  typeof PortalProfessorDetailRouteView
>[0];

describe("ProfessorStatusDialog", () => {
  const renderer = createReactDomTestRenderer();

  afterEach(() => {
    renderer.cleanup();
    useNavigationMock.mockReset();
  });

  async function renderReactivation() {
    const router = createMemoryRouter(
      [
        {
          path: "/portal/profesores/:professorId",
          action: async () => null,
          element: (
            <PortalProfessorDetailRouteView
              loaderData={{
                isParticipatingInActiveEvent: false,
                professor: archivedProfessor(),
              }}
              initialStatusDialogIntent="reactivate-professor"
            />
          ),
        },
      ],
      { initialEntries: ["/portal/profesores/profesor_1"] },
    );

    await renderer.renderAsync(<RouterProvider router={router} />);
  }

  test("disables `Cancelar` with `Reactivar` while the status change is in flight", async () => {
    const formData = new FormData();
    formData.set("intent", "reactivate-professor");
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

function archivedProfessor() {
  return {
    id: "profesor_1",
    firstName: "Ana",
    lastName: "Zapata",
    active: false,
    documentType: null,
    documentNumber: null,
    isIncomplete: true,
    participationStatus: "not-participating" as const,
  } satisfies ProfessorDetailViewProps["loaderData"]["professor"];
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
