import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { describe, expect, test, vi } from "vitest";

vi.mock("@/lib/internal-access.server", () => ({
  requireAcademyUser: vi.fn(),
}));

import { PortalRouteView } from "@/routes/portal";

describe("portal route view", () => {
  test("shows a clear no-event state while keeping academy areas available", () => {
    const markup = renderPortal({
      eventContext: {
        queryParamName: "evento",
        events: [],
        selectedEvent: null,
        hasEvents: false,
        isReadOnly: true,
        isRegistrationOpen: false,
      },
    });

    expect(markup).toContain("Todavía no hay Eventos configurados");
    expect(markup).toContain("Profesores");
    expect(markup).toContain("Bailarines");
  });

  test("shows all-event selector data and read-only empty state for a non-active Evento", () => {
    const selectedEvent = eventSummary({
      id: "event_2025",
      name: "Regional 2025",
      active: false,
    });

    const markup = renderPortal({
      eventContext: {
        queryParamName: "evento",
        events: [
          eventSummary({ id: "event_2026", name: "Regional 2026" }),
          selectedEvent,
        ],
        selectedEvent,
        hasEvents: true,
        isReadOnly: true,
        isRegistrationOpen: false,
      },
    });

    expect(markup).toContain('name="evento"');
    expect(markup).toContain('value="event_2026"');
    expect(markup).toContain('value="event_2025" selected="">');
    expect(markup).toContain("Solo lectura");
    expect(markup).toContain(
      "No hay coreografías registradas para este evento",
    );
    expect(markup).toContain(
      "La creación de coreografías va a estar disponible solo cuando el Evento consultado sea el Evento activo y la inscripción esté abierta.",
    );
  });

  test("distinguishes an active Evento with open registration as editable", () => {
    const selectedEvent = eventSummary({
      id: "event_active",
      name: "Regional 2026",
      active: true,
      registrationStartsAt: date("2026-01-01T12:00:00Z"),
      registrationEndsAt: date("2026-12-31T12:00:00Z"),
    });

    const markup = renderPortal({
      eventContext: {
        queryParamName: "evento",
        events: [selectedEvent],
        selectedEvent,
        hasEvents: true,
        isReadOnly: false,
        isRegistrationOpen: true,
      },
    });

    expect(markup).toContain("Contexto editable");
    expect(markup).toContain(
      "La creación de coreografías va a estar disponible para este Evento mientras la inscripción esté abierta.",
    );
  });
});

type PortalLoaderData = Parameters<typeof PortalRouteView>[0]["loaderData"];

function renderPortal(input: {
  eventContext: PortalLoaderData["eventContext"];
}) {
  const loaderData = {
    email: "portal@example.com",
    academy: {
      id: "academy_1",
      userId: "user_1",
      name: "Academia de Prueba",
      contactName: "Contacto",
      phone: "11 1234-5678",
    },
    eventContext: input.eventContext,
  } satisfies PortalLoaderData;

  return renderToStaticMarkup(
    <MemoryRouter initialEntries={["/portal"]}>
      <PortalRouteView loaderData={loaderData} />
    </MemoryRouter>,
  );
}

function eventSummary(
  overrides: Partial<
    NonNullable<PortalLoaderData["eventContext"]["selectedEvent"]>
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

function date(value: string) {
  return new Date(value);
}
