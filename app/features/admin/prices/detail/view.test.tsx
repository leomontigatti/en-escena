/** @vitest-environment jsdom */

import type { ComponentProps } from "react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, test, vi } from "vitest";

import { AdministrativeEventPriceDetailView } from "@/features/admin/prices/detail/view";
import type { AdministrativeEventPriceDetailLoaderData } from "@/features/admin/prices/shared";
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

describe("AdministrativeEventPriceDetailView delete", () => {
  const renderer = createReactDomTestRenderer();

  afterEach(() => {
    renderer.cleanup();
    useNavigationMock.mockReset();
  });

  test("confirms the delete through the shared alert dialog", async () => {
    useNavigationMock.mockReturnValue({ state: "idle" });

    await renderDetail();

    expect(document.querySelector('[role="alertdialog"]')).not.toBeNull();
    expect(document.body.textContent).toContain("Eliminar precio");
    expect(getButton("Eliminar").disabled).toBe(false);
  });

  test("disables the destructive action while its delete submission is pending", async () => {
    const formData = new FormData();
    formData.set("intent", "delete-price");
    formData.set("id", "price_1");
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
      ComponentProps<typeof AdministrativeEventPriceDetailView>
    > = {},
  ) {
    const router = createMemoryRouter(
      [
        {
          path: "/administracion/precios/price_1",
          action: async () => null,
          element: (
            <AdministrativeEventPriceDetailView
              loaderData={buildLoaderData()}
              priceId="price_1"
              initialDeleteDialogOpen
              {...props}
            />
          ),
        },
      ],
      { initialEntries: ["/administracion/precios/price_1"] },
    );

    await renderer.renderAsync(<RouterProvider router={router} />);
  }
});

function buildLoaderData(): AdministrativeEventPriceDetailLoaderData {
  return {
    selectedEventId: "event_1",
    schedules: [],
    prices: [
      {
        id: "price_1",
        name: "Precio Solo",
        eventId: "event_1",
        groupType: "solo",
        amount: 12000,
        paymentDeadline: "2026-05-31",
        scheduleId: null,
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        schedule: null,
      },
    ],
  };
}
