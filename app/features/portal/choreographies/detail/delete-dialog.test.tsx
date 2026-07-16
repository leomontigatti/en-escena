// @vitest-environment jsdom

import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, test } from "vitest";

import { PortalChoreographyDetailRouteView } from "@/features/portal/choreographies/detail/view";
import { createReactDomTestRenderer } from "@/lib/test-support/react-dom";

type PortalChoreographyDetailRouteViewProps = Parameters<
  typeof PortalChoreographyDetailRouteView
>[0];

describe("PortalChoreographyDetailRouteView removed delete dialog", () => {
  const renderer = createReactDomTestRenderer();

  afterEach(renderer.cleanup);

  test("does not mount the delete confirmation dialog from the portal detail", async () => {
    const router = createMemoryRouter(
      [
        {
          path: "/portal/coreografias/choreo_1",
          action: async () => null,
          element: (
            <PortalChoreographyDetailRouteView loaderData={buildLoaderData()} />
          ),
        },
      ],
      { initialEntries: ["/portal/coreografias/choreo_1"] },
    );

    await renderer.renderAsync(<RouterProvider router={router} />);

    expect(document.body.textContent).not.toContain("¿Eliminar coreografía?");
    expect(document.body.textContent).not.toContain("Eliminar coreografía");
  });
});

function buildLoaderData(
  overrides: Partial<PortalChoreographyDetailRouteViewProps["loaderData"]> = {},
): PortalChoreographyDetailRouteViewProps["loaderData"] {
  const eventSummary = {
    id: "event_1",
    name: "Regional 2026",
    active: true,
    registrationStartsAt: new Date("2026-01-01T12:00:00Z"),
    registrationEndsAt: new Date("2026-12-31T12:00:00Z"),
    startsAt: new Date("2026-05-01T12:00:00Z"),
    endsAt: new Date("2026-05-03T12:00:00Z"),
  };

  return {
    choreography: {
      id: "choreo_1",
      name: "Danza lunar",
      modalityName: "Jazz",
      submodalityName: "Lyrical",
      categoryId: "category_1",
      categoryName: "Juvenil",
      groupType: "solo",
      experienceLevelId: "level_1",
      experienceLevelName: "Inicial",
      operationalStatus: {
        code: "complete",
        pendingItems: [],
      },
      musicStorageKey: "music/choreo_1.mp3",
      musicDownloadUrl: null,
      scheduleCapacityId: "schedule_capacity_1",
      scheduleName: "Bloque tarde",
      scheduleLabel: "Bloque tarde · 01/05/2026 · 14:00",
      dancers: [
        {
          id: "dancer_1",
          firstName: "Ana",
          lastName: "Paz",
          active: true,
          ageAtEventStart: 12,
        },
      ],
      professors: [
        {
          id: "professor_1",
          firstName: "Luz",
          lastName: "Suárez",
          active: true,
        },
      ],
      hasPresentation: false,
    },
    eventContext: {
      selectedEvent: eventSummary,
      activeEvent: eventSummary,
      hasActiveEvent: true,
      hasEvents: true,
      isReadOnly: false,
      isRegistrationOpen: false,
      activeEventRegistrationReadiness: null,
    },
    ...overrides,
  };
}
