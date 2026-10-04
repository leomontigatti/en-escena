/** @vitest-environment jsdom */

import { renderToStaticMarkup } from "react-dom/server";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, test } from "vitest";

import { PortalChoreographiesListRouteView } from "@/features/portal/choreographies/list/view";
import {
  clickReactDomButton,
  createReactDomTestRenderer,
  findButton,
  setInputValue,
  updateReactDomForm,
} from "@/lib/test-support/react-dom";
import type { PortalEventContext } from "@/lib/portal/event-context";

type ChoreographiesListViewProps = Parameters<
  typeof PortalChoreographiesListRouteView
>[0];

describe("PortalChoreographiesListRouteView", () => {
  const renderer = createReactDomTestRenderer();

  afterEach(renderer.cleanup);

  // The button stays enabled whatever blocks it: the click says why, naming
  // each reason (style guide, Detail pages).
  test("answers `Nueva coreografía` with no active dancers with the reason", async () => {
    await renderer.renderAsync(
      <RouterProvider
        router={buildChoreographiesRouter({
          loaderData: choreographiesLoaderData({ activeDancerCount: 0 }),
        })}
      />,
    );

    const button = findButton("Nueva coreografía");

    expect(button?.disabled).toBe(false);

    await clickReactDomButton("Nueva coreografía");

    const dialog = document.querySelector('[role="alertdialog"]');

    expect(dialog?.querySelector("h2")?.textContent).toBe(
      "No podés registrar coreografías",
    );
    expect(dialog?.textContent).toContain(
      "Cargá al menos un bailarín activo antes de registrar coreografías.",
    );
  });

  test("does not expose missing active event bases before creation", () => {
    const selectedEvent = eventSummary({
      id: "event_active",
      name: "Regional 2026",
      active: true,
    });

    const markup = renderChoreographiesList({
      loaderData: choreographiesLoaderData({
        eventContext: {
          selectedEvent,
          activeEvent: selectedEvent,
          hasActiveEvent: true,
          activeEventRegistrationReadiness: readiness(false, [
            {
              code: "price-coverage",
              label: "Precios aplicables",
              detail:
                "Falta un precio aplicable para categoría Juvenil, modalidad Jazz, tipo de grupo Solo.",
            },
          ]),
          hasEvents: true,
          isReadOnly: false,
          isRegistrationOpen: true,
        },
      }),
    });

    expect(markup).toContain("Nueva coreografía");
    expect(markup).not.toContain('disabled=""');
    expect(markup).toContain(
      "No hay coreografías registradas para este evento",
    );
    expect(markup).not.toContain("Creación no disponible");
    expect(markup).not.toContain(
      "Faltan bases del evento antes de registrar coreografías.",
    );
    expect(markup).not.toContain("Precios aplicables");
  });

  // Missing bases are the administration's to fix: the academy reads only
  // that the event is not ready, never which bases are missing.
  test("names missing event bases as a reason without listing them", async () => {
    const selectedEvent = eventSummary({
      id: "event_active",
      name: "Regional 2026",
      active: true,
    });

    await renderer.renderAsync(
      <RouterProvider
        router={buildChoreographiesRouter({
          loaderData: choreographiesLoaderData({
            eventContext: {
              selectedEvent,
              activeEvent: selectedEvent,
              hasActiveEvent: true,
              activeEventRegistrationReadiness: readiness(false, [
                {
                  code: "price-coverage",
                  label: "Precios aplicables",
                  detail: "Falta un precio aplicable.",
                },
              ]),
              hasEvents: true,
              isReadOnly: false,
              isRegistrationOpen: true,
            },
          }),
        })}
      />,
    );

    await clickReactDomButton("Nueva coreografía");

    const dialog = document.querySelector('[role="alertdialog"]');

    expect(dialog?.textContent).toContain(
      "Faltan bases del evento antes de registrar coreografías.",
    );
    expect(dialog?.textContent).not.toContain("Precios aplicables");
    expect(dialog?.textContent).not.toContain("Falta un precio aplicable.");
  });

  test("finds a choreography by its number", async () => {
    const loaderData = choreographiesLoaderData({
      choreographies: [
        choreographyListItem({ id: "choreo_1", name: "Mi Pieza" }),
        choreographyListItem({
          id: "choreo_2",
          choreographyNumber: 2,
          name: "Otra Pieza",
        }),
      ],
    });

    await renderer.renderAsync(
      <RouterProvider router={buildChoreographiesRouter({ loaderData })} />,
    );

    const search = document.querySelector<HTMLInputElement>(
      'input[placeholder="Buscar por número, nombre o modalidad"]',
    );

    if (!search) {
      throw new Error(
        "Expected the choreographies search input to be rendered.",
      );
    }

    // Typed without the padding zeros, the way somebody reads a number off a
    // screen. The box filters one column, so this only passes while the number
    // travels inside that column's filter value.
    await updateReactDomForm(() => {
      setInputValue(search, "2");
    });

    const text = document.body.textContent ?? "";

    expect(text).toContain("Otra Pieza");
    expect(text).not.toContain("Mi Pieza");
  });

  // The academy's list is about what its choreographies still need before the
  // event; one that is not taking part has nothing left to need.
  test("leaves a withdrawn choreography out until `Retirada` is picked", () => {
    const loaderData = choreographiesLoaderData({
      choreographies: [
        choreographyListItem({ id: "choreo_1", name: "Mi Pieza" }),
        choreographyListItem({
          id: "choreo_2",
          choreographyNumber: 2,
          isWithdrawn: true,
          name: "Pieza Retirada",
        }),
      ],
    });

    const unfiltered = renderChoreographiesList({ loaderData });
    const withdrawnOnly = renderChoreographiesList(
      { loaderData },
      "/portal/coreografias?estado=retirada",
    );
    const complete = renderChoreographiesList(
      { loaderData },
      "/portal/coreografias?estado=complete",
    );

    expect(unfiltered).toContain("Mi Pieza");
    expect(unfiltered).not.toContain("Pieza Retirada");
    expect(withdrawnOnly).toContain("Pieza Retirada");
    expect(withdrawnOnly).not.toContain("Mi Pieza");
    // The withdrawal axis wins over the readiness one: the withdrawn row is
    // complete, and `Completa` still does not turn it up.
    expect(complete).toContain("Mi Pieza");
    expect(complete).not.toContain("Pieza Retirada");
  });

  test("badges a withdrawn row `Retirada` in place of its operational status", () => {
    const markup = renderChoreographiesList(
      {
        loaderData: choreographiesLoaderData({
          choreographies: [
            choreographyListItem({
              id: "choreo_2",
              isWithdrawn: true,
              name: "Pieza Retirada",
            }),
          ],
        }),
      },
      "/portal/coreografias?estado=retirada",
    );

    expect(markup).toContain("Retirada");
    expect(markup).not.toContain("Completa");
  });

  test("links each row to its detail from the name, not the number", () => {
    const markup = renderChoreographiesList({
      loaderData: choreographiesLoaderData({
        choreographies: [choreographyListItem({ name: "Mi Pieza" })],
      }),
    });

    expect(markup).toContain('href="/portal/coreografias/choreo_1"');
    expect(markup).toContain(">Mi Pieza</a>");
    expect(markup).not.toContain(">00001</a>");
  });

  test("links `Nueva coreografía` to the registration page for the active editable event", () => {
    const markup = renderChoreographiesList();

    expect(markup).toContain("Nueva coreografía");
    expect(markup).toContain('href="/portal/coreografias/crear"');
    expect(markup).not.toContain('disabled=""');
    expect(markup).toContain(
      "Gestioná las coreografías de tu academia que van a participar del evento y seguí su estado operativo.",
    );
  });
});

function renderChoreographiesList(
  input: Partial<ChoreographiesListViewProps> = {},
  initialEntry = "/portal/coreografias",
) {
  return renderToStaticMarkup(
    <RouterProvider router={buildChoreographiesRouter(input, initialEntry)} />,
  );
}

function buildChoreographiesRouter(
  input: Partial<ChoreographiesListViewProps> = {},
  initialEntry = "/portal/coreografias",
) {
  const loaderData = input.loaderData ?? choreographiesLoaderData();
  const router = createMemoryRouter(
    [
      {
        path: "/portal/coreografias",
        action: async () => null,
        element: (
          <PortalChoreographiesListRouteView
            created={input.created}
            loaderData={loaderData}
          />
        ),
      },
    ],
    { initialEntries: [initialEntry] },
  );

  return router;
}

function choreographiesLoaderData({
  choreographies = [],
  activeDancerCount = 1,
  eventContext = portalEventContext(),
}: {
  choreographies?: ChoreographiesListViewProps["loaderData"]["choreographies"];
  activeDancerCount?: ChoreographiesListViewProps["loaderData"]["activeDancerCount"];
  eventContext?: ChoreographiesListViewProps["loaderData"]["eventContext"];
} = {}) {
  return {
    choreographies,
    activeDancerCount,
    eventContext,
  };
}

function choreographyListItem(
  overrides: Partial<
    ChoreographiesListViewProps["loaderData"]["choreographies"][number]
  > = {},
) {
  return {
    id: "choreo_1",
    choreographyNumber: 1,
    name: "Coreografía",
    modalityName: "Jazz",
    submodalityName: null,
    groupType: "solo" as const,
    categoryName: "Juvenil",
    experienceLevelName: "Inicial",
    isWithdrawn: false,
    operationalStatus: {
      code: "complete" as const,
      pendingItems: [],
    },
    ...overrides,
  };
}

function eventSummary(
  overrides: Partial<
    NonNullable<
      ChoreographiesListViewProps["loaderData"]["eventContext"]["selectedEvent"]
    >
  > = {},
) {
  return {
    id: "event_1",
    name: "Regional 2026",
    active: true,
    startsAt: date("2026-05-01T12:00:00Z"),
    endsAt: date("2026-05-03T12:00:00Z"),
    ...overrides,
  };
}

function portalEventContext(
  overrides: Partial<PortalEventContext> = {},
): PortalEventContext {
  const event = eventSummary();

  return {
    selectedEvent: event,
    activeEvent: event,
    hasActiveEvent: true,
    activeEventRegistrationReadiness: readiness(true),
    hasEvents: true,
    isReadOnly: false,
    isRegistrationOpen: true,
    ...overrides,
  };
}

function readiness(
  isReady: boolean,
  missingItems: NonNullable<
    ChoreographiesListViewProps["loaderData"]["eventContext"]["activeEventRegistrationReadiness"]
  >["missingItems"] = [],
) {
  return {
    eventId: "event_1",
    isReady,
    missingItems,
  };
}

function date(value: string) {
  return new Date(value);
}
