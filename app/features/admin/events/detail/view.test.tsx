/** @vitest-environment jsdom */

import type { ComponentProps } from "react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, test, vi } from "vitest";

import { AdministrativeEventDetailView } from "@/features/admin/events/detail/view";
import type { AdministrativeEventDetailLoaderData } from "@/features/admin/events/detail/shared";
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

describe("AdministrativeEventDetailView delete", () => {
  const renderer = createReactDomTestRenderer();

  afterEach(() => {
    renderer.cleanup();
    useNavigationMock.mockReset();
  });

  test("confirms the delete through the shared alert dialog", async () => {
    useNavigationMock.mockReturnValue({ state: "idle" });

    await renderDetail();

    expect(document.querySelector('[role="alertdialog"]')).not.toBeNull();
    expect(document.body.textContent).toContain("Eliminar evento");
    expect(getButton("Eliminar").disabled).toBe(false);
  });

  test("disables the destructive action while its delete submission is pending", async () => {
    const formData = new FormData();
    formData.set("intent", "delete");
    formData.set("id", "event_1");
    useNavigationMock.mockReturnValue({
      formData,
      formMethod: "post",
      state: "submitting",
    });

    await renderDetail();

    expect(getButton("Eliminar").disabled).toBe(true);
  });

  async function renderDetail(
    props: Partial<ComponentProps<typeof AdministrativeEventDetailView>> = {},
  ) {
    const router = createMemoryRouter(
      [
        {
          path: "/administracion/eventos/event_1",
          action: async () => null,
          element: (
            <AdministrativeEventDetailView
              loaderData={buildLoaderData()}
              initialDeleteDialogOpen
              {...props}
            />
          ),
        },
      ],
      { initialEntries: ["/administracion/eventos/event_1"] },
    );

    await renderer.renderAsync(<RouterProvider router={router} />);
  }
});

function buildLoaderData(): AdministrativeEventDetailLoaderData {
  return {
    event: {
      id: "event_1",
      name: "Festival 2026",
      active: true,
      programVisible: false,
      resultsVisible: false,
      requiredDepositPercentage: 30,
      registrationStartsAt: new Date("2026-01-01T00:00:00Z"),
      registrationEndsAt: new Date("2026-02-01T00:00:00Z"),
      startsAt: new Date("2026-03-01T00:00:00Z"),
      endsAt: new Date("2026-03-02T00:00:00Z"),
      registrationReady: true,
      registrationReadinessMissingItems: [],
      registrationReadinessDirty: false,
      registrationReadinessCalculatedAt: null,
      createdAt: new Date("2026-01-01T00:00:00Z"),
    },
    registrationReadiness: {
      eventId: "event_1",
      isReady: true,
      missingItems: [],
    },
  };
}
