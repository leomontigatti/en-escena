/** @vitest-environment jsdom */

import type { ComponentProps } from "react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, test, vi } from "vitest";

import { AdministrativeEventScheduleDetailView } from "@/features/admin/schedules/detail/view";
import type { AdministrativeEventScheduleDetailLoaderData } from "@/features/admin/schedules/shared";
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

describe("AdministrativeEventScheduleDetailView delete", () => {
  const renderer = createReactDomTestRenderer();

  afterEach(() => {
    renderer.cleanup();
    useNavigationMock.mockReset();
  });

  test("confirms the delete through the shared alert dialog", async () => {
    useNavigationMock.mockReturnValue({ state: "idle" });

    await renderDetail();

    expect(document.querySelector('[role="alertdialog"]')).not.toBeNull();
    expect(document.body.textContent).toContain("Eliminar cronograma");
    expect(getButton("Eliminar").disabled).toBe(false);
  });

  test("disables the destructive action while its delete submission is pending", async () => {
    const formData = new FormData();
    formData.set("intent", "delete-schedule");
    formData.set("id", "schedule_1");
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
      ComponentProps<typeof AdministrativeEventScheduleDetailView>
    > = {},
  ) {
    const router = createMemoryRouter(
      [
        {
          path: "/administracion/cronogramas/schedule_1",
          action: async () => null,
          element: (
            <AdministrativeEventScheduleDetailView
              loaderData={buildLoaderData()}
              scheduleId="schedule_1"
              initialDeleteDialogOpen
              {...props}
            />
          ),
        },
      ],
      { initialEntries: ["/administracion/cronogramas/schedule_1"] },
    );

    await renderer.renderAsync(<RouterProvider router={router} />);
  }
});

function buildLoaderData(): AdministrativeEventScheduleDetailLoaderData {
  return {
    selectedEventId: "event_1",
    modalities: [],
    schedules: [
      {
        id: "schedule_1",
        eventId: "event_1",
        name: "Mañana",
        scheduledDate: "2026-10-10",
        startTime: "10:00",
        totalCapacity: 10,
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        modalityIds: [],
        modalities: [],
        occupiedCapacity: 0,
        scheduleCapacities: [],
      },
    ],
  };
}
