import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, test } from "vitest";

import { PortalShell } from "@/components/portal/ui";
import type { PortalEventContext } from "@/lib/portal/event-context";
import { PortalProfileRouteView } from "@/features/portal/profile/view";

describe("PortalProfileRouteView", () => {
  test("renders the academy profile form with access email as read-only", () => {
    const markup = renderProfile();

    expect(markup).toContain("Perfil");
    expect(markup).toContain("Nombre de la academia");
    expect(markup).toContain('name="name" value="Academia de Prueba"');
    expect(markup).toContain('value="Academia de Prueba"');
    expect(markup).toContain(
      "Para cambiar el nombre de la academia o el email de acceso, comunicate con nosotros.",
    );
    expect(markup).toContain("Nombre de contacto");
    expect(markup).toContain('name="contactName" value="Contacto"');
    expect(markup).toContain("Teléfono de contacto");
    expect(markup).toContain(
      'placeholder="Código de área sin 0 y número sin 15"',
    );
    expect(markup).toContain('name="phone" value="1112345678"');
    expect(markup).toContain("Email de acceso");
    expect(markup).toContain('value="portal@example.com"');
    expect(markup).toContain("disabled");
    expect(countOccurrences(markup, "lucide-lock")).toBe(2);
    expect(countOccurrences(markup, "lucide-info")).toBe(1);
    expect(markup).toContain("Guardar");
    expect(markup).toContain("Acciones");
    expect(markup).toContain('form="portal-perfil-form"');
  });
});

type ProfileViewProps = Parameters<typeof PortalProfileRouteView>[0];

function renderProfile(input: Partial<ProfileViewProps> = {}) {
  return renderPortalDataRoute(
    "/portal/perfil",
    renderPortalShellForTest(
      <PortalProfileRouteView
        loaderData={input.loaderData ?? profileLoaderData()}
        actionData={input.actionData}
      />,
    ),
  );
}

function renderPortalDataRoute(path: string, element: ReactNode) {
  const router = createMemoryRouter(
    [
      {
        path,
        action: async () => null,
        element,
      },
    ],
    { initialEntries: [path] },
  );

  return renderToStaticMarkup(<RouterProvider router={router} />);
}

function renderPortalShellForTest(children: ReactNode) {
  return (
    <PortalShell
      userEmail="portal@example.com"
      contactName="Contacto"
      academyName="Academia de Prueba"
      eventContext={portalEventContext()}
      breadcrumbItems={[{ label: "Perfil" }]}
    >
      {children}
    </PortalShell>
  );
}

function profileLoaderData(): ProfileViewProps["loaderData"] {
  return {
    email: "portal@example.com",
    academy: {
      id: "academy_1",
      userId: "user_1",
      name: "Academia de Prueba",
      contactName: "Contacto",
      phone: "1112345678",
    },
  };
}

function portalEventContext(
  overrides: Partial<PortalEventContext> = {},
): PortalEventContext {
  const event = {
    id: "event_1",
    name: "Regional 2026",
    active: true,
    registrationStartsAt: new Date("2026-03-01T12:00:00Z"),
    registrationEndsAt: new Date("2026-04-30T12:00:00Z"),
    startsAt: new Date("2026-05-01T12:00:00Z"),
    endsAt: new Date("2026-05-03T12:00:00Z"),
  };

  return {
    selectedEvent: event,
    activeEvent: event,
    hasActiveEvent: true,
    activeEventRegistrationReadiness: {
      eventId: "event_1",
      isReady: true,
      missingItems: [],
    },
    hasEvents: true,
    isReadOnly: false,
    isRegistrationOpen: true,
    ...overrides,
  };
}

function countOccurrences(value: string, search: string) {
  return value.split(search).length - 1;
}
