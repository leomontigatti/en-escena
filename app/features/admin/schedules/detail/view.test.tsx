/** @vitest-environment jsdom */

import type { ComponentProps } from "react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, test, vi } from "vitest";

import { EventScheduleDetailView } from "@/features/admin/schedules/detail/view";
import type { EventScheduleDetailLoaderData } from "@/features/admin/schedules/shared";
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

describe("EventScheduleDetailView", () => {
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

  // The form plans against what is left: the total capacity and each split
  // capacity say how many places are still free, not just how much was shared out.
  test("shows how many lugares are left for the schedule and for each capacity", async () => {
    useNavigationMock.mockReturnValue({ state: "idle" });

    await renderDetail({
      initialDeleteDialogOpen: false,
      loaderData: buildOccupiedLoaderData(),
    });

    // Read-only decoration inside the control, right after the number.
    expect(document.body.textContent).toContain(" / 4 disponibles");
    expect(document.body.textContent).toContain(" / 2 disponibles");
    // Never as a field description: that slot sits between the label and the
    // control, and pushed every capacity out of line with its group type select.
    expect(
      document.querySelectorAll('[data-slot="field-description"]'),
    ).toHaveLength(0);
    // The suffix is aria-hidden, so the accessible name spells the count out.
    expect(
      document.querySelector('label[for="schedule-capacity-capacity-0"]')
        ?.textContent,
    ).toBe("Cupo. Quedan 2 de 6 lugares.");
    expect(
      document.querySelector("#totalCapacity")?.getAttribute("aria-label"),
    ).toBe("Cupo total. Quedan 4 de 10 lugares.");
  });

  test("leads the footer with Volver and its chevron, opposite Guardar", async () => {
    useNavigationMock.mockReturnValue({ state: "idle" });

    await renderDetail({ initialDeleteDialogOpen: false });

    const volver = document.querySelector(
      'a[href*="/administracion/cronogramas"]',
    );
    const actions = volver?.closest("div");

    expect(volver?.textContent).toContain("Volver");
    expect(volver?.querySelector("svg")).not.toBeNull();
    expect(actions?.className).toContain("justify-between");
    expect(actions?.firstElementChild?.textContent).toContain("Volver");
  });

  async function renderDetail(
    props: Partial<ComponentProps<typeof EventScheduleDetailView>> = {},
  ) {
    const router = createMemoryRouter(
      [
        {
          path: "/administracion/cronogramas/schedule_1",
          action: async () => null,
          element: (
            <EventScheduleDetailView
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

function buildLoaderData(): EventScheduleDetailLoaderData {
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
        availablePlaces: 10,
        occupiedCount: 0,
        scheduleCapacities: [],
      },
    ],
  };
}

function buildOccupiedLoaderData(): EventScheduleDetailLoaderData {
  const loaderData = buildLoaderData();
  const [schedule] = loaderData.schedules;

  return {
    ...loaderData,
    schedules: [
      {
        ...schedule,
        availablePlaces: 4,
        occupiedCount: 6,
        scheduleCapacities: [
          {
            id: "schedule_capacity_1",
            scheduleId: schedule.id,
            groupType: "solo",
            capacity: 6,
            createdAt: new Date("2026-01-01T00:00:00.000Z"),
            availablePlaces: 2,
            occupiedCount: 4,
          },
        ],
      },
    ],
  };
}
