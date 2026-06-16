/** @vitest-environment jsdom */

import "@/test/react-test-env";

import { act } from "react";
import { createRoot } from "react-dom/client";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, beforeAll, describe, expect, test } from "vitest";

type PortalCoreografiaDetalleRouteViewComponent =
  typeof import("@/routes/portal.coreografias_.$choreographyId").PortalCoreografiaDetalleRouteView;
type PortalCoreografiaDetalleRouteViewProps =
  Parameters<PortalCoreografiaDetalleRouteViewComponent>[0];

describe("coreografía dancer editor", () => {
  let container: HTMLDivElement | null = null;
  let root: ReturnType<typeof createRoot> | null = null;
  let PortalCoreografiaDetalleRouteView: PortalCoreografiaDetalleRouteViewComponent;

  beforeAll(async () => {
    ({ PortalCoreografiaDetalleRouteView } =
      await import("@/routes/portal.coreografias_.$choreographyId"));
  }, 20_000);

  afterEach(() => {
    if (root) {
      act(() => {
        root?.unmount();
      });
      root = null;
    }

    if (container) {
      container.remove();
      container = null;
    }

    document.body.innerHTML = "";
  });

  test("renders active dancers plus linked archived dancers, excluding archived unlinked records", async () => {
    const router = createMemoryRouter(
      [
        {
          path: "/portal/coreografias/choreo_1",
          action: async () => null,
          element: (
            <PortalCoreografiaDetalleRouteView
              loaderData={buildLoaderData({
                availableDancers: [
                  {
                    id: "dancer_1",
                    firstName: "Luz",
                    lastName: "Activa",
                    active: true,
                  },
                  {
                    id: "dancer_2",
                    firstName: "Mora",
                    lastName: "Archivada",
                    active: false,
                  },
                ],
                choreography: {
                  ...buildLoaderData().choreography,
                  dancers: [
                    {
                      id: "dancer_1",
                      firstName: "Luz",
                      lastName: "Activa",
                      active: true,
                      ageAtEventStart: 14,
                    },
                    {
                      id: "dancer_2",
                      firstName: "Mora",
                      lastName: "Archivada",
                      active: false,
                      ageAtEventStart: 14,
                    },
                  ],
                },
              })}
            />
          ),
        },
      ],
      { initialEntries: ["/portal/coreografias/choreo_1"] },
    );

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(<RouterProvider router={router} />);
    });

    const markup = document.body.innerHTML;

    expect(markup).toContain("Buscar bailarines");
    expect(markup).toContain("Activa, Luz");
    expect(markup).toContain("Archivada, Mora");
    expect(markup).not.toContain("Oculta, Nora");
  });

  test("validates that at least one dancer remains selected before saving", async () => {
    const router = createMemoryRouter(
      [
        {
          path: "/portal/coreografias/choreo_1",
          action: async () => null,
          element: (
            <PortalCoreografiaDetalleRouteView
              loaderData={buildLoaderData({
                availableDancers: [
                  {
                    id: "dancer_1",
                    firstName: "Luz",
                    lastName: "Activa",
                    active: true,
                  },
                ],
                choreography: {
                  ...buildLoaderData().choreography,
                  dancers: [],
                },
              })}
            />
          ),
        },
      ],
      { initialEntries: ["/portal/coreografias/choreo_1"] },
    );

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(<RouterProvider router={router} />);
    });

    const form = document.querySelector("form");

    if (!form) {
      throw new Error("Expected dancer editor form to be rendered.");
    }

    await act(async () => {
      form.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      );
    });

    expect(document.body.textContent).toContain("Este campo es obligatorio.");
  });
});

function buildLoaderData(
  overrides: Partial<PortalCoreografiaDetalleRouteViewProps["loaderData"]> = {},
): PortalCoreografiaDetalleRouteViewProps["loaderData"] {
  const eventSummary = buildEventSummary();

  return {
    availableDancers: [
      {
        id: "dancer_1",
        firstName: "Ana",
        lastName: "Paz",
        active: true,
      },
    ],
    availableProfessors: [],
    choreography: {
      id: "choreo_1",
      name: "Mi Pieza",
      modalityName: "Jazz",
      submodalityName: "Lyrical",
      groupType: "solo",
      categoryName: "Juvenil",
      experienceLevelName: "Inicial",
      operationalStatus: {
        code: "complete",
        pendingItems: [],
      },
      dancerEditingEligibility: {
        canEdit: true,
        reasonCode: null,
        reasonText: null,
      },
      scheduleBlockName: "Bloque mañana",
      scheduleLabel: "2026-05-01 · 10:00",
      dancers: [
        {
          id: "dancer_1",
          firstName: "Ana",
          lastName: "Paz",
          active: true,
          ageAtEventStart: 14,
        },
      ],
      professors: [],
    },
    dancerEditingEligibility: {
      canEdit: true,
      reasonCode: null,
      reasonText: null,
    },
    deletionAvailability: {
      canDelete: false,
      warningMessage: null,
    },
    eventContext: {
      events: [eventSummary],
      selectedEvent: eventSummary,
      activeEvent: eventSummary,
      hasActiveEvent: true,
      activeEventRegistrationReadiness: {
        eventId: eventSummary.id,
        isReady: true,
        missingItems: [],
      },
      hasEvents: true,
      isReadOnly: false,
      isRegistrationOpen: true,
    },
    successMessage: null,
    ...overrides,
  };
}

function buildEventSummary() {
  return {
    id: "event_1",
    name: "Regional 2026",
    active: true,
    registrationStartsAt: new Date("2026-06-01T12:00:00Z"),
    registrationEndsAt: new Date("2026-06-30T12:00:00Z"),
    startsAt: new Date("2026-07-01T12:00:00Z"),
    endsAt: new Date("2026-07-03T12:00:00Z"),
  };
}
