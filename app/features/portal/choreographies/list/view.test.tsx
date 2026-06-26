import { renderToStaticMarkup } from "react-dom/server";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, test } from "vitest";

import { PortalChoreographiesListRouteView } from "@/features/portal/choreographies/list/view";
import type { PortalEventContext } from "@/lib/portal/event-context";

type ChoreographiesListViewProps = Parameters<
  typeof PortalChoreographiesListRouteView
>[0];

describe("PortalChoreographiesListRouteView", () => {
  test("shows the agreed columns for the active event", () => {
    const selectedEvent = eventSummary({
      id: "event_2025",
      name: "Regional 2025",
      active: false,
    });

    const markup = renderChoreographiesList({
      loaderData: choreographiesLoaderData({
        choreographies: [
          choreographyListItem({
            id: "choreo_1",
            name: "Mi Pieza",
            submodalityName: "Lyrical",
            groupType: "grupal",
            categoryName: "Juvenil",
            experienceLevelName: "Inicial",
            operationalStatus: {
              code: "incomplete",
              pendingItems: ["music"],
            },
          }),
          choreographyListItem({
            id: "choreo_2",
            name: "Otra Pieza",
            modalityName: "Folklore",
            groupType: "duo",
            categoryName: "Adultos",
          }),
        ],
        eventContext: {
          selectedEvent,
          activeEvent: selectedEvent,
          hasActiveEvent: true,
          activeEventRegistrationReadiness: readiness(true),
          hasEvents: true,
          isReadOnly: false,
          isRegistrationOpen: false,
        },
      }),
    });

    for (const columnLabel of [
      "Nombre",
      "Modalidad / Submodalidad",
      "Categoría / Tipo de grupo",
      "Estado",
    ]) {
      expect(markup).toContain(columnLabel);
    }

    expect(markup).not.toContain("Evento consultado");
    expect(markup).toContain("Mi Pieza");
    expect(markup).toContain(
      "Buscar coreografía por nombre, modalidad o categoría",
    );
    expect(markup).toContain("Filtros");
    expect(markup).toContain("2 de 2 registros");
    expect(markup).toContain("Jazz · Lyrical");
    expect(markup).toContain("Folklore");
    expect(markup).toContain("Juvenil · Grupal");
    expect(markup).toContain("Adultos · Dúo");
    expect(markup).toContain("Incompleta");
    expect(markup).toContain('data-variant="warning"');
    expect(markup).toContain('data-variant="success"');
    expect(markup).toContain("Nueva coreografía");
    expect(markup).toContain('disabled=""');
    expect(markup).toContain('href="/portal/coreografias/choreo_1"');
  });

  test("disables Nueva coreografía when there are no bailarines activos", () => {
    const markup = renderChoreographiesList({
      loaderData: choreographiesLoaderData({
        activeDancerCount: 0,
      }),
    });

    expect(markup).toContain("Nueva coreografía");
    expect(markup).toContain('disabled=""');
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
    expect(markup).toContain('disabled=""');
    expect(markup).toContain(
      "No hay coreografías registradas para este evento",
    );
    expect(markup).not.toContain("Creación no disponible");
    expect(markup).not.toContain(
      "Faltan bases del evento antes de registrar coreografías.",
    );
    expect(markup).not.toContain("Precios aplicables");
  });

  test("keeps Coreografías visible without an active event", () => {
    const markup = renderChoreographiesList({
      loaderData: choreographiesLoaderData({
        eventContext: {
          selectedEvent: null,
          activeEvent: null,
          hasActiveEvent: false,
          activeEventRegistrationReadiness: null,
          hasEvents: false,
          isReadOnly: true,
          isRegistrationOpen: false,
        },
      }),
    });

    expect(markup).toContain("Coreografías");
    expect(markup).toContain("Todavía no hay eventos configurados");
  });

  test("shows the enabled Nueva coreografía button for the active editable event", () => {
    const markup = renderChoreographiesList();

    expect(markup).toContain("Nueva coreografía");
    expect(markup).not.toContain('disabled=""');
    expect(markup).toContain(
      "Gestioná las coreografías de tu academia que van a participar del evento y seguí su estado operativo.",
    );
  });

  test("shows the delete success notice", () => {
    const markup = renderChoreographiesList({
      deleted: true,
    });

    expect(markup).toContain("La coreografía se eliminó correctamente.");
  });
});

function renderChoreographiesList(
  input: Partial<ChoreographiesListViewProps> = {},
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
            deleted={input.deleted}
            initialCreateDialogOpen={input.initialCreateDialogOpen}
            loaderData={loaderData}
          />
        ),
      },
      {
        path: "/portal/coreografias/crear",
        loader: async () => ({
          eventId: loaderData.eventContext.selectedEvent?.id ?? "event_1",
          activeDancers: [],
          activeProfessors: [],
          registrationBaseOptions: {
            modalities: [{ id: "modality_1", name: "Jazz" }],
            submodalities: [
              {
                id: "submodality_1",
                name: "Lyrical",
                modalityId: "modality_1",
              },
            ],
          },
        }),
        element: null,
      },
    ],
    { initialEntries: ["/portal/coreografias"] },
  );

  return renderToStaticMarkup(<RouterProvider router={router} />);
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
    name: "Coreografía",
    modalityName: "Jazz",
    submodalityName: null,
    groupType: "solo" as const,
    categoryName: "Juvenil",
    experienceLevelName: "Inicial",
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
    registrationStartsAt: date("2026-03-01T12:00:00Z"),
    registrationEndsAt: date("2026-04-30T12:00:00Z"),
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
