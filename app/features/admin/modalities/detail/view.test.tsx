/** @vitest-environment jsdom */

import type { ComponentProps } from "react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, test, vi } from "vitest";

import { AdministrativeEventModalityDetailView } from "@/features/admin/modalities/detail/view";
import type { AdministrativeEventModalitiesLoaderData } from "@/features/admin/modalities/shared";
import {
  createReactDomTestRenderer,
  getButton,
} from "@/lib/test-support/react-dom";

const useNavigationMock = vi.hoisted(() => vi.fn());

vi.mock("react-router", async () => {
  const actual =
    await vi.importActual<typeof import("react-router")>("react-router");

  return {
    ...actual,
    useNavigation: useNavigationMock,
  };
});

describe("AdministrativeEventModalityDetailView delete", () => {
  const renderer = createReactDomTestRenderer();

  afterEach(() => {
    renderer.cleanup();
    useNavigationMock.mockReset();
  });

  test("confirms the delete through the shared alert dialog", async () => {
    useNavigationMock.mockReturnValue({ state: "idle" });

    await renderDetail();

    expect(document.querySelector('[role="alertdialog"]')).not.toBeNull();
    expect(document.body.textContent).toContain("Eliminar modalidad");
    expect(getButton("Eliminar").disabled).toBe(false);
  });

  test("disables the destructive action while its delete submission is pending", async () => {
    const formData = new FormData();
    formData.set("intent", "delete-modality");
    formData.set("id", "modality_1");
    useNavigationMock.mockReturnValue({
      formData,
      formMethod: "post",
      state: "submitting",
    });

    await renderDetail();

    expect(getButton("Eliminar").disabled).toBe(true);
  });

  async function renderDetail(
    props: Partial<
      ComponentProps<typeof AdministrativeEventModalityDetailView>
    > = {},
  ) {
    const router = createMemoryRouter(
      [
        {
          path: "/administracion/modalidades/modality_1",
          action: async () => null,
          element: (
            <AdministrativeEventModalityDetailView
              loaderData={buildLoaderData()}
              modalityId="modality_1"
              initialDeleteDialogOpen
              {...props}
            />
          ),
        },
      ],
      { initialEntries: ["/administracion/modalidades/modality_1"] },
    );

    await renderer.renderAsync(<RouterProvider router={router} />);
  }
});

function buildLoaderData(): AdministrativeEventModalitiesLoaderData {
  return {
    selectedEventId: "event_1",
    modalities: [
      {
        id: "modality_1",
        eventId: "event_1",
        name: "Clásico",
        createdAt: new Date("2026-01-01T00:00:00Z"),
      },
    ],
    submodalities: [],
  };
}
