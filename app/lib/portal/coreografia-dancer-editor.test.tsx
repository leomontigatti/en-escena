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

  test("shows schedule guidance from the initial dancer resolution", async () => {
    const router = createMemoryRouter(
      [
        {
          path: "/portal/coreografias/choreo_1",
          action: async () => null,
          element: (
            <PortalCoreografiaDetalleRouteView
              loaderData={buildLoaderData()}
              initialDancerResolution={{
                ok: true,
                resolution: {
                  groupType: "duo",
                  categoryId: "category_2",
                  categoryName: "Adultos",
                  experienceLevel: {
                    required: false,
                    options: [],
                  },
                  schedule: {
                    status: "auto",
                    canSave: true,
                    selectedScheduleEntryId: "schedule_2",
                    options: [
                      {
                        id: "schedule_2",
                        capacity: 3,
                        groupTypes: ["duo"],
                        groupTypeKey: "duo",
                        scheduleBlock: {
                          id: "block_2",
                          name: "Bloque tarde",
                          scheduledDate: "2026-05-01",
                          startTime: "14:00",
                        },
                      },
                    ],
                  },
                },
              }}
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

    const saveButton = Array.from(
      document.querySelectorAll<HTMLButtonElement>("button"),
    ).find((node) => node.textContent?.includes("Guardar bailarines"));

    expect(saveButton).toBeInstanceOf(HTMLButtonElement);
    expect(saveButton?.disabled).toBe(false);
    expect(document.body.textContent).toContain("Solo");
    expect(document.body.textContent).toContain("Juvenil");
    expect(document.body.textContent).toContain(
      "El cronograma compatible se selecciona automáticamente.",
    );
  });

  test("shows the required level field and blocks submit until selected", async () => {
    let saveCalls = 0;
    const router = createMemoryRouter(
      [
        {
          path: "/portal/coreografias/choreo_1",
          action: async ({ request }) => {
            const formData = await request.formData();

            if (formData.get("intent") === "update-choreography-dancers") {
              saveCalls += 1;
            }

            return null;
          },
          element: (
            <PortalCoreografiaDetalleRouteView
              loaderData={buildLoaderData({
                choreography: {
                  ...buildLoaderData().choreography,
                  experienceLevelId: null,
                  experienceLevelName: null,
                  operationalStatus: {
                    code: "incomplete",
                    pendingItems: ["experienceLevel"],
                  },
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

    expect(document.body.textContent).toContain("Nivel de experiencia");

    const experienceLevelInput = document.querySelector<HTMLInputElement>(
      'input[name="experienceLevelId"]',
    );
    const form = document.querySelector("form");

    expect(experienceLevelInput?.value ?? "").toBe("");

    if (!(form instanceof HTMLFormElement)) {
      throw new Error("Expected dancer editor form to be rendered.");
    }

    await act(async () => {
      form.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      );
    });

    expect(document.body.textContent).toContain("Este campo es obligatorio.");
    expect(saveCalls).toBe(0);
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
      categoryId: "category_1",
      categoryName: "Juvenil",
      experienceLevelId: "level_1",
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
      scheduleEntryId: "schedule_1",
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
