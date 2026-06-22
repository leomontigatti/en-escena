// @vitest-environment jsdom

import "@/test/react-test-env";

import { act } from "react";
import { createRoot } from "react-dom/client";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, beforeAll, describe, expect, test } from "vitest";

type PortalCoreografiaDetalleRouteViewComponent =
  typeof import("@/routes/portal.coreografias_.$choreographyId").PortalCoreografiaDetalleRouteView;
type PortalCoreografiaDetalleRouteViewProps =
  Parameters<PortalCoreografiaDetalleRouteViewComponent>[0];

describe("PortalCoreografiaDetalleRouteView delete dialog", () => {
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

    container?.remove();
    container = null;
    document.body.innerHTML = "";
  });

  test("unmounts the delete confirmation dialog after canceling it", async () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    const router = createMemoryRouter(
      [
        {
          path: "/portal/coreografias/choreo_1",
          action: async () => null,
          element: (
            <PortalCoreografiaDetalleRouteView
              initialDeleteDialogOpen
              loaderData={buildLoaderData()}
            />
          ),
        },
      ],
      { initialEntries: ["/portal/coreografias/choreo_1"] },
    );

    await act(async () => {
      root?.render(<RouterProvider router={router} />);
    });

    expect(document.body.textContent).toContain("¿Eliminar Coreografía?");
    expect(document.body.textContent).toContain(
      "Si eliminás esta Coreografía con la inscripción cerrada, quizá no puedas registrarla nuevamente salvo ajuste administrativo.",
    );

    await clickButton("Cancelar");

    expect(document.body.textContent).not.toContain("¿Eliminar Coreografía?");
  });
});

function clickButton(label: string) {
  const button = Array.from(document.querySelectorAll("button")).find(
    (candidate) =>
      candidate.textContent?.trim() === label ||
      candidate.getAttribute("aria-label") === label,
  );

  if (!button) {
    throw new Error(`No button found for label "${label}".`);
  }

  return act(async () => {
    button.dispatchEvent(
      new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
      }),
    );
  });
}

function buildLoaderData(
  overrides: Partial<PortalCoreografiaDetalleRouteViewProps["loaderData"]> = {},
): PortalCoreografiaDetalleRouteViewProps["loaderData"] {
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
    availableDancers: [
      {
        id: "dancer_1",
        firstName: "Ana",
        lastName: "Paz",
        active: true,
      },
    ],
    availableProfessors: [
      {
        id: "professor_1",
        firstName: "Luz",
        lastName: "Suárez",
        active: true,
      },
    ],
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
      scheduleCapacityId: "schedule_capacity_1",
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
      dancerEditingEligibility: {
        canEdit: true,
        reasonCode: null,
        reasonText: null,
      },
      hasPresentation: false,
    },
    dancerEditingEligibility: {
      canEdit: true,
      reasonCode: null,
      reasonText: null,
    },
    deletionAvailability: {
      canDelete: true,
      warningMessage:
        "Si eliminás esta Coreografía con la inscripción cerrada, quizá no puedas registrarla nuevamente salvo ajuste administrativo.",
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
    successMessage: null,
    ...overrides,
  };
}
