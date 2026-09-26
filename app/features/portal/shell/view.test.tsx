import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { describe, expect, test } from "vitest";

import {
  PortalCoreographiesSection,
  PortalShell,
} from "@/components/portal/ui";
import { PortalShellRouteView } from "@/features/portal/shell/view";
import type { PortalEventContext } from "@/lib/portal/event-context";

describe("portal route view", () => {
  test("renders the portal shell", () => {
    const markup = renderPortal({
      eventContext: {
        activeEvent: eventSummary({ name: "Regional 2026" }),
        isRegistrationOpen: true,
      },
    });

    expect(markup).toContain("Regional 2026");
    expect(markup).toContain("Portal de academias");
    expect(markup).toContain("Inicio");
    expect(markup).not.toContain("Perfil");
    expect(markup).toContain("Finanzas");
    expect(markup).toContain("Resumen");
    expect(markup).toContain('href="/portal/finanzas"');
    expect(markup).not.toContain('href="/administracion/finanzas"');
    expect(markup).toContain("Profesores");
    expect(markup).toContain("Bailarines");
    expect(markup).toContain("Coreografías");
    expect(markup.indexOf("Inicio")).toBeLessThan(markup.indexOf("Profesores"));
    expect(markup.indexOf("Profesores")).toBeLessThan(
      markup.indexOf("Bailarines"),
    );
    expect(markup.indexOf("Bailarines")).toBeLessThan(
      markup.indexOf("Coreografías"),
    );
    expect(markup.indexOf("Coreografías")).toBeLessThan(
      markup.indexOf("Finanzas"),
    );
    expect(markup).toContain("Saltar al contenido principal");
    expect(markup).toContain("Inicio");
    expect(markup).toContain("Contacto");
    expect(markup).toContain("Academia de Prueba");
    expect(markup).not.toContain("Teléfono");
  });

  test("shows the shell no-active-event state", () => {
    const markup = renderPortal({
      eventContext: {
        activeEvent: null,
        isRegistrationOpen: false,
      },
    });

    expect(markup).toContain("Sin evento");
  });

  test("states in the shell whether the inscriptions are open", () => {
    const openMarkup = renderPortal({
      eventContext: {
        activeEvent: eventSummary(),
        isRegistrationOpen: true,
      },
    });

    expect(openMarkup).not.toContain("Las inscripciones están cerradas.");

    const closedMarkup = renderPortal({
      eventContext: {
        activeEvent: eventSummary(),
        isRegistrationOpen: false,
      },
    });

    expect(closedMarkup).toContain("Las inscripciones están cerradas.");
  });

  test("renders shared choreography availability states with shadcn alert and badge variants", () => {
    const readyMarkup = renderToStaticMarkup(
      <PortalCoreographiesSection eventContext={portalEventContext()} />,
    );

    expect(readyMarkup).toContain('data-slot="alert"');
    expect(readyMarkup).toContain('data-variant="success"');
    expect(readyMarkup).toContain(">Disponible<");

    const blockedMarkup = renderToStaticMarkup(
      <PortalCoreographiesSection
        eventContext={portalEventContext({
          activeEventRegistrationReadiness: readiness(false),
        })}
      />,
    );

    expect(blockedMarkup).toContain('data-slot="alert"');
    expect(blockedMarkup).toContain(">Bloqueado<");
    expect(blockedMarkup).toContain('data-variant="warning"');

    const infoMarkup = renderToStaticMarkup(
      <PortalCoreographiesSection
        eventContext={portalEventContext({
          isReadOnly: true,
          isRegistrationOpen: false,
        })}
      />,
    );

    expect(infoMarkup).toContain('data-slot="alert"');
    expect(infoMarkup).toContain(">Información<");
    expect(infoMarkup).toContain('data-variant="info"');
  });
});

type PortalLoaderData = Parameters<
  typeof PortalShellRouteView
>[0]["loaderData"];

function renderPortal(input: {
  eventContext: Parameters<typeof PortalShell>[0]["eventContext"];
}) {
  const loaderData = {
    email: "portal@example.com",
    academy: {
      id: "academy_1",
      userId: "user_1",
      name: "Academia de Prueba",
      contactName: "Contacto",
      phone: "1112345678",
    },
    eventContext: input.eventContext,
  } satisfies PortalLoaderData;

  return renderToStaticMarkup(
    <MemoryRouter initialEntries={["/portal"]}>
      <PortalShell
        userEmail={loaderData.email}
        contactName={loaderData.academy.contactName}
        academyName={loaderData.academy.name}
        eventContext={loaderData.eventContext}
        breadcrumbItems={[{ label: "Inicio" }]}
      >
        <></>
      </PortalShell>
    </MemoryRouter>,
  );
}

function eventSummary(
  overrides: Partial<NonNullable<PortalEventContext["selectedEvent"]>> = {},
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

function date(value: string) {
  return new Date(value);
}

function readiness(
  isReady: boolean,
  missingItems: NonNullable<
    PortalEventContext["activeEventRegistrationReadiness"]
  >["missingItems"] = [],
) {
  return {
    eventId: "event_1",
    isReady,
    missingItems,
  };
}
