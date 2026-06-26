import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { describe, expect, test } from "vitest";

import {
  PortalCoreographiesSection,
  PortalEmptyListSection,
  PortalShell,
} from "@/components/portal/ui";
import { PortalShellRouteView } from "@/features/portal/shell/view";
import type { PortalEventContext } from "@/lib/portal/event-context";

describe("portal route view", () => {
  test("renders the portal shell", () => {
    const markup = renderPortal({
      eventContext: {
        activeEvent: eventSummary({ name: "Regional 2026" }),
      },
    });

    expect(markup).toContain("Regional 2026");
    expect(markup).toContain("Portal de academias");
    expect(markup).toContain("Inicio");
    expect(markup).not.toContain("Perfil");
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
      },
    });

    expect(markup).toContain("Sin evento");
  });

  test("keeps the shell usable when the active event is not ready", () => {
    const selectedEvent = eventSummary({
      id: "event_active",
      name: "Regional 2026",
      active: true,
      registrationStartsAt: date("2026-01-01T12:00:00Z"),
      registrationEndsAt: date("2026-12-31T12:00:00Z"),
    });

    const markup = renderPortal({
      eventContext: {
        activeEvent: selectedEvent,
      },
    });

    expect(markup).toContain("Regional 2026");
    expect(markup).toContain("Coreografías");
  });

  test("renders shared portal surfaces with shadcn components and semantic tokens", () => {
    const markup = renderToStaticMarkup(
      <>
        <PortalEmptyListSection
          title="Profesores"
          description="Gestioná el plantel docente de tu academia."
          emptyTitle="Todavía no hay profesores"
          emptyDescription="Cuando sumes profesores, van a aparecer en esta sección."
        />
        <PortalCoreographiesSection eventContext={portalEventContext()} />
      </>,
    );

    expect(markup).toContain('data-slot="card"');
    expect(markup).toContain('data-slot="badge"');
    expect(markup).toContain('data-slot="alert"');
    expect(markup).not.toContain("border-slate-200");
    expect(markup).not.toContain("bg-white");
    expect(markup).not.toContain("text-slate-950");
    expect(markup).not.toContain("text-slate-600");
    expect(markup).not.toContain("bg-amber-50");
    expect(markup).not.toContain("bg-emerald-50");
    expect(markup).not.toContain("bg-slate-50");
  });

  test("renders shared coreografía availability states with shadcn alert and badge variants", () => {
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
